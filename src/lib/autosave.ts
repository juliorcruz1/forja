/**
 * Autosave for free-text fields (Diario, Revisión semanal).
 *
 * - Every change is merged into a pending patch and saved after a short delay.
 * - flush() saves right away (Guardar button, blur, app hidden, pagehide, leaving the screen).
 * - Each change is also copied synchronously to localStorage (a "draft"), so text typed
 *   right before iOS kills the app is recovered on the next open. The draft is removed
 *   once the save completes.
 * - A failed save keeps the text pending and reports state "error" until retry() works.
 */

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'pending' } // typed, waiting for the delay
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error' };

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AutoSaverOptions<P extends object> {
  save: (patch: Partial<P>) => Promise<void>;
  /** Delay after the last keystroke (ms). */
  delay?: number;
  /** localStorage key for the crash-safe draft. */
  draftKey?: string;
  storage?: DraftStorage | null;
  /** Last time the stored record was saved (shows "Guardado ✓ hh:mm" when the screen opens). */
  savedAt?: Date;
  now?: () => Date;
}

interface Draft<P> {
  patch: Partial<P>;
  at: number;
}

const live = new Set<AutoSaver<object>>();

function defaultStorage(): DraftStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export class AutoSaver<P extends object> {
  private pending: Partial<P> = {};
  private hasPending = false;
  private inFlight = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<boolean> = Promise.resolve(true);
  private listeners = new Set<() => void>();
  private attached = 0;
  private readonly opts: AutoSaverOptions<P>;
  private readonly storage: DraftStorage | null;
  state: SaveState;

  constructor(opts: AutoSaverOptions<P>) {
    this.opts = opts;
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    this.state = opts.savedAt ? { kind: 'saved', at: opts.savedAt } : { kind: 'idle' };
  }

  /** True while there is text not yet confirmed as saved. */
  get unsaved() {
    return this.hasPending || this.inFlight > 0;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  /** The stored record was last saved at `at` (shown until something new is typed). */
  noteStored(at: Date | undefined) {
    if (at && this.state.kind === 'idle' && !Number.isNaN(at.getTime())) this.set({ kind: 'saved', at });
  }

  private set(state: SaveState) {
    this.state = state;
    this.listeners.forEach((l) => l());
  }

  private now() {
    return this.opts.now ? this.opts.now() : new Date();
  }

  private writeDraft() {
    if (!this.storage || !this.opts.draftKey) return;
    try {
      const d: Draft<P> = { patch: this.pending, at: this.now().getTime() };
      this.storage.setItem(this.opts.draftKey, JSON.stringify(d));
    } catch {
      /* storage full or blocked: the normal save still runs */
    }
  }

  private clearDraft() {
    if (!this.storage || !this.opts.draftKey) return;
    try {
      this.storage.removeItem(this.opts.draftKey);
    } catch {
      /* ignore */
    }
  }

  /**
   * A draft left by a save that never finished (app closed, failure). Only returned when it is
   * newer than the stored record.
   */
  readDraft(storedUpdatedAt?: string): Partial<P> | undefined {
    if (!this.storage || !this.opts.draftKey) return undefined;
    try {
      const raw = this.storage.getItem(this.opts.draftKey);
      if (!raw) return undefined;
      const d = JSON.parse(raw) as Draft<P>;
      if (!d || typeof d !== 'object' || !d.patch) return undefined;
      if (storedUpdatedAt && Date.parse(storedUpdatedAt) > d.at) {
        this.clearDraft();
        return undefined;
      }
      return d.patch;
    } catch {
      return undefined;
    }
  }

  /** Record a change; it is saved after the delay (or sooner by flush). */
  change(patch: Partial<P>) {
    this.pending = { ...this.pending, ...patch };
    this.hasPending = true;
    this.writeDraft();
    live.add(this as AutoSaver<object>);
    if (this.state.kind !== 'pending') this.set({ kind: 'pending' });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.opts.delay ?? 700);
  }

  /** Save now. Resolves true when everything typed so far is stored. */
  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.queue = this.queue.then(() => this.run());
    return this.queue;
  }

  retry() {
    return this.flush();
  }

  private async run(): Promise<boolean> {
    if (!this.hasPending) {
      // Nothing new: confirm the last state (e.g. the Guardar button with no changes).
      if (this.state.kind === 'error') return false;
      return true;
    }
    const patch = this.pending;
    this.pending = {};
    this.hasPending = false;
    this.inFlight++;
    this.set({ kind: 'saving' });
    try {
      await this.opts.save(patch);
      this.inFlight--;
      if (this.hasPending) {
        // More typing happened while saving; keep the draft and let the timer/flush save it.
        this.set({ kind: 'pending' });
      } else {
        this.clearDraft();
        this.set({ kind: 'saved', at: this.now() });
        if (!this.attached) live.delete(this as AutoSaver<object>);
      }
      return true;
    } catch {
      this.inFlight--;
      // Put the text back (newer typing wins) so a retry saves it.
      this.pending = { ...patch, ...this.pending };
      this.hasPending = true;
      this.writeDraft();
      this.set({ kind: 'error' });
      return false;
    }
  }

  /**
   * Save immediately when the field loses focus, the app goes to the background,
   * or the page is being hidden/unloaded (iOS may close the app without warning).
   * Returns a function that detaches the listeners and saves whatever is left.
   */
  attach(doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> = document,
    win: Pick<Window, 'addEventListener' | 'removeEventListener'> = window) {
    this.attached++;
    live.add(this as AutoSaver<object>);
    const onVisibility = () => {
      if (doc.visibilityState === 'hidden') void this.flush();
    };
    const onHide = () => void this.flush();
    doc.addEventListener('visibilitychange', onVisibility);
    doc.addEventListener('freeze', onHide);
    win.addEventListener('pagehide', onHide);
    win.addEventListener('blur', onHide);
    return () => {
      doc.removeEventListener('visibilitychange', onVisibility);
      doc.removeEventListener('freeze', onHide);
      win.removeEventListener('pagehide', onHide);
      win.removeEventListener('blur', onHide);
      this.attached--;
      void this.flush().then(() => {
        if (!this.attached && !this.unsaved) live.delete(this as AutoSaver<object>);
      });
    };
  }
}

/** Some field on screen has text that is not stored yet. */
export function hasUnsaved() {
  return [...live].some((s) => s.unsaved);
}

/** Save every open editor now. */
export async function flushAll(): Promise<boolean> {
  const results = await Promise.all([...live].map((s) => s.flush()));
  return results.every(Boolean);
}

let blockedOnce = false;

/**
 * Leave the screen only after its text is saved. If the save fails the user stays on the
 * screen and sees "No se pudo guardar"; a second attempt leaves anyway (the draft stays in
 * localStorage and is recovered next time the entry opens).
 */
export async function leaveSafely(go: () => void): Promise<boolean> {
  if (!hasUnsaved() && ![...live].some((s) => s.state.kind === 'error')) {
    blockedOnce = false;
    go();
    return true;
  }
  const ok = await flushAll();
  if (ok || blockedOnce) {
    blockedOnce = false;
    go();
    return true;
  }
  blockedOnce = true;
  return false;
}

/** For tests. */
export function _resetAutosaveRegistry() {
  live.clear();
  blockedOnce = false;
}

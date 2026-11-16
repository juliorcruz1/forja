import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { saveJournal, saveReview } from '../db/repo';
import { _resetAutosaveRegistry, AutoSaver, type DraftStorage, flushAll, hasUnsaved, leaveSafely, type SaveState } from './autosave';

type JPatch = { reflection?: string; gratitude?: string; notes?: string; line?: string };

class MemStorage implements DraftStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

/** Minimal document/window stand-ins (EventTarget exists in Node). */
function fakeEnv() {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const win = new EventTarget();
  return { doc, win };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };

let storage: MemStorage;
const journalSaver = (date: string, extra: Partial<ConstructorParameters<typeof AutoSaver<JPatch>>[0]> = {}) =>
  new AutoSaver<JPatch>({ save: (p) => saveJournal(date, p), draftKey: `d.${date}`, storage, delay: 700, ...extra });

beforeEach(async () => {
  _resetAutosaveRegistry();
  storage = new MemStorage();
  await db.delete();
  await db.open();
});
afterEach(() => vi.useRealTimers());

describe('Diario: guardado', () => {
  it('"Guardar" guarda al instante, sin esperar el autoguardado', async () => {
    const s = journalSaver('2026-11-15', { delay: 60_000 });
    s.change({ reflection: 'Hoy entrené temprano' });
    expect((await db.journal.get('2026-11-15'))?.reflection).toBeUndefined();
    expect(await s.flush()).toBe(true); // what the Guardar button calls
    expect((await db.journal.get('2026-11-15'))?.reflection).toBe('Hoy entrené temprano');
    expect(s.state.kind).toBe('saved');
  });

  it('el autoguardado guarda solo tras dejar de escribir', async () => {
    vi.useFakeTimers();
    const s = journalSaver('2026-11-15');
    s.change({ notes: 'a' });
    s.change({ notes: 'ab' });
    await vi.advanceTimersByTimeAsync(300);
    s.change({ notes: 'abc' });
    await vi.advanceTimersByTimeAsync(699);
    expect(s.state.kind).toBe('pending');
    vi.useRealTimers();
    await s.flush();
    expect((await db.journal.get('2026-11-15'))?.notes).toBe('abc');
  });

  it('al perder el foco (blur) guarda de inmediato', async () => {
    const s = journalSaver('2026-11-15', { delay: 60_000 });
    s.change({ gratitude: 'Por mi familia' });
    // The field's onBlur calls flush().
    await s.flush();
    expect((await db.journal.get('2026-11-15'))?.gratitude).toBe('Por mi familia');
  });

  it('al ocultarse la app (visibilitychange hidden) guarda de inmediato', async () => {
    const { doc, win } = fakeEnv();
    const s = journalSaver('2026-11-15', { delay: 60_000 });
    s.attach(doc, win);
    s.change({ reflection: 'Escrito antes de cambiar de app' });
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect((await db.journal.get('2026-11-15'))?.reflection).toBe('Escrito antes de cambiar de app');
  });

  it('volver a la app (visible) no dispara un guardado vacío', async () => {
    const { doc, win } = fakeEnv();
    const save = vi.fn(async () => undefined);
    const s = new AutoSaver<JPatch>({ save, storage });
    s.attach(doc, win);
    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(save).not.toHaveBeenCalled();
  });

  it('pagehide y blur de la ventana (cambio de pestaña) guardan de inmediato', async () => {
    const { doc, win } = fakeEnv();
    const s = journalSaver('2026-11-15', { delay: 60_000 });
    s.attach(doc, win);
    s.change({ line: 'Uno' });
    win.dispatchEvent(new Event('pagehide'));
    await settle();
    expect((await db.journal.get('2026-11-15'))?.line).toBe('Uno');
    s.change({ line: 'Dos' });
    win.dispatchEvent(new Event('blur'));
    await settle();
    expect((await db.journal.get('2026-11-15'))?.line).toBe('Dos');
  });

  it('al cambiar de pantalla (desmontar el editor) guarda lo pendiente', async () => {
    const { doc, win } = fakeEnv();
    const s = journalSaver('2026-11-15', { delay: 60_000 });
    const detach = s.attach(doc, win);
    s.change({ notes: 'Me voy a Stats' });
    detach();
    await settle();
    expect((await db.journal.get('2026-11-15'))?.notes).toBe('Me voy a Stats');
    // After detaching, events no longer reach it.
    s.change({ notes: 'x' });
    win.dispatchEvent(new Event('pagehide'));
    await settle();
    expect((await db.journal.get('2026-11-15'))?.notes).toBe('Me voy a Stats');
  });

  it('salir con cambios: guarda primero y luego navega', async () => {
    const order: string[] = [];
    let release!: () => void;
    const s = new AutoSaver<JPatch>({
      storage,
      delay: 60_000,
      save: async (p) => {
        order.push('save-start');
        await new Promise<void>((r) => (release = r));
        await saveJournal('2026-11-15', p);
        order.push('save-end');
      },
    });
    s.attach(...Object.values(fakeEnv()) as [never, never]);
    s.change({ reflection: 'No me pierdas' });
    expect(hasUnsaved()).toBe(true);
    const leaving = leaveSafely(() => order.push('navigate'));
    await settle();
    expect(order).toEqual(['save-start']); // still waiting for the save
    release();
    expect(await leaving).toBe(true);
    expect(order).toEqual(['save-start', 'save-end', 'navigate']);
    expect(hasUnsaved()).toBe(false);
  });

  it('sin cambios, salir navega directo', async () => {
    const go = vi.fn();
    await leaveSafely(go);
    expect(go).toHaveBeenCalledOnce();
  });

  it('aplica igual a una entrada de un día pasado', async () => {
    await saveJournal('2026-11-02', { reflection: 'Original', gratitude: 'Algo' });
    const s = journalSaver('2026-11-02');
    s.change({ reflection: 'Corregido después' });
    await s.flush();
    const e = await db.journal.get('2026-11-02');
    expect(e?.reflection).toBe('Corregido después');
    expect(e?.gratitude).toBe('Algo'); // other fields untouched
    expect(await db.journal.get('2026-11-15')).toBeUndefined();
  });
});

describe('Indicador de estado', () => {
  it('pasa por Guardando… → Guardado ✓ con la hora', async () => {
    const at = new Date(2026, 10, 15, 21, 4);
    const seen: SaveState['kind'][] = [];
    const s = journalSaver('2026-11-15', { now: () => at, delay: 60_000 });
    s.subscribe(() => seen.push(s.state.kind));
    expect(s.state.kind).toBe('idle');
    s.change({ notes: 'hola' });
    expect(s.state.kind).toBe('pending'); // shown as "Guardando…"
    await s.flush();
    expect(seen).toEqual(['pending', 'saving', 'saved']);
    expect(s.state).toEqual({ kind: 'saved', at });
  });

  it('al abrir una entrada guardada muestra su hora', () => {
    const at = new Date(2026, 10, 14, 22, 30);
    expect(journalSaver('2026-11-14', { savedAt: at }).state).toEqual({ kind: 'saved', at });
  });

  it('si falla dice error, conserva el texto y "Reintentar" lo guarda', async () => {
    let fail = true;
    const s = new AutoSaver<JPatch>({
      storage,
      draftKey: 'd.x',
      save: async (p) => {
        if (fail) throw new Error('disk');
        await saveJournal('2026-11-15', p);
      },
    });
    s.change({ reflection: 'Importante' });
    expect(await s.flush()).toBe(false);
    expect(s.state.kind).toBe('error');
    expect(s.unsaved).toBe(true);
    expect(storage.getItem('d.x')).toContain('Importante'); // still safe locally
    fail = false;
    expect(await s.retry()).toBe(true);
    expect(s.state.kind).toBe('saved');
    expect((await db.journal.get('2026-11-15'))?.reflection).toBe('Importante');
    expect(storage.getItem('d.x')).toBeNull();
  });

  it('si falla al salir, se queda en la pantalla; un segundo intento sale (el borrador sigue a salvo)', async () => {
    const s = new AutoSaver<JPatch>({ storage, draftKey: 'd.y', save: async () => { throw new Error('x'); } });
    s.attach(...Object.values(fakeEnv()) as [never, never]);
    s.change({ notes: 'texto' });
    const go = vi.fn();
    expect(await leaveSafely(go)).toBe(false);
    expect(go).not.toHaveBeenCalled();
    expect(await leaveSafely(go)).toBe(true);
    expect(go).toHaveBeenCalledOnce();
    expect(storage.getItem('d.y')).toContain('texto');
  });

  it('lo escrito mientras se guarda no se pierde', async () => {
    let release!: () => void;
    const saved: JPatch[] = [];
    const s = new AutoSaver<JPatch>({
      storage,
      delay: 60_000,
      save: async (p) => {
        saved.push(p);
        if (saved.length === 1) await new Promise<void>((r) => (release = r));
      },
    });
    s.change({ notes: 'uno' });
    const first = s.flush();
    await settle();
    s.change({ notes: 'uno dos' });
    release();
    await first;
    expect(s.state.kind).toBe('pending');
    await s.flush();
    expect(saved.map((p) => p.notes)).toEqual(['uno', 'uno dos']);
    expect(s.state.kind).toBe('saved');
  });
});

describe('Sobrevive a cerrar y reabrir', () => {
  it('texto guardado sigue ahí tras cerrar y reabrir la base de datos', async () => {
    const { doc, win } = fakeEnv();
    const s = journalSaver('2026-11-15', { delay: 60_000 });
    s.attach(doc, win);
    s.change({ reflection: 'Cierro la app justo después de escribir' });
    win.dispatchEvent(new Event('pagehide'));
    await settle();
    db.close();
    await db.open();
    expect((await db.journal.get('2026-11-15'))?.reflection).toBe('Cierro la app justo después de escribir');
  });

  it('si iOS mata la app antes de guardar, el borrador local se recupera al reabrir', async () => {
    const killed = journalSaver('2026-11-15', { delay: 60_000 });
    killed.change({ gratitude: 'Escrito y la app se cerró' });
    // Nothing reached IndexedDB...
    expect(await db.journal.get('2026-11-15')).toBeUndefined();
    // ...but the next open finds the draft and saves it.
    _resetAutosaveRegistry();
    const reopened = journalSaver('2026-11-15');
    const draft = reopened.readDraft();
    expect(draft).toEqual({ gratitude: 'Escrito y la app se cerró' });
    reopened.change(draft!);
    await reopened.flush();
    expect((await db.journal.get('2026-11-15'))?.gratitude).toBe('Escrito y la app se cerró');
    expect(reopened.readDraft()).toBeUndefined();
  });

  it('un borrador más viejo que lo guardado se descarta', async () => {
    storage.setItem('d.2026-11-15', JSON.stringify({ patch: { notes: 'viejo' }, at: Date.parse('2026-11-15T10:00:00Z') }));
    const s = journalSaver('2026-11-15');
    expect(s.readDraft('2026-11-15T12:00:00Z')).toBeUndefined();
    expect(storage.getItem('d.2026-11-15')).toBeNull();
  });

  it('la revisión semanal también se guarda y sobrevive', async () => {
    const s = new AutoSaver<{ answers: string[] }>({ storage, save: (p) => saveReview('2026-11-09', p.answers!) });
    s.change({ answers: ['Bien', '', 'Dormir antes'] });
    expect(await flushAll()).toBe(true);
    db.close();
    await db.open();
    expect((await db.reviews.get('2026-11-09'))?.answers).toEqual(['Bien', '', 'Dormir antes']);
  });
});

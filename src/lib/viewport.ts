/**
 * Viewport fixes for the installed iPhone app (PWA in standalone mode).
 *
 * 1. Height: in standalone, iOS reports the viewport height units (and
 *    sometimes innerHeight) as the screen height minus the top safe area, so a
 *    layout sized with them ends ~50 px above the physical edge. The app then
 *    occupies the whole physical screen, so we use the screen size instead.
 * 2. Text size: iOS "Larger Text" only reaches web apps through the
 *    `-apple-system-body` font. We read it and scale the root font size
 *    (16 px at the default setting), capped so the layout never breaks.
 */

export interface HeightInput {
  /** iOS home-screen app (navigator.standalone === true). */
  iosStandalone: boolean;
  landscape: boolean;
  screenW: number;
  screenH: number;
  innerH: number;
}

/**
 * Height for the app shell, or null to keep the CSS default.
 * Only applied when the reported height is short by a plausible amount
 * (≤ 120 px: a status bar / safe area), so iPad split view or slide-over is not affected.
 */
export function appHeight({ iosStandalone, landscape, screenW, screenH, innerH }: HeightInput): number | null {
  if (!iosStandalone) return null;
  const physical = landscape ? Math.min(screenW, screenH) : Math.max(screenW, screenH);
  const gap = physical - innerH;
  if (gap <= 0) return innerH; // nothing to fix
  if (gap > 120) return null; // not a full-screen window (split view, slide over)
  return physical;
}

/** iOS default body size is 17 px: map it to our 16 px design, capped for very large settings. */
export function rootFontFromAppleBody(appleBodyPx: number | null): number {
  if (!appleBodyPx || !Number.isFinite(appleBodyPx)) return 16;
  const scaled = (appleBodyPx * 16) / 17;
  return Math.round(Math.min(22, Math.max(16, scaled)) * 100) / 100;
}

function isIOSStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function readAppleBody(): number | null {
  if (typeof CSS === 'undefined' || !CSS.supports('font', '-apple-system-body')) return null;
  const probe = document.createElement('span');
  probe.style.font = '-apple-system-body';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return px || null;
}

export function applyViewportFixes() {
  const root = document.documentElement;
  const update = () => {
    const h = appHeight({
      iosStandalone: isIOSStandalone(),
      landscape: window.matchMedia('(orientation: landscape)').matches,
      screenW: window.screen.width,
      screenH: window.screen.height,
      innerH: window.innerHeight,
    });
    if (h) root.style.setProperty('--app-height', `${h}px`);
    else root.style.removeProperty('--app-height');
  };
  root.style.setProperty('--root-font', `${rootFontFromAppleBody(readAppleBody())}px`);
  update();
  // Orientation changes report the new size a moment later on iOS.
  window.addEventListener('orientationchange', () => setTimeout(update, 250));
  window.matchMedia('(orientation: landscape)').addEventListener?.('change', () => setTimeout(update, 250));
  // NOT on 'resize' while typing: the keyboard must not make the bar jump.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') update();
  });
}

/** Live numbers for the "Diagnóstico de pantalla" panel in Ajustes. */
export function viewportReport() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const safe = { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft };
  probe.remove();
  const shell = document.querySelector('.app-shell')?.getBoundingClientRect();
  const nav = document.querySelector('[data-testid=bottom-nav]')?.getBoundingClientRect();
  const standalone = isIOSStandalone() || window.matchMedia('(display-mode: standalone)').matches;
  return {
    standalone,
    screen: `${window.screen.width}×${window.screen.height}`,
    inner: `${window.innerWidth}×${window.innerHeight}`,
    appHeight: document.documentElement.style.getPropertyValue('--app-height') || '(CSS)',
    shellBottom: shell ? Math.round(shell.bottom) : null,
    navBottom: nav ? Math.round(nav.bottom) : null,
    screenBottom: standalone ? Math.max(window.screen.width, window.screen.height) : window.innerHeight,
    safe,
    rootFont: getComputedStyle(document.documentElement).fontSize,
  };
}

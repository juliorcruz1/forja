/**
 * Static checks of the iPhone layout rules (safe areas, no vh, bar at the
 * physical edge, PWA settings). Real-device behaviour is checked with the
 * "Diagnóstico" panel in Ajustes.
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appHeight, rootFontFromAppleBody } from './lib/viewport';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const sources = import.meta.glob(['./**/*.ts', './**/*.tsx', './**/*.css', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const indexHtml = read('../index.html');
const viteConfig = read('../vite.config.ts');
const css = read('./index.css');
sources['./index.css'] = css; // vitest does not load CSS through import.meta.glob
const nav = sources['./components/BottomNav.tsx'];

/** Body of the first CSS rule whose selector matches exactly. */
function rule(selector: string): string {
  const i = css.indexOf(`${selector} {`);
  expect(i, `rule ${selector}`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
}

describe('viewport and PWA meta tags', () => {
  it('index.html has the exact iPhone meta tags', () => {
    expect(indexHtml).toContain('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />');
    expect(indexHtml).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(indexHtml).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />');
    expect(indexHtml).toContain('<meta name="theme-color" content="#0D0D11" />');
  });

  it('manifest: standalone, portrait, #0D0D11', () => {
    expect(viteConfig).toMatch(/display: 'standalone'/);
    expect(viteConfig).toMatch(/orientation: 'portrait'/);
    expect(viteConfig).toMatch(/background_color: '#0D0D11'/);
    expect(viteConfig).toMatch(/theme_color: '#0D0D11'/);
  });

  it('service worker takes over immediately (no stale version)', () => {
    expect(viteConfig).toMatch(/skipWaiting: true/);
    expect(viteConfig).toMatch(/clientsClaim: true/);
    expect(viteConfig).toMatch(/cleanupOutdatedCaches: true/);
  });
});

describe('global CSS', () => {
  it('never uses 100vh (or min-height: 100vh) anywhere', () => {
    const offenders = Object.entries(sources).filter(([, src]) => /100vh|min-height:\s*100vh|min-h-screen|h-screen/.test(src)).map(([p]) => p);
    expect(offenders).toEqual([]);
    expect(indexHtml).not.toMatch(/100vh/);
  });

  it('100dvh only appears together with the -webkit-fill-available fallback', () => {
    const uses = css.split('\n').filter((l) => /:\s*100dvh/.test(l)); // declarations, not comments
    expect(uses).toHaveLength(1);
    expect(css).toMatch(/height: -webkit-fill-available;\s*height: 100dvh;/);
  });

  it('html, body and #root: full height, dark background, no bounce', () => {
    const r = rule('html, body, #root');
    expect(r).toMatch(/height: 100%/);
    expect(r).toMatch(/background: #0D0D11/);
    expect(r).toMatch(/margin: 0/);
    expect(r).toMatch(/overscroll-behavior: none/);
  });

  it('root layout: fixed full-screen flex column with safe areas left/right', () => {
    const r = rule('.app-shell');
    expect(r).toMatch(/position: fixed/);
    expect(r).toMatch(/display: flex/);
    expect(r).toMatch(/flex-direction: column/);
    expect(r).toMatch(/padding-left: var\(--safe-left\)/);
    expect(r).toMatch(/padding-right: var\(--safe-right\)/);
    expect(css).toMatch(/--safe-left: env\(safe-area-inset-left/);
    const main = rule('.app-main');
    expect(main).toMatch(/overflow-y: auto/);
    expect(main).toMatch(/-webkit-overflow-scrolling: touch/);
  });

  it('the bottom bar has exactly the safe-area padding below it, nothing else', () => {
    const r = rule('.app-nav');
    expect(r).toMatch(/padding-bottom: env\(safe-area-inset-bottom/);
    expect(r).toMatch(/margin: 0/);
    expect(r).toMatch(/width: 100%/);
    // no extra spacing or positioning classes on the bar itself
    const navClass = nav.match(/className="app-nav[^"]*"/)?.[0] ?? '';
    expect(navClass).not.toMatch(/\b(pb|mb|bottom|fixed|absolute)-?/);
    expect(nav).not.toMatch(/safe-bottom|paddingBottom/);
  });

  it('top content respects the notch / Dynamic Island', () => {
    expect(css).toMatch(/\.safe-top \{ padding-top: max\(var\(--safe-top\)/);
    expect(sources['./components/ui.tsx']).toMatch(/className="safe-top/);
  });

  it('inputs are never below 16px (no zoom on focus) and taps do not double-tap zoom', () => {
    expect(css).toMatch(/input, textarea, select \{ font-size: max\(16px, 1rem\); \}/);
    expect(css).toMatch(/touch-action: manipulation/);
  });

  it('text sizes are in rem (scale with iOS Larger Text), no fixed px font sizes', () => {
    const offenders = Object.entries(sources).filter(([, src]) => /text-\[\d+(\.\d+)?px\]/.test(src)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('no fixed widths of 100px or more in the screens', () => {
    const offenders = Object.entries(sources)
      .filter(([p]) => p.endsWith('.tsx'))
      .flatMap(([p, src]) => [...src.matchAll(/(?<![-\w])w-\[(\d+)px\]/g)].filter((m) => Number(m[1]) >= 100).map((m) => `${p}: ${m[0]}`));
    expect(offenders).toEqual([]);
  });
});

describe('installed-app height (iOS standalone)', () => {
  const base = { iosStandalone: true, landscape: false, screenW: 390, screenH: 844 };

  it('uses the physical screen height when iOS reports it short by the status bar', () => {
    expect(appHeight({ ...base, innerH: 844 - 47 })).toBe(844); // iPhone 14: 47 px status bar
    expect(appHeight({ ...base, screenW: 393, screenH: 852, innerH: 852 - 59 })).toBe(852); // Dynamic Island
  });

  it('keeps the reported height when there is nothing to fix', () => {
    expect(appHeight({ ...base, innerH: 844 })).toBe(844);
  });

  it('landscape uses the short side', () => {
    expect(appHeight({ ...base, landscape: true, innerH: 390 - 20 })).toBe(390);
  });

  it('does nothing in the browser or in non full-screen windows (iPad slide over)', () => {
    expect(appHeight({ ...base, iosStandalone: false, innerH: 700 })).toBeNull();
    expect(appHeight({ ...base, screenW: 1024, screenH: 1366, innerH: 700 })).toBeNull();
  });

  it('root font follows iOS Larger Text: 16px by default, capped at 22px', () => {
    expect(rootFontFromAppleBody(null)).toBe(16);
    expect(rootFontFromAppleBody(17)).toBe(16);
    expect(rootFontFromAppleBody(19)).toBeCloseTo(17.88, 1);
    expect(rootFontFromAppleBody(53)).toBe(22);
    expect(rootFontFromAppleBody(14)).toBe(16);
  });
});

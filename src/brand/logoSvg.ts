/**
 * FORJA logo: a pyramid of 6 small stacked flames (3 / 2 / 1).
 * Bottom and middle rows are violet, the top flame is blue.
 * Pure string builder (no imports) so it can be used by React and by the
 * Node icon-generation script (scripts/generate-icons.ts).
 */

// One flame drawn in a 20x26 box: a drop with the tip up and a small notch on the left.
export const FLAME_PATH =
  'M10 0C12.6 5 18 9.6 18 17.2A8 8 0 0 1 2 17.2C2 13.3 3.9 10.6 6 8.6L7.7 11.4C8.1 7.4 8.9 4 10 0Z';

const VIOLET = '#8B5CF6';
const BLUE = '#4F8CFF';
const BG = '#0D0D11';

interface LogoOptions {
  /** Draw the graphite rounded-square background. */
  background?: boolean;
  /** Shrink the flames to fit the maskable-icon safe zone. */
  maskable?: boolean;
}

/** Returns the inner SVG markup for a 512x512 viewBox. */
export function logoInner({ background = true, maskable = false }: LogoOptions = {}): string {
  const scale = maskable ? 3.3 : 4.4; // flame box 20x26 -> 88x114 at 4.4
  const fw = 20 * scale;
  const fh = 26 * scale;
  const gapX = fw * 1.14;
  const gapY = fh * 0.88;
  const rows: { y: number; xs: number[]; color: string }[] = [];
  const totalH = fh + gapY * 2;
  const top = 256 - totalH / 2;
  rows.push({ y: top, xs: [0], color: BLUE });
  rows.push({ y: top + gapY, xs: [-0.5, 0.5], color: VIOLET });
  rows.push({ y: top + gapY * 2, xs: [-1, 0, 1], color: VIOLET });

  const flames = rows
    .flatMap((r) =>
      r.xs.map((k) => {
        const x = 256 + k * gapX - fw / 2;
        return `<path d="${FLAME_PATH}" fill="${r.color}" transform="translate(${x.toFixed(2)} ${r.y.toFixed(2)}) scale(${scale})"/>`;
      }),
    )
    .join('');

  const bg = background
    ? maskable
      ? `<rect width="512" height="512" fill="${BG}"/>`
      : `<rect width="512" height="512" rx="112" fill="${BG}"/>`
    : '';
  return bg + flames;
}

export function logoSvg(opts: LogoOptions = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${logoInner(opts)}</svg>`;
}

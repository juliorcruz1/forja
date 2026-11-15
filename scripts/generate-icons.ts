// Generates the PWA icons from the reusable logo SVG.
// Run with: npm run icons   (Node 22.18+ strips TypeScript types natively)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { logoSvg } from '../src/brand/logoSvg.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
mkdirSync(join(pub, 'icons'), { recursive: true });

const regular = Buffer.from(logoSvg());
// iOS adds its own rounded mask, so the apple-touch-icon uses a full-bleed square.
const square = Buffer.from(logoSvg({ maskable: false }).replace('rx="112"', ''));
const maskable = Buffer.from(logoSvg({ maskable: true }));

writeFileSync(join(pub, 'favicon.svg'), logoSvg());

const jobs: [Buffer, number, string][] = [
  [square, 180, 'apple-touch-icon.png'],
  [regular, 192, 'icons/icon-192.png'],
  [regular, 512, 'icons/icon-512.png'],
  [maskable, 512, 'icons/icon-maskable-512.png'],
];

for (const [svg, size, out] of jobs) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(join(pub, out));
  console.log('✓', out);
}

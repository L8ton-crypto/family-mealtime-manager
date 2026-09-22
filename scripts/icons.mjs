#!/usr/bin/env node
// Rasterizes public/icons/icon.svg (a pass-orange ticket with a perforated
// top edge and an "RK" monogram — see that file's own header comment) into
// the PNG sizes the PWA manifest and iOS need. Run with `node
// scripts/icons.mjs`; the outputs are committed to public/icons/, not
// generated at build/deploy time, so a fresh checkout has working icons
// without needing sharp at runtime. See docs/slices/05-service.md's PWA
// scope ("Icons: generate public/icons/icon.svg ... with a script
// (scripts/icons.mjs, using sharp as a devDependency) and commit the
// outputs").

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const iconsDir = path.join(rootDir, 'public', 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');

const svg = readFileSync(svgPath);

// { file, size, flatten } — flatten (drop the alpha channel, composited
// onto white) is only meaningful for apple-touch-icon: iOS ignores any
// transparency, and Home Screen tooling is happiest given a fully opaque
// image. The manifest icons keep their (already fully opaque, since the SVG
// itself paints a full-bleed background rect) native alpha channel.
const targets = [
  { file: 'icon-192.png', size: 192, flatten: false },
  { file: 'icon-512.png', size: 512, flatten: false },
  { file: 'apple-touch-icon.png', size: 180, flatten: true },
];

for (const { file, size, flatten } of targets) {
  let pipeline = sharp(svg, { density: 384 }).resize(size, size);
  if (flatten) pipeline = pipeline.flatten({ background: '#FF4F0F' });
  const outPath = path.join(iconsDir, file);
  await pipeline.png().toFile(outPath);
  console.log(`wrote ${path.relative(rootDir, outPath)} (${size}x${size})`);
}

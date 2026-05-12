// Rasterize the dolphin SVG into a multi-resolution .ico for the .exe and
// window icon, plus a 32x32 .png for the system tray.
//
// Run: npm run icon
// Outputs: assets/icon.ico, assets/tray.png

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import toIco from 'to-ico';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const svgPath = path.join(repoRoot, 'assets', 'dolphin-duotone-solid-full.svg');
const icoOut = path.join(repoRoot, 'assets', 'icon.ico');
const trayOut = path.join(repoRoot, 'assets', 'tray.png');

const svg = fs.readFileSync(svgPath);

function rasterize(size) {
  // The dolphin SVG has a 640-unit viewbox with the artwork hugging the edges.
  // We render onto a transparent canvas of `size` px wide; the viewBox already
  // gives breathing room so we don't need extra padding.
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  return resvg.render().asPng();
}

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = icoSizes.map(rasterize);
const ico = await toIco(pngs);
fs.writeFileSync(icoOut, ico);
fs.writeFileSync(trayOut, rasterize(32));

console.log(`Wrote ${icoOut} (${ico.length} bytes) with sizes: ${icoSizes.join(', ')}`);
console.log(`Wrote ${trayOut} (32x32 PNG)`);

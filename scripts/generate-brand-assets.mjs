import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { theme } from '../src/theme/tokens.ts';

// The outlined wordmark and symbol are reconstructed from the approved icon board.
// Reference pixels never enter production artwork; UI typography is bundled separately from the wordmark.
const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, 'assets/brand');
const geometry = JSON.parse(await readFile(resolve(directory, 'geometry.json'), 'utf8'));
const colors = theme.colors;
const svg = (viewBox, content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${content}</svg>\n`;
const paths = (base, leaf) =>
  `<path fill="${base}" d="${geometry.lower}"/><path fill="${leaf}" d="${geometry.leaf}"/>`;
const mark = (base, leaf) => svg(geometry.viewBox, paths(base, leaf));
const wordmark = (base, leaf) =>
  svg(
    geometry.wordmarkViewBox,
    `<path fill="${base}" fill-rule="evenodd" d="${geometry.wordmark}"/><g transform="${geometry.wordmarkLeafTransform}"><path fill="${leaf}" d="${geometry.leaf}"/></g>`,
  );
const assets = {
  'mark-primary': mark(colors.black, colors.accent),
  'mark-dark': mark(colors.onBlack, colors.accent),
  'mark-black': mark(colors.black, colors.black),
  'mark-white': mark(colors.onBlack, colors.onBlack),
  leaf: svg('64 20 36 56', `<path fill="${colors.accent}" d="${geometry.leaf}"/>`),
  'wordmark-primary': wordmark(colors.black, colors.accent),
  'wordmark-dark': wordmark(colors.onBlack, colors.accent),
  'wordmark-black': wordmark(colors.black, colors.black),
  'wordmark-white': wordmark(colors.onBlack, colors.onBlack),
  'app-icon': svg(
    geometry.viewBox,
    `<path fill="${colors.background}" d="M0 0H128V128H0Z"/>${paths(colors.black, colors.accent)}`,
  ),
  'app-icon-dark': svg(
    geometry.viewBox,
    `<path fill="${colors.black}" d="M0 0H128V128H0Z"/>${paths(colors.onBlack, colors.accent)}`,
  ),
  'android-foreground': svg(
    geometry.viewBox,
    `<g transform="translate(21.76 21.76) scale(.66)">${paths(colors.black, colors.accent)}</g>`,
  ),
  'android-monochrome': svg(
    geometry.viewBox,
    `<g transform="translate(21.76 21.76) scale(.66)">${paths(colors.onBlack, colors.onBlack)}</g>`,
  ),
  notification: mark(colors.onBlack, colors.onBlack),
};
await mkdir(directory, { recursive: true });
const manifest = {};
for (const [name, source] of Object.entries(assets)) {
  await writeFile(resolve(directory, name + '.svg'), source);
  const outputWidth =
    name.startsWith('app-icon') || name.startsWith('android-')
      ? 1024
      : name.startsWith('wordmark')
        ? 1200
        : name === 'notification'
          ? 96
          : 384;
  let raster = sharp(Buffer.from(source)).resize({ width: outputWidth });
  if (name.startsWith('app-icon')) raster = raster.removeAlpha();
  const buffer = await raster.png().toBuffer();
  await writeFile(resolve(directory, name + '.png'), buffer);
  const meta = await sharp(buffer).metadata();
  manifest[name] = {
    width: meta.width,
    height: meta.height,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}
await writeFile(resolve(directory, 'exports.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Generated ${Object.keys(assets).length} Mnelo vector/raster pairs.`);

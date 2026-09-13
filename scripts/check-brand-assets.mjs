import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const base = new URL('../assets/brand/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('exports.json', base), 'utf8'));
for (const [name, expected] of Object.entries(manifest)) {
  const file = await readFile(new URL(name + '.png', base));
  assert.equal(createHash('sha256').update(file).digest('hex'), expected.sha256, name + ' changed');
  const meta = await sharp(file).metadata();
  assert.equal(meta.width, expected.width);
  assert.equal(meta.height, expected.height);
  const source = await readFile(new URL(name + '.svg', base), 'utf8');
  assert(
    !/<(?:image|text|script)\b|https?:\/\/(?!www\.w3\.org)/.test(source),
    name + ': paths only',
  );
  if (name.startsWith('app-icon')) {
    assert.equal(meta.width, 1024);
    assert.equal(meta.height, 1024);
    assert.equal(meta.hasAlpha, false, 'iOS icon must have no alpha channel');
  }
  if (name.startsWith('android-')) {
    // Android's 66/108 safe-circle diameter: inspect actual foreground alpha, not its canvas.
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const radius = (info.width * 66) / 108 / 2;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] > 8)
          assert(
            Math.hypot(x - info.width / 2, y - info.height / 2) <= radius,
            name + ': symbol outside adaptive safe circle',
          );
      }
    }
  }
}
console.log(
  `Brand exports: ${Object.keys(manifest).length} checked; paths, hashes, iOS alpha and Android safe circle PASS.`,
);

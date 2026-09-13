import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { qrGeometry } from '../../src/messenger/qr-geometry';
import { contactLink, parseContactLink } from '../../src/messenger/contact-link';

test('the actual rendered QR geometry decodes to the same contact, including a long Georgian name', () => {
  for (const name of ['Nino', 'ნინო აბაშიძე', 'ა'.repeat(60)]) {
    const contact = { key: 'ab'.repeat(32), name };
    const link = contactLink(contact),
      geometry = qrGeometry(link),
      scale = 5;
    const width = geometry.size * scale,
      pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (const match of geometry.path.matchAll(/M(\d+),(\d+)h1v1h-1z/g)) {
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const offset =
            ((Number(match[2]) * scale + y) * width + Number(match[1]) * scale + x) * 4;
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
        }
    }
    const decoded = jsQR(pixels, width, width);
    assert.equal(decoded?.data, link);
    assert.deepEqual(parseContactLink(decoded?.data), contact);
  }
});

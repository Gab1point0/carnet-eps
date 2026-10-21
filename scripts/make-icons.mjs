// Génère les icônes PNG de l'application (sans dépendance) : node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function renderer(size, { rounded, ballScale }) {
  const c = size / 2;
  const R = size * ballScale;
  const radius = size * 0.22;
  const seams = [90, 210, 330].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: c + Math.cos(rad) * R * 1.45, y: c - Math.sin(rad) * R * 1.45, r: R * 1.05 };
  });
  const sample = (px, py) => {
    // fond : carré arrondi dégradé
    let inside = true;
    if (rounded) {
      const dx = Math.max(radius - px, 0, px - (size - radius));
      const dy = Math.max(radius - py, 0, py - (size - radius));
      inside = dx * dx + dy * dy <= radius * radius;
    }
    if (!inside) return [0, 0, 0, 0];
    const t = (px + py) / (2 * size);
    let col = mix([15, 118, 110], [20, 184, 166], t);
    const d = Math.hypot(px - c, py - c);
    if (d <= R) {
      col = [255, 255, 255];
      for (const s of seams) {
        if (Math.abs(Math.hypot(px - s.x, py - s.y) - s.r) < size * 0.012) col = [15, 118, 110];
      }
    } else if (d <= R + size * 0.012) {
      col = [255, 255, 255];
    }
    return [...col, 255];
  };
  return (x, y) => {
    // suréchantillonnage 3×3 pour des bords lisses
    let r = 0, g = 0, b = 0, a = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const [pr, pg, pb, pa] = sample(x + (i + 0.5) / 3, y + (j + 0.5) / 3);
        r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
      }
    }
    return a ? [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / 9)] : [0, 0, 0, 0];
  };
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', png(192, renderer(192, { rounded: true, ballScale: 0.3 })));
writeFileSync('public/icon-512.png', png(512, renderer(512, { rounded: true, ballScale: 0.3 })));
writeFileSync('public/icon-maskable-512.png', png(512, renderer(512, { rounded: false, ballScale: 0.24 })));
console.log('Icônes générées dans public/');

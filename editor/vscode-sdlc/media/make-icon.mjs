// Regenerates media/icon.png (the marketplace icon) from the same motif as icon.svg.
//
// Kept as a script rather than a committed binary with no provenance: an icon nobody can
// regenerate is an icon nobody can change. Pure Node — zlib is the only thing a PNG needs.
//
//   node media/make-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SIZE = 128;
const SS = 4;                       // supersample factor, downsampled for anti-aliasing
const N = SIZE * SS;

const BG = [0x18, 0x1c, 0x24];
const BAR = [0xe6, 0xe8, 0xec];
const DOTS = [[0x4f, 0xc3, 0xa1], [0xe0, 0xa8, 0x4e], [0x6b, 0x74, 0x86]];

// One row per gate strip: bar end x, dot centre x, row centre y - the 24px viewBox scaled up.
const ROWS = [
  { x0: 3, x1: 10, cx: 19, cy: 6 },
  { x0: 3, x1: 16, cx: 20, cy: 12 },
  { x0: 3, x1: 9, cx: 16, cy: 18 },
];
const STROKE = 1.6;
const DOT_R = 2;

const s = (v) => (v / 24) * N;      // viewBox units -> supersampled pixels

const buf = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N; i++) buf.set(BG, i * 3);

function put(x, y, rgb) {
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  buf.set(rgb, (y * N + x) * 3);
}

// A round-capped line is just every point within half a stroke of the segment.
for (const [i, row] of ROWS.entries()) {
  const hw = s(STROKE) / 2;
  const y = s(row.cy), x0 = s(row.x0), x1 = s(row.x1);
  for (let py = Math.floor(y - hw); py <= Math.ceil(y + hw); py++) {
    for (let px = Math.floor(x0 - hw); px <= Math.ceil(x1 + hw); px++) {
      const cx = Math.min(Math.max(px, x0), x1);
      if ((px - cx) ** 2 + (py - y) ** 2 <= hw * hw) put(px, py, BAR);
    }
  }
  // The dot is drawn as a ring, as in the SVG: an open circle, not a filled one.
  const dx = s(row.cx), dy = s(row.cy), r = s(DOT_R);
  for (let py = Math.floor(dy - r - hw); py <= Math.ceil(dy + r + hw); py++) {
    for (let px = Math.floor(dx - r - hw); px <= Math.ceil(dx + r + hw); px++) {
      const d = Math.hypot(px - dx, py - dy);
      if (d >= r - hw && d <= r + hw) put(px, py, DOTS[i]);
    }
  }
}

// Downsample by averaging each SS x SS block.
const out = Buffer.alloc(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const acc = [0, 0, 0];
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const o = ((y * SS + sy) * N + (x * SS + sx)) * 3;
        acc[0] += buf[o]; acc[1] += buf[o + 1]; acc[2] += buf[o + 2];
      }
    }
    const o = (y * SIZE + x) * 3, n = SS * SS;
    out[o] = Math.round(acc[0] / n); out[o + 1] = Math.round(acc[1] / n); out[o + 2] = Math.round(acc[2] / n);
  }
}

// PNG: one filter byte (0 = none) per scanline, then deflate, then the four chunks.
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 3 + 1)] = 0;
  out.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

let TABLE = null;
function crc32(b) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (const byte of b) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;    // bit depth
ihdr[9] = 2;    // colour type: truecolour
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = join(dirname(fileURLToPath(import.meta.url)), 'icon.png');
writeFileSync(target, png);
console.log(`wrote ${target} (${png.length} bytes)`);

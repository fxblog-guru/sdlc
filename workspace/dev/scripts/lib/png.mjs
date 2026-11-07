/**
 * Small PNGs without a dependency: decode what a Chromium screenshot writes (8-bit RGB or RGBA,
 * not interlaced), reduce it to at most 256 colours, and write it back as an indexed PNG.
 *
 * A UI screenshot is mostly flat fills; only antialiased text and icon edges carry more colours.
 * Median cut over a 5-bit-per-channel histogram keeps the flat fills exact (each is its own box
 * long before 256 boxes are cut) and spends what is left on the edges. A browser's own PNG is
 * encoded for speed, not size; the indexed re-encode is typically a third of it. Deterministic:
 * the same picture always gives the same bytes, so committed shots only change when the page does.
 */

import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

/** @returns {{ width: number, height: number, rgb: Buffer }} the picture as packed RGB, alpha dropped */
export function decodePng(png) {
  if (png.length < 33 || !png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  let palette = null;
  const idat = [];
  for (let p = 8; p + 8 <= png.length;) {
    const len = png.readUInt32BE(p);
    const kind = png.toString('latin1', p + 4, p + 8);
    const body = png.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      [depth, type] = [body[8], body[9]];
      interlace = body[12];
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!width || !height || depth !== 8 || interlace !== 0 || !channels) throw new Error(`unsupported PNG (type ${type}, depth ${depth}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgb = Buffer.alloc(width * height * 3);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const at = y * (stride + 1);
    const filter = raw[at];
    const line = Buffer.from(raw.subarray(at + 1, at + 1 + stride));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + add) & 0xff;
    }
    for (let x = 0, o = y * width * 3; x < width; x += 1, o += 3) {
      const s = x * channels;
      if (type === 3) palette.copy(rgb, o, line[s] * 3, line[s] * 3 + 3);
      else if (channels < 3) rgb[o] = rgb[o + 1] = rgb[o + 2] = line[s];
      else { rgb[o] = line[s]; rgb[o + 1] = line[s + 1]; rgb[o + 2] = line[s + 2]; }
    }
    prev = line;
  }
  return { width, height, rgb };
}

const key15 = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/**
 * At most `max` colours for `rgb`. Exact when the picture has that few; otherwise median cut over
 * the 5-bit histogram, each box's colour the count-weighted mean of the pixels in it.
 *
 * @returns {{ palette: number[][], index: Uint8Array }} one palette index per pixel
 */
export function quantise(rgb, max = 256) {
  const n = rgb.length / 3;
  const exact = new Map();
  for (let i = 0; i < rgb.length && exact.size <= max; i += 3) {
    const k = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
    if (!exact.has(k)) exact.set(k, exact.size);
  }
  const index = new Uint8Array(n);
  if (exact.size <= max) {
    for (let i = 0, j = 0; j < n; i += 3, j += 1) index[j] = exact.get((rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2]);
    return { palette: [...exact.keys()].map((k) => [k >> 16, (k >> 8) & 255, k & 255]), index };
  }
  // Histogram on 15-bit keys: count and channel sums.
  const count = new Uint32Array(32768);
  const sum = new Float64Array(32768 * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    const k = key15(rgb[i], rgb[i + 1], rgb[i + 2]);
    count[k] += 1;
    sum[k * 3] += rgb[i];
    sum[k * 3 + 1] += rgb[i + 1];
    sum[k * 3 + 2] += rgb[i + 2];
  }
  const cells = [];
  for (let k = 0; k < 32768; k += 1) if (count[k]) cells.push(k);
  const chan = (k, c) => (c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31);
  const span = (box) => {
    let best = { c: 0, range: -1 };
    for (let c = 0; c < 3; c += 1) {
      let lo = 31;
      let hi = 0;
      for (const k of box) { const v = chan(k, c); if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi - lo > best.range) best = { c, range: hi - lo };
    }
    return best;
  };
  const describe = (box) => ({ box, w: box.reduce((s, k) => s + count[k], 0), ...span(box) });
  let boxes = [describe(cells)];
  while (boxes.length < max) {
    // Split the box with the most pixels times the widest range; ties go to the earlier box, so the
    // result depends on nothing but the picture.
    let pick = -1;
    let score = 0;
    for (let b = 0; b < boxes.length; b += 1) {
      const sc = boxes[b].w * (boxes[b].range + 1);
      if (boxes[b].range > 0 && sc > score) { score = sc; pick = b; }
    }
    if (pick < 0) break;
    const axis = boxes[pick].c;
    const box = boxes[pick].box.slice().sort((a, b) => chan(a, axis) - chan(b, axis) || a - b);
    const half = boxes[pick].w / 2;
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.length - 1; i += 1) {
      acc += count[box[i]];
      cut = i + 1;
      if (acc >= half) break;
    }
    boxes.splice(pick, 1, describe(box.slice(0, cut)), describe(box.slice(cut)));
  }
  const palette = boxes.map(({ box, w }) => {
    const m = [0, 0, 0];
    for (const k of box) for (let c = 0; c < 3; c += 1) m[c] += sum[k * 3 + c];
    return m.map((v) => Math.round(v / w));
  });
  const map = new Int16Array(32768).fill(-1);
  boxes.forEach(({ box }, b) => { for (const k of box) map[k] = b; });
  for (let i = 0, j = 0; j < n; i += 3, j += 1) index[j] = map[key15(rgb[i], rgb[i + 1], rgb[i + 2])];
  return { palette, index };
}

function chunk(kind, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(kind, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

/** An indexed (colour type 3) PNG, rows unfiltered, deflated at level 9. */
export function encodeIndexed(width, height, palette, index) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    raw.set(index.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const plte = Buffer.from(palette.flat());
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', deflateSync(raw, { level: 9, memLevel: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** A screenshot as a smaller indexed PNG of the same size. */
export function optimisePng(png, max = 256) {
  const { width, height, rgb } = decodePng(png);
  const { palette, index } = quantise(rgb, max);
  return encodeIndexed(width, height, palette, index);
}

/**
 * Text to SVG outlines without a dependency: read a TrueType font (.ttf, or .woff 1.0 wrapping one)
 * and turn a string into one path. A logo whose letters are outlines looks the same on a machine
 * that does not have the font, in an email client and inside an <img>.
 *
 * Reads only what outlining needs: `cmap` (format 4, the Basic Multilingual Plane), `glyf` + `loca`
 * (simple and composite glyphs), `hmtx`, `head` and `hhea`. No kerning (GPOS is a programme of its
 * own); a wordmark that needs it takes `tracking`. CFF-flavoured fonts (.otf with `CFF `) and
 * .woff2 (Brotli) are refused with a message, never drawn wrong.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** The table directory of a TTF or WOFF 1.0 file, each table as its own Buffer. */
function tables(buf) {
  const sig = buf.toString('latin1', 0, 4);
  const out = {};
  if (sig === 'wOFF') {
    const n = buf.readUInt16BE(12);
    for (let i = 0; i < n; i += 1) {
      const at = 44 + i * 20;
      const tag = buf.toString('latin1', at, at + 4);
      const off = buf.readUInt32BE(at + 4);
      const comp = buf.readUInt32BE(at + 8);
      const orig = buf.readUInt32BE(at + 12);
      const raw = buf.subarray(off, off + comp);
      out[tag] = comp < orig ? inflateSync(raw) : raw;
    }
    if (buf.readUInt32BE(4) === 0x4f54544f) throw new Error('a CFF-flavoured font — use a TrueType (.ttf or .woff) build of it');
    return out;
  }
  if (sig === 'wOF2') throw new Error('.woff2 needs Brotli and a transform this reader does not do — use the .woff or .ttf of the same font');
  if (sig === 'OTTO') throw new Error('a CFF-flavoured font (.otf) — use a TrueType (.ttf or .woff) build of it');
  if (buf.readUInt32BE(0) !== 0x00010000 && sig !== 'true') throw new Error('not a TrueType font');
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i += 1) {
    const at = 12 + i * 16;
    out[buf.toString('latin1', at, at + 4)] = buf.subarray(buf.readUInt32BE(at + 8), buf.readUInt32BE(at + 8) + buf.readUInt32BE(at + 12));
  }
  return out;
}

/** code point → glyph id, from the format 4 subtable of `cmap`. */
function readCmap(t) {
  const n = t.readUInt16BE(2);
  let sub = null;
  for (let i = 0; i < n; i += 1) {
    const pid = t.readUInt16BE(4 + i * 8);
    const eid = t.readUInt16BE(6 + i * 8);
    const off = t.readUInt32BE(8 + i * 8);
    if (t.readUInt16BE(off) === 4 && (pid === 3 && eid === 1 || pid === 0)) { sub = off; break; }
  }
  if (sub === null) throw new Error('no Unicode BMP cmap (format 4) in this font');
  const segX2 = t.readUInt16BE(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  return (cp) => {
    for (let s = 0; s < segX2; s += 2) {
      const end = t.readUInt16BE(ends + s);
      if (cp > end) continue;
      const start = t.readUInt16BE(starts + s);
      if (cp < start) return 0;
      const delta = t.readInt16BE(deltas + s);
      const ro = t.readUInt16BE(ranges + s);
      if (!ro) return (cp + delta) & 0xffff;
      const g = t.readUInt16BE(ranges + s + ro + (cp - start) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
}

/**
 * A loaded font: `unitsPerEm`, `ascent`, `descent`, `has(char)`, and `outline(text, size, x, y)`
 * returning `{ d, width }` with the baseline at y.
 */
export function loadFont(path) {
  const t = tables(readFileSync(path));
  for (const k of ['cmap', 'glyf', 'loca', 'hmtx', 'head', 'hhea', 'maxp']) if (!t[k]) throw new Error(`${path}: no ${k} table — not a TrueType outline font`);
  const unitsPerEm = t.head.readUInt16BE(18);
  const longLoca = t.head.readInt16BE(50) === 1;
  const numGlyphs = t.maxp.readUInt16BE(4);
  const numHMetrics = t.hhea.readUInt16BE(34);
  const glyphOf = readCmap(t.cmap);
  const loca = (g) => (longLoca ? t.loca.readUInt32BE(g * 4) : t.loca.readUInt16BE(g * 2) * 2);
  const advance = (g) => t.hmtx.readUInt16BE(Math.min(g, numHMetrics - 1) * 4);

  /** Contours of glyph g as arrays of { x, y, on }, in font units, composites resolved. */
  function contours(g, depth = 0) {
    if (g >= numGlyphs || depth > 8) return [];
    const start = loca(g);
    const end = loca(g + 1);
    if (end <= start) return [];
    const d = t.glyf.subarray(start, end);
    const nc = d.readInt16BE(0);
    if (nc < 0) {
      const out = [];
      let p = 10;
      for (;;) {
        const flags = d.readUInt16BE(p);
        const child = d.readUInt16BE(p + 2);
        p += 4;
        let dx;
        let dy;
        if (flags & 1) { dx = d.readInt16BE(p); dy = d.readInt16BE(p + 2); p += 4; } else { dx = d.readInt8(p); dy = d.readInt8(p + 1); p += 2; }
        let [a, b, c, e] = [1, 0, 0, 1];
        const f2 = (o) => d.readInt16BE(o) / 16384;
        if (flags & 0x8) { a = e = f2(p); p += 2; } else if (flags & 0x40) { a = f2(p); e = f2(p + 2); p += 4; } else if (flags & 0x80) { a = f2(p); b = f2(p + 2); c = f2(p + 4); e = f2(p + 6); p += 8; }
        for (const ct of contours(child, depth + 1)) out.push(ct.map((q) => ({ x: a * q.x + c * q.y + dx, y: b * q.x + e * q.y + dy, on: q.on })));
        if (!(flags & 0x20)) break;
      }
      return out;
    }
    const endPts = [];
    for (let i = 0; i < nc; i += 1) endPts.push(d.readUInt16BE(10 + i * 2));
    const n = endPts.length ? endPts[nc - 1] + 1 : 0;
    let p = 10 + nc * 2;
    p += 2 + d.readUInt16BE(p);
    const flags = [];
    while (flags.length < n) {
      const f = d[p++];
      flags.push(f);
      if (f & 8) { let r = d[p++]; while (r-- > 0) flags.push(f); }
    }
    const coord = (short, same) => {
      const out = [];
      let v = 0;
      for (const f of flags) {
        if (f & short) { const k = d[p++]; v += f & same ? k : -k; } else if (!(f & same)) { v += d.readInt16BE(p); p += 2; }
        out.push(v);
      }
      return out;
    };
    const xs = coord(2, 16);
    const ys = coord(4, 32);
    const out = [];
    let from = 0;
    for (const e of endPts) {
      const ct = [];
      for (let i = from; i <= e; i += 1) ct.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
      out.push(ct);
      from = e + 1;
    }
    return out;
  }

  /** One contour as SVG path data: quadratic B-splines with implied on-curve midpoints. */
  function contourPath(ct, P) {
    if (!ct.length) return '';
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });
    let first = ct.findIndex((q) => q.on);
    let pts = ct;
    if (first < 0) { pts = [mid(ct[0], ct[1] ?? ct[0]), ...ct]; first = 0; }
    const ring = [...pts.slice(first), ...pts.slice(0, first)];
    let s = `M${P(ring[0])}`;
    // An off-curve point is a control; two in a row imply an on-curve point halfway between them.
    for (let i = 1; i < ring.length;) {
      const q = ring[i];
      if (q.on) { s += `L${P(q)}`; i += 1; continue; }
      const next = ring[(i + 1) % ring.length];
      s += `Q${P(q)} ${P(next.on ? next : mid(q, next))}`;
      i += next.on ? 2 : 1;
    }
    return `${s}Z`;
  }

  const font = {
    unitsPerEm,
    ascent: t.hhea.readInt16BE(4),
    descent: t.hhea.readInt16BE(6),
    // OS/2 v2+ carries sCapHeight; older fonts get the usual 0.7 em.
    capHeight: t['OS/2'] && t['OS/2'].readUInt16BE(0) >= 2 ? t['OS/2'].readInt16BE(88) : Math.round(unitsPerEm * 0.7),
    has: (ch) => glyphOf(ch.codePointAt(0)) !== 0,
    /** `text` at `size` px, baseline at (x, y), `tracking` px between letters. */
    outline(text, size, x = 0, y = 0, tracking = 0) {
      const k = size / unitsPerEm;
      let pen = 0;
      let d = '';
      const chars = [...text];
      chars.forEach((ch, i) => {
        const g = glyphOf(ch.codePointAt(0));
        const P = (q) => `${(x + pen + q.x * k).toFixed(2)} ${(y - q.y * k).toFixed(2)}`;
        for (const ct of contours(g)) d += contourPath(ct, P);
        pen += advance(g) * k + (i < chars.length - 1 ? tracking : 0);
      });
      return { d, width: pen };
    },
  };
  return font;
}

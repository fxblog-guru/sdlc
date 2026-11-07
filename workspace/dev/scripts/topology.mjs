#!/usr/bin/env node
/**
 * topology.mjs — the cloud deployment model of a slug, checked, drawn to the provider's own diagram
 * standard, and held against the IaC that builds it (DEV-CONTRACTS §13.14).
 *
 * One source, `<root>/deployment/<slug>/topology.yaml`, names neutral kinds (`vm`, `sql-database`,
 * `vpc`, `subnet`) inside the provider's groups. Everything else is generated from it, so the picture,
 * the service table and the IaC cannot quietly disagree:
 *
 *   node <root>/scripts/topology.mjs check  <slug> | <topology.yaml>
 *   node <root>/scripts/topology.mjs render <slug> [--as aws,azure,gcp,alibaba,oci]
 *   node <root>/scripts/topology.mjs drift  <slug> --iac <dir>[,<dir>...]
 *   node <root>/scripts/topology.mjs table  <slug> [--as <providers>]
 *
 *   check   the model against the provider's rules: known provider, kinds and groups; every group
 *           inside a parent its provider allows (an AWS subnet in a VPC, a VPC in a region); the
 *           provider's required groups drawn; every edge between declared ids, with a label; no
 *           data store in a public subnet; nothing but actors at the top level.
 *   render  check, then write `<root>/diagrams/<slug>/cloud/`: `<name>.drawio` (open and edit it in
 *           draw.io or VS Code), `<name>.svg` (the provider's official icons, drawn by draw.io's own
 *           renderer in headless Edge/Chrome) and `index.html`. `--as` redraws the same model on
 *           other providers, which is the side-by-side an ADR comparing clouds needs. `--no-svg`
 *           writes the .drawio files only, with no browser and no network.
 *   drift   every node and group whose kind has an IaC resource type, against the Terraform /
 *           OpenTofu, Bicep and Kubernetes files under --iac: a declared component with no resource
 *           is E740, a resource of a mapped type the model does not declare is W741.
 *   table   the markdown service table (component · kind · service · group) for an artifact.
 *
 *   --root <dir>       the SDLC root (DEV-CONTRACTS §2). Default: DEV-PROFILE, else .sdlc/ or dev/
 *   --out <dir>        render: override <root>/diagrams/<slug>/cloud
 *   --drawio <url>     render: the draw.io webapp base (default: a pinned jsDelivr build)
 *   --browser <path>   render: Edge or Chrome; else $UI_SNAP_BROWSER, else the usual install paths
 *   --json             print the findings as JSON
 *
 * No dependency: YAML through lib/yaml.mjs, the browser through ui-snap.mjs. Exit 0 clean · 1 an
 * error · 2 usage.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Findings, parseArgs, report } from './lib/check.mjs';
import { findRoot } from './lib/root.mjs';
import { parseYaml } from './lib/yaml.mjs';
import {
  DATA_KINDS, IAC, K8S, K8S_IAC, KINDS, NEUTRAL_GROUPS, OUTSIDE_KINDS, PROVIDERS, PUBLIC_GROUPS,
  groupKindOn, groupOf, nodeSize, nodeStyle, providerOf, serviceOf,
} from './lib/clouds.mjs';

export const DRAWIO_URL = 'https://cdn.jsdelivr.net/gh/jgraph/drawio@31.1.8/src/main/webapp';
export const MAX_NODES = 40;
const ID = /^[a-z][a-z0-9-]*$/;

// ---------------------------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------------------------

/** Read and normalise a topology file. Throws with the line on a YAML error. */
export function loadTopology(file) {
  const doc = parseYaml(readFileSync(file, 'utf8')) ?? {};
  return normalise(doc);
}

/** Arrays default to empty and edges accept both `[a, b, label]` and `{ from, to, label }`. */
export function normalise(doc) {
  const list = (v) => (Array.isArray(v) ? v : []);
  const edges = list(doc.edges).map((e) => (Array.isArray(e) ? { from: e[0], to: e[1], label: e[2] } : { ...e }));
  return {
    provider: String(doc.provider ?? '').toLowerCase(),
    title: doc.title ?? '',
    env: doc.env ?? '',
    groups: list(doc.groups).map((g) => ({ ...g })),
    nodes: list(doc.nodes).map((n) => ({ ...n })),
    edges,
  };
}

/** The parent chain of a group or node, nearest first; stops at a cycle. */
function chain(model, id) {
  const byId = new Map(model.groups.map((g) => [g.id, g]));
  const out = [];
  const seen = new Set();
  let cur = model.groups.find((g) => g.id === id)?.in ?? model.nodes.find((n) => n.id === id)?.in;
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    out.push(byId.get(cur));
    cur = byId.get(cur).in;
  }
  return out;
}

/** Static rules. `f` gets every finding; returns the provider adapter, or null when there is none. */
export function checkTopology(model, file, f) {
  const p = providerOf(model.provider);
  if (!p) {
    f.add('E720', file, 0, `provider \`${model.provider || '(none)'}\` is not one of ${PROVIDERS.map((x) => x.id).join(', ')}`);
    return null;
  }
  const ids = new Map();
  const dup = (id, what) => {
    if (!ID.test(String(id ?? ''))) f.add('E723', file, 0, `${what} id \`${id}\` is not lower-kebab-case`);
    else if (ids.has(id)) f.add('E723', file, 0, `id \`${id}\` is declared twice (${ids.get(id)} and ${what})`);
    else ids.set(id, what);
  };
  for (const g of model.groups) dup(g.id, 'group');
  for (const n of model.nodes) dup(n.id, 'node');
  const groups = new Map(model.groups.map((g) => [g.id, g]));

  for (const g of model.groups) {
    const kind = groupKindOn(p, g.kind);
    const def = groupOf(p, kind);
    if (!def) { f.add('E722', file, 0, `group \`${g.id}\`: kind \`${g.kind}\` is not a ${p.name} group (${Object.keys(p.groups).concat(Object.keys(NEUTRAL_GROUPS), Object.keys(K8S.groups)).join(', ')})`); continue; }
    if (g.in && !groups.has(g.in)) { f.add('E724', file, 0, `group \`${g.id}\` is in \`${g.in}\`, which is not a declared group`); continue; }
    if (def.parents.includes('*')) continue; // a Kubernetes cluster sits in any network group
    const parentKind = g.in ? groupKindOn(p, groups.get(g.in).kind) : null;
    if (!def.parents.includes(parentKind)) {
      const where = def.parents.map((x) => x ?? 'the top level').join(' or ');
      f.add('E725', file, 0, `group \`${g.id}\` (${def.label}) is drawn ${parentKind ? `inside a ${groupOf(p, parentKind)?.label ?? parentKind}` : 'at the top level'}; ${p.name} draws it inside ${where}`);
    }
  }
  for (const want of p.required) {
    if (!model.groups.some((g) => groupKindOn(p, g.kind) === want)) f.add('E726', file, 0, `no ${p.groups[want].label} group: every ${p.name} diagram draws one (${p.guide})`);
  }
  for (const n of model.nodes) {
    if (!KINDS[n.kind]) { f.add('E721', file, 0, `node \`${n.id}\`: kind \`${n.kind}\` is not a known kind (see lib/clouds.mjs KINDS)`); continue; }
    if (n.in && !groups.has(n.in)) { f.add('E724', file, 0, `node \`${n.id}\` is in \`${n.in}\`, which is not a declared group`); continue; }
    if (!n.in && !OUTSIDE_KINDS.has(n.kind) && model.groups.length) f.add('W730', file, 0, `node \`${n.id}\` (${n.kind}) is drawn outside every group — say where it runs (\`in:\`), or it reads as outside the cloud`);
    if (n.kind.startsWith('k8s-') && !chain(model, n.id).some((g) => ['cluster', 'namespace', 'node-pool'].includes(g.kind))) f.add('E725', file, 0, `node \`${n.id}\` (${n.kind}) is a Kubernetes object outside a \`cluster\` group`);
    if (DATA_KINDS.has(n.kind)) {
      const pub = chain(model, n.id).find((g) => PUBLIC_GROUPS.has(groupKindOn(p, g.kind)) || g.public === true);
      if (pub) f.add('W731', file, 0, `node \`${n.id}\` (${n.kind}) holds data in public subnet \`${pub.id}\` — put it in a private subnet, or argue the exception in an ADR`);
    }
  }
  for (const [k, e] of model.edges.entries()) {
    for (const end of [e.from, e.to]) if (!ids.has(end)) f.add('E727', file, 0, `edge ${k + 1}: \`${end}\` is not a declared node or group`);
    if (!String(e.label ?? '').trim()) f.add('W732', file, 0, `edge ${k + 1} (${e.from} → ${e.to}) has no label — name the protocol and port, or what flows`);
  }
  if (model.nodes.length > MAX_NODES) f.add('W733', file, 0, `${model.nodes.length} components in one diagram (max ${MAX_NODES}) — split by environment or draw the cluster separately`);
  if (!String(model.title).trim()) f.add('W734', file, 0, 'no `title:` — the diagram is drawn untitled');
  return p;
}

// ---------------------------------------------------------------------------------------------
// Layout and draw.io XML
// ---------------------------------------------------------------------------------------------

const PAD = 20, HEAD = 34, GAP = 36, ROW_GAP = 24, CELL_W = 140, CELL_H = 96;

/**
 * The flow rank of every node: the longest path to it from a node nothing points at, so a request
 * reads left to right (users → edge → load balancer → service → store). Cycles are cut at the first
 * revisit. Nodes with no edges rank 0.
 */
export function ranks(model) {
  const ids = new Set(model.nodes.map((n) => n.id));
  const out = new Map(model.nodes.map((n) => [n.id, []]));
  const indeg = new Map(model.nodes.map((n) => [n.id, 0]));
  for (const e of model.edges) if (ids.has(e.from) && ids.has(e.to) && e.from !== e.to) { out.get(e.from).push(e.to); indeg.set(e.to, indeg.get(e.to) + 1); }
  const rank = new Map(model.nodes.map((n) => [n.id, 0]));
  const visit = (id, depth, path) => {
    if (path.has(id)) return;
    if (depth > rank.get(id)) rank.set(id, depth);
    path.add(id);
    for (const to of out.get(id)) visit(to, depth + 1, path);
    path.delete(id);
  };
  const roots = model.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  for (const r of roots.length ? roots : [model.nodes[0]?.id].filter(Boolean)) visit(r, 0, new Set());
  return rank;
}

/**
 * A deterministic layered layout. Every group is a box wrapping its children; inside a box,
 * children stand in columns by flow rank (a group ranks as its earliest node) and stack within a
 * column in declaration order. Edges then run column to column instead of through a sibling, and
 * the same model always gives the same picture, so a diff of the .drawio is a diff of the model.
 * A human can still drag things in draw.io afterwards.
 */
export function layout(model) {
  const rank = ranks(model);
  const kids = new Map([[null, []]]);
  for (const g of model.groups) kids.set(g.id, []);
  for (const n of model.nodes) (kids.get(n.in ?? null) ?? kids.get(null)).push({ type: 'node', item: n });
  for (const g of model.groups) (kids.get(g.in ?? null) ?? kids.get(null)).push({ type: 'group', item: g });
  const rankOf = (c) => {
    if (c.type === 'node') return rank.get(c.item.id) ?? 0;
    const rs = (kids.get(c.item.id) ?? []).map(rankOf);
    return rs.length ? Math.min(...rs) : 0;
  };
  const box = new Map();
  const size = (id) => {
    const items = kids.get(id) ?? [];
    const dims = items.map((c) => (c.type === 'group' ? size(c.item.id) : { w: CELL_W, h: CELL_H }));
    const cols = [...new Set(items.map(rankOf))].sort((x, y) => x - y);
    const colOf = (c) => cols.indexOf(rankOf(c));
    const colW = cols.map((_, k) => Math.max(0, ...items.map((c, i) => (colOf(c) === k ? dims[i].w : 0))));
    const colX = colW.map((_, k) => colW.slice(0, k).reduce((a, w) => a + w + GAP, 0));
    const colY = cols.map(() => 0);
    let h = 0;
    const top = id === null ? 0 : HEAD;
    const pad = id === null ? 0 : PAD;
    items.forEach((c, i) => {
      const k = colOf(c);
      const x = colX[k] + Math.round((colW[k] - dims[i].w) / 2);
      box.set(c.item.id, { x: x + pad, y: colY[k] + top, ...dims[i] });
      colY[k] += dims[i].h + ROW_GAP;
      h = Math.max(h, colY[k] - ROW_GAP);
    });
    const w = colW.length ? colX[colX.length - 1] + colW[colW.length - 1] : 160;
    return { w: Math.max(w, 160) + 2 * pad, h: (items.length ? h : 40) + top + pad };
  };
  const whole = size(null);
  clearStraightRuns(model, box);
  return { box, whole: measure(model, box, whole) };
}

/** Absolute top-left of a group or node, from the boxes relative to their parents. */
function absolute(model, box, id) {
  let x = 0, y = 0, cur = id;
  const parent = (k) => model.groups.find((g) => g.id === k)?.in ?? model.nodes.find((n) => n.id === k)?.in ?? null;
  for (let guard = 0; cur && guard < 50; guard++) { const b = box.get(cur); if (!b) break; x += b.x; y += b.y; cur = parent(cur); }
  return { x, y };
}

/**
 * An edge between two nodes on one row is a straight line, and it runs through every node standing
 * between them on that row. Drop each such node half a row, then grow its groups to fit. One pass
 * clears the common case (a service whose calls skip a sibling); draw.io can do the rest by hand.
 */
function clearStraightRuns(model, box) {
  const centre = (id) => { const a = absolute(model, box, id); return { x: a.x + CELL_W / 2, y: a.y + 32 }; };
  const moved = new Set();
  for (const e of model.edges) {
    if (!box.has(e.from) || !box.has(e.to) || !model.nodes.some((n) => n.id === e.from) || !model.nodes.some((n) => n.id === e.to)) continue;
    const a = centre(e.from), b = centre(e.to);
    if (Math.abs(a.y - b.y) > 8) continue;
    const [lo, hi] = a.x < b.x ? [a.x, b.x] : [b.x, a.x];
    for (const n of model.nodes) {
      if (n.id === e.from || n.id === e.to || moved.has(n.id)) continue;
      const c = centre(n.id);
      if (c.x > lo + 1 && c.x < hi - 1 && Math.abs(c.y - a.y) < 30) { box.get(n.id).y += Math.round(CELL_H * 0.75); moved.add(n.id); }
    }
  }
}

/** Grow every group to hold its children after a move, innermost first; returns the canvas size. */
function measure(model, box, whole) {
  const depth = (g) => { let d = 0, cur = g.in; while (cur && d < 50) { d++; cur = model.groups.find((x) => x.id === cur)?.in; } return d; };
  for (const g of [...model.groups].sort((a, b) => depth(b) - depth(a))) {
    const b = box.get(g.id);
    if (!b) continue;
    for (const c of [...model.groups, ...model.nodes].filter((x) => x.in === g.id)) {
      const cb = box.get(c.id);
      if (cb) { b.h = Math.max(b.h, cb.y + cb.h + PAD); b.w = Math.max(b.w, cb.x + cb.w + PAD); }
    }
  }
  let w = whole.w, h = whole.h;
  for (const c of [...model.groups, ...model.nodes].filter((x) => !x.in)) { const cb = box.get(c.id); if (cb) { w = Math.max(w, cb.x + cb.w); h = Math.max(h, cb.y + cb.h); } }
  return { w, h };
}

const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The `<mxGraphModel>` of a model drawn on provider `p`. */
export function toDrawio(model, p) {
  const { box, whole } = layout(model);
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const title = String(model.title || '').trim();
  const top = title ? 44 : 0;
  if (title) cells.push(`<mxCell id="title" value="${xmlEsc(`<b>${title}</b>${model.env ? ` &middot; ${model.env}` : ''} &middot; ${p.name}`)}" style="text;html=1;align=left;verticalAlign=middle;fontSize=16;fontColor=#232F3E;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="${Math.max(whole.w, 400)}" height="32" as="geometry"/></mxCell>`);
  const ordered = [];
  const visit = (parent) => { for (const g of model.groups.filter((x) => (x.in ?? null) === parent)) { ordered.push(g); visit(g.id); } };
  visit(null);
  for (const g of model.groups) if (!ordered.includes(g)) ordered.push(g); // orphans, already a finding
  for (const g of ordered) {
    const def = groupOf(p, groupKindOn(p, g.kind)) ?? { label: g.kind, style: 'container=1;html=1;dashed=1;fillColor=none;verticalAlign=top;align=left;' };
    const b = box.get(g.id);
    const label = g.label ? `${g.label}${g.cidr ? ` (${g.cidr})` : ''}` : `${def.label}${g.cidr ? ` (${g.cidr})` : ''}`;
    cells.push(`<mxCell id="${xmlEsc(g.id)}" value="${xmlEsc(label)}" style="${xmlEsc(def.style)}" vertex="1" parent="${xmlEsc(g.in ?? '1')}"><mxGeometry x="${b.x}" y="${b.y + (g.in ? 0 : top)}" width="${b.w}" height="${b.h}" as="geometry"/></mxCell>`);
  }
  for (const n of model.nodes) {
    const svc = serviceOf(p, n.kind);
    if (!svc) continue;
    const [service, stencil] = svc;
    const { w, h } = nodeSize(stencil);
    const b = box.get(n.id);
    const name = n.label ?? n.id;
    const card = stencil.card || stencil.box;
    const value = card ? `<b>${name}</b><br>${service}` : `<b>${name}</b><br><font style="font-size:10px">${service}${n.count ? ` &times;${n.count}` : ''}</font>`;
    const x = b.x + Math.round((CELL_W - w) / 2), y = b.y + (card ? 18 : 8) + (n.in ? 0 : top);
    cells.push(`<mxCell id="${xmlEsc(n.id)}" value="${xmlEsc(value)}" style="${xmlEsc(nodeStyle(p, stencil))}" vertex="1" parent="${xmlEsc(n.in ?? '1')}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
  }
  // Several edges leaving one side of a node share a port, and their labels print over each other.
  // Spread only those exits along that side; draw.io picks every entry, and a lone edge, itself.
  const abs = (id) => { const a = absolute(model, box, id); return { x: a.x + (model.groups.some((g) => g.id === id) ? 0 : CELL_W / 2), y: a.y }; };
  const exits = new Map();
  const sideOf = (e) => { const d = abs(e.to).x - abs(e.from).x; return d > CELL_W / 2 ? 'r' : d < -CELL_W / 2 ? 'l' : null; };
  model.edges.forEach((e, k) => { const sd = sideOf(e); if (!sd) return; const key = `${e.from}|${sd}`; if (!exits.has(key)) exits.set(key, []); exits.get(key).push(k); });
  model.edges.forEach((e, k) => {
    const sd = sideOf(e);
    const list = sd ? exits.get(`${e.from}|${sd}`) : null;
    const ports = list && list.length > 1 ? `exitX=${sd === 'r' ? 1 : 0};exitY=${(0.15 + (0.7 * list.indexOf(k)) / (list.length - 1)).toFixed(2)};exitDx=0;exitDy=0;` : '';
    const dashed = (e.async ? 'dashed=1;' : '') + ports;
    // The label sits a third of the way along, off the target's icon; jetty keeps the bend clear of it.
    cells.push(`<mxCell id="e${k + 1}" value="${xmlEsc(e.label ?? '')}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;strokeColor=#545B64;fontSize=10;fontColor=#545B64;labelBackgroundColor=#FFFFFF;jettySize=auto;orthogonalLoop=1;${dashed}" edge="1" parent="1" source="${xmlEsc(e.from)}" target="${xmlEsc(e.to)}"><mxGeometry x="-0.3" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`);
  });
  return `<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0"><root>${cells.join('')}</root></mxGraphModel>`;
}

/** A complete .drawio file: one page per provider. */
export function drawioFile(pages) {
  const diag = pages.map(({ name, xml }, k) => `<diagram id="p${k + 1}" name="${xmlEsc(name)}">${xml}</diagram>`).join('');
  return `<mxfile host="sdlc topology.mjs" agent="topology.mjs" version="1">${diag}</mxfile>\n`;
}

/** The model redrawn on another provider: neutral group kinds map across; provider-only kinds do not. */
export function retarget(model, id) {
  return { ...model, provider: id, groups: model.groups.map((g) => ({ ...g, kind: Object.keys(NEUTRAL_GROUPS).find((k) => Object.values(NEUTRAL_GROUPS[k]).includes(g.kind) && NEUTRAL_GROUPS[k][model.provider] === g.kind) ?? g.kind })) };
}

// ---------------------------------------------------------------------------------------------
// SVG through draw.io's own renderer
// ---------------------------------------------------------------------------------------------

/** The throwaway page: draw.io's viewer draws each model and leaves the SVG on window.__topology. */
export function renderPage(models, base, stencilSets) {
  const data = JSON.stringify({ models, stencilSets }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><script>window.STENCIL_PATH='${base}/stencils';window.IMAGE_PATH='${base}/images';window.mxBasePath='${base}/mxgraph';window.GRAPH_IMAGE_PATH='${base}/img';</script>
<script src="${base}/js/viewer-static.min.js"></script></head><body><div id="g" style="width:2400px;height:1600px"></div><script>
window.__topology = (async () => {
  if (!window.Graph) return { error: 'draw.io did not load from ${base} — pass --drawio <local webapp dir> when offline, or --no-svg' };
  const { models, stencilSets } = ${data};
  for (const x of stencilSets) mxStencilRegistry.parseStencilSet(mxUtils.parseXml(x).documentElement);
  const out = [];
  for (const xml of models) {
    try {
      const div = document.getElementById('g'); div.innerHTML = '';
      const graph = new Graph(div); graph.setEnabled(false);
      const doc = mxUtils.parseXml(xml);
      new mxCodec(doc).decode(doc.documentElement, graph.getModel());
      await new Promise((ok) => setTimeout(ok, 1500));
      out.push({ svg: mxUtils.getXml(graph.getSvg(null, 1, 16)) });
    } catch (e) { out.push({ error: String(e && e.message || e) }); }
  }
  return { out };
})();
</script></body></html>`;
}

/** The image paths an SVG references from draw.io's image library, inlined so the file stands alone. */
async function inlineImages(svg, base, cache) {
  const refs = [...new Set([...svg.matchAll(/href="([^"]*img\/lib\/[^"]+)"/g)].map((m) => m[1]))];
  let out = svg;
  for (const ref of refs) {
    const rel = ref.slice(ref.indexOf('img/lib/'));
    if (!cache.has(rel)) {
      const res = await fetch(`${base}/${rel}`);
      cache.set(rel, res.ok ? `data:image/svg+xml;base64,${Buffer.from(await res.text()).toString('base64')}` : null);
    }
    if (cache.get(rel)) out = out.split(`"${ref}"`).join(`"${cache.get(rel)}"`);
  }
  return out;
}

/** Draw every model in one headless browser. Returns one { svg } or { error } per model. */
export async function renderSvgs(models, { browser, base = DRAWIO_URL }) {
  const { findBrowser, launchBrowser } = await import('./ui-snap.mjs');
  // kubernetes2 holds the glyphs inside the K8s icons; the viewer does not load it on demand.
  const stencilSets = [];
  try { const r = await fetch(`${base}/stencils/kubernetes2.xml`); if (r.ok) stencilSets.push(await r.text()); } catch { /* drawn without glyphs */ }
  const dir = mkdtempSync(join(tmpdir(), 'topology-'));
  const page = join(dir, 'render.html');
  writeFileSync(page, renderPage(models, base, stencilSets));
  const { cdp, close } = launchBrowser(findBrowser({ flag: browser }));
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => cdp.send(m, p, sessionId);
    await s('Page.enable');
    await s('Page.navigate', { url: pathToFileURL(page).href });
    for (let t = 0; t < 600; t++) {
      const r = await s('Runtime.evaluate', { expression: 'window.__topology', awaitPromise: true, returnByValue: true }).catch(() => null);
      const v = r?.result?.value;
      if (v) {
        if (v.error) throw new Error(v.error);
        const cache = new Map();
        for (const o of v.out) if (o.svg) o.svg = await inlineImages(o.svg, base, cache);
        return v.out;
      }
      await new Promise((ok) => { setTimeout(ok, 100); });
    }
    throw new Error('the draw.io page never finished');
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// The service table
// ---------------------------------------------------------------------------------------------

/** Markdown: one row per component, one column per provider asked for. */
export function serviceTable(model, ids) {
  const providers = ids.map(providerOf).filter(Boolean);
  const groups = new Map(model.groups.map((g) => [g.id, g]));
  const head = `| Component | Kind | ${providers.map((p) => p.name).join(' | ')} | Runs in |`;
  const sep = `|---|---|${providers.map(() => '---|').join('')}---|`;
  const rows = model.nodes.map((n) => {
    const where = n.in ? (groups.get(n.in)?.label ?? n.in) : '—';
    return `| ${n.label ?? n.id} | \`${n.kind}\` | ${providers.map((p) => serviceOf(p, n.kind)?.[0] ?? '—').join(' | ')} | ${where} |`;
  });
  return [head, sep, ...rows].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Drift against IaC
// ---------------------------------------------------------------------------------------------

/** The resource types declared under `dirs`: Terraform/OpenTofu `resource "<type>"`, Bicep `resource x '<type>@…'`, Kubernetes `kind:`. */
export function iacResources(dirs) {
  const found = [];
  const walk = (p) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) {
      for (const n of readdirSync(p)) if (!n.startsWith('.') && !['node_modules', '.terraform', 'vendor'].includes(n)) walk(join(p, n));
      return;
    }
    if (!/\.(tf|tofu|bicep|ya?ml|json)$/.test(p)) return;
    const text = readFileSync(p, 'utf8');
    const rel = relative(process.cwd(), p).replace(/\\/g, '/');
    for (const m of text.matchAll(/^\s*resource\s+"([a-z0-9_]+)"\s+"([^"]+)"/gm)) found.push({ type: m[1], name: m[2], file: rel });
    for (const m of text.matchAll(/^\s*resource\s+(\w+)\s+'([A-Za-z0-9.]+\/[A-Za-z0-9./]+)@[^']+'/gm)) found.push({ type: m[2], name: m[1], file: rel });
    if (/\.ya?ml$/.test(p)) for (const doc of text.split(/^---\s*$/m)) {
      const kind = /^kind:\s*(\w+)\s*$/m.exec(doc)?.[1];
      const name = /^\s{2}name:\s*["']?([\w.-]+)/m.exec(doc)?.[1] ?? '';
      if (kind && /^apiVersion:/m.test(doc)) found.push({ type: kind, name, file: rel });
    }
  }; // eslint-disable-line
  for (const d of dirs) walk(d);
  return found;
}

/** E740 for a declared component with no resource of its kind, W741 for a mapped resource no component declares. */
export function checkDrift(model, p, resources, file, f) {
  // A `cluster` group is the provider's managed Kubernetes resource (EKS, AKS, GKE, ACK, OKE).
  const map = { ...(IAC[p.id] ?? {}), ...K8S_IAC, ...(IAC[p.id]?.kubernetes ? { cluster: IAC[p.id].kubernetes } : {}) };
  const re = (kind) => (map[kind] ? new RegExp(`^(?:${map[kind]})$`) : null);
  const used = new Set();
  const items = [...model.nodes.map((n) => ({ ...n, what: 'component' })), ...model.groups.map((g) => ({ ...g, kind: groupKindOn(p, g.kind), what: 'group' }))];
  for (const it of items) {
    const r = re(it.kind);
    if (!r || it.iac === false) continue;
    const hits = resources.filter((x) => r.test(x.type) && (!it.iac || x.name === it.iac));
    if (!hits.length) f.add('E740', file, 0, `${it.what} \`${it.id}\` (${it.kind}) has no ${it.iac ? `resource named \`${it.iac}\` of type` : 'resource of type'} ${map[it.kind].split('|').slice(0, 3).join(' / ')} in the IaC — build it, or set \`iac: false\` with the reason in the artifact`);
    for (const h of hits) used.add(h);
  }
  const mapped = Object.entries(map).filter(([k]) => items.some((i) => i.kind === k) || true);
  for (const res of resources) {
    if (used.has(res)) continue;
    const kind = mapped.find(([, pat]) => new RegExp(`^(?:${pat})$`).test(res.type))?.[0];
    if (kind && !['k8s-configmap', 'k8s-secret', 'k8s-sa', 'namespace', 'k8s-service'].includes(kind)) f.add('W741', res.file, 0, `${res.type} \`${res.name}\` (${kind}) is in the IaC and not in topology.yaml — the diagram is missing a component`);
  }
}

// ---------------------------------------------------------------------------------------------
// index.html
// ---------------------------------------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function indexHtml(slug, pages, tableMd, srcRel) {
  const rows = tableMd.split('\n').filter((l, k) => k !== 1).map((l, k) => {
    const cells = l.split('|').slice(1, -1).map((c) => esc(c.trim()).replace(/`([^`]+)`/g, '<code>$1</code>'));
    return k === 0 ? `<tr>${cells.map((c) => `<th>${c}</th>`).join('')}</tr>` : `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  }).join('\n');
  const cards = pages.map((pg) => `<section id="${esc(pg.file)}"><h2>${esc(pg.name)}</h2><p class="meta"><a href="${esc(pg.file)}.drawio">${esc(pg.file)}.drawio</a> (open in draw.io to edit) · ${pg.svg ? `<a href="${esc(pg.file)}.svg">${esc(pg.file)}.svg</a>` : `<span class="err">${esc(pg.error ?? 'SVG not drawn')}</span>`}</p>${pg.svg ?? ''}</section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cloud topology · ${esc(slug)}</title>
<style>body{margin:0;padding:24px 16px;font:14px/1.5 Arial,Helvetica,sans-serif;background:#fff;color:#1b1b1b}main{max-width:1400px;margin:0 auto}section{border:1px solid #d0d0d0;border-radius:6px;padding:16px;margin:0 0 24px;overflow-x:auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0}.meta{color:#5a5a5a;margin:4px 0 12px}.err{color:#a00}svg{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;margin:0 0 24px}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #e3e3e3}th{background:#f4f4f4}code{font-size:12px}a{color:#0b57d0}</style></head>
<body><main><h1>Cloud topology · ${esc(slug)}</h1><p class="meta">Source: <code>${esc(srcRel)}</code>. Generated by topology.mjs; the YAML is the source — if this page and it disagree, the YAML is right.</p>
<div style="overflow-x:auto"><table>${rows}</table></div>
${cards}</main></body></html>\n`;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export async function main(argv) {
  const args = parseArgs(argv, ['json', 'no-svg']);
  const [cmd, target] = args._;
  if (!['check', 'render', 'drift', 'table'].includes(cmd) || !target) {
    console.error('usage: topology.mjs check|render|drift|table <slug> | <topology.yaml> [--as <providers>] [--iac <dirs>] [--root <root>] [--out <dir>] [--no-svg] [--json]');
    return 2;
  }
  const explicit = args.root ?? args.dev;
  const root = findRoot({ explicit: typeof explicit === 'string' ? explicit : null }).root;
  const bySlug = /^[a-z0-9][a-z0-9-]*$/.test(target) && !existsSync(target);
  const file = bySlug ? join(root, 'deployment', target, 'topology.yaml') : resolve(target);
  const slug = bySlug ? target : (file.replace(/\\/g, '/').match(/\/deployment\/([^/]+)\//)?.[1] ?? 'topology');
  if (!existsSync(file)) { console.error(`topology: no ${relative(process.cwd(), file).replace(/\\/g, '/')} — write it from <root>/_templates/topology.yaml`); return 2; }
  const rel = relative(process.cwd(), file).replace(/\\/g, '/');
  let model;
  try { model = loadTopology(file); } catch (err) { console.error(`topology: ${rel}: ${err.message}`); return 2; }
  const f = new Findings();
  const p = checkTopology(model, rel, f);
  const as = String(args.as ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const id of as) if (!providerOf(id)) { console.error(`topology: --as ${id}: not one of ${PROVIDERS.map((x) => x.id).join(', ')}`); return 2; }
  const ids = [...new Set([model.provider, ...as])].filter((id) => providerOf(id));
  const summary = { provider: model.provider, components: model.nodes.length, groups: model.groups.length };

  if (cmd === 'table') {
    if (f.errors.length) return report('topology', f, summary, { json: args.json });
    console.log(serviceTable(model, ids));
    return 0;
  }
  if (cmd === 'drift') {
    const dirs = String(args.iac ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!dirs.length) { console.error('topology: drift needs --iac <dir>[,<dir>...] — the Terraform, Bicep or manifest folders'); return 2; }
    if (p) {
      const resources = iacResources(dirs.map((d) => resolve(d)));
      summary.resources = resources.length;
      if (!resources.length) f.add('E742', rel, 0, `no IaC resource found under ${dirs.join(', ')} — point --iac at the folder that builds this topology`);
      else checkDrift(model, p, resources, rel, f);
    }
    return report('topology', f, summary, { json: args.json });
  }
  if (cmd === 'render' && p && !f.errors.length) {
    const out = resolve(args.out ?? join(root, 'diagrams', slug, 'cloud'));
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const pages = ids.map((id) => {
      const prov = providerOf(id);
      const m = id === model.provider ? model : retarget(model, id);
      const pf = new Findings();
      checkTopology(m, rel, pf);
      for (const x of pf.errors) f.add(x.code === 'E725' || x.code === 'E726' || x.code === 'E722' ? 'W735' : x.code, rel, 0, `--as ${id}: ${x.message}`);
      return { id, name: `${model.title || slug} — ${prov.name}`, file: `${slug}-${id}`, xml: toDrawio(m, prov) };
    });
    for (const pg of pages) writeFileSync(join(out, `${pg.file}.drawio`), drawioFile([pg]));
    if (!args['no-svg']) {
      try {
        const res = await renderSvgs(pages.map((pg) => pg.xml), { browser: args.browser, base: args.drawio ?? DRAWIO_URL });
        pages.forEach((pg, k) => {
          if (res[k]?.svg) { pg.svg = res[k].svg; writeFileSync(join(out, `${pg.file}.svg`), `${pg.svg}\n`); }
          else { pg.error = res[k]?.error ?? 'not drawn'; f.add('E743', rel, 0, `draw.io could not draw the ${pg.id} page: ${pg.error}`); }
        });
      } catch (err) {
        f.add('W744', rel, 0, `SVG not drawn (${err.message}); the .drawio files are written — open them in draw.io, or rerun with a browser and network`);
      }
    }
    writeFileSync(join(out, 'index.html'), indexHtml(slug, pages, serviceTable(model, ids), relative(out, file).replace(/\\/g, '/')));
    summary.open = join(out, 'index.html').replace(/\\/g, '/');
  }
  return report('topology', f, summary, { json: args.json });
}

if (process.argv[1]?.endsWith('topology.mjs')) {
  process.exitCode = await main(process.argv.slice(2));
}

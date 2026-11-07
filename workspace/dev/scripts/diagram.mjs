#!/usr/bin/env node
/**
 * diagram.mjs — check the mermaid diagrams inside an artifact, and render them (DEV-CONTRACTS §13.8).
 *
 * A diagram in this pipeline is a ```mermaid block inside the artifact it illustrates, so it is
 * diffed, reviewed and hashed with that artifact. This script holds the notation standards
 * `dev-drawing-diagrams` names, so a reviewer does not have to remember them:
 *
 *   node <root>/scripts/diagram.mjs check  <slug> | <artifact.md|dir>...
 *   node <root>/scripts/diagram.mjs render <slug>
 *
 * A bare <slug> means every artifact of that slug, in gate order: <root>/requirements/<slug>/,
 * <root>/design/<slug>/, <root>/data/<slug>/ … <root>/monitoring/<slug>/.
 *
 *   check     static rules, no browser: a known diagram type, a title, declared participants, a
 *             failure path in every sequence, a guard on every decision branch, a key on every
 *             entity, and every name the diagram draws also named in the prose.
 *   render    check, then parse and draw every block with mermaid in headless Edge/Chrome. The
 *             output always lands in ONE folder per slug, so nobody hunts for it:
 *
 *               <root>/diagrams/<slug>/index.html                       open this: a table of contents
 *                                                                       by gate, then every diagram
 *               <root>/diagrams/<slug>/01-G2-architecture-<title>.svg   one SVG each, numbered in
 *               <root>/diagrams/<slug>/02-G3-data-model-<title>.svg     gate order
 *
 *             The folder is rebuilt on every run, so a stale SVG never lingers. A block mermaid
 *             cannot parse is an error here even when `check` passed it.
 *
 *   --root <dir>       the SDLC root (DEV-CONTRACTS §2; `--dev` is the older spelling). Default:
 *                      DEV-PROFILE `SDLC root`, else `.sdlc/` or `dev/`, whichever exists
 *   --out <dir>        render: override <root>/diagrams/<slug>
 *   --mermaid <file>   render: a local mermaid.min.js instead of the pinned CDN build
 *   --browser <path>   render: Edge or Chrome; else $UI_SNAP_BROWSER, else the usual install paths
 *   --json             print the findings as JSON
 *
 * No dependency: the browser plumbing is ui-snap.mjs's. Exit 0 clean · 1 an error · 2 usage.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Findings, parseArgs, report } from './lib/check.mjs';
import { findRoot } from './lib/root.mjs';

export const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
export const MAX_NODES = 20;

/** The diagram types this bundle uses, and the standard each one is drawn to. */
export const TYPES = {
  sequenceDiagram: 'UML sequence',
  flowchart: 'UML activity / DFD / screen flow / pipeline / deployment',
  graph: 'UML activity / DFD / screen flow / pipeline / deployment',
  erDiagram: 'ER, crow\'s foot',
  stateDiagram: 'UML state machine',
  'stateDiagram-v2': 'UML state machine',
  classDiagram: 'UML class',
  C4Context: 'C4 level 1',
  C4Container: 'C4 level 2',
  C4Component: 'C4 level 3',
  C4Deployment: 'C4 deployment',
  C4Dynamic: 'C4 dynamic',
  gantt: 'timeline',
};

/** The stage folders a slug's artifacts live in, in gate order (§2). */
export const STAGES = [
  ['requirements', 'G1'], ['design', 'G2'], ['data', 'G3'], ['api', 'G4'], ['ui', 'G5'], ['plan', 'G6'],
  ['implementation', 'G7'], ['verification', 'G8'], ['release', 'G9'], ['deployment', 'G10'], ['monitoring', 'G11'],
];

/** The gate an artifact belongs to, from its stage folder; '' outside the ladder. */
export function gateOf(file) {
  const parts = file.replace(/\\/g, '/').split('/');
  for (let i = parts.length - 3; i >= 0; i--) {
    const hit = STAGES.find(([stage]) => stage === parts[i]);
    if (hit) return hit[1];
  }
  return '';
}

/** The slug of an artifact path (`<stage>/<slug>/x.md`), or null. */
export function slugOf(file) {
  const parts = file.replace(/\\/g, '/').split('/');
  for (let i = parts.length - 3; i >= 0; i--) if (STAGES.some(([stage]) => stage === parts[i])) return parts[i + 1];
  return null;
}

/** Every artifact of a slug under the SDLC root `dev` (`.sdlc/` or `dev/`), in gate order. */
export function slugFiles(dev, slug) {
  const out = [];
  for (const [stage] of STAGES) {
    const dir = join(dev, stage, slug);
    if (!existsSync(dir)) continue;
    for (const n of readdirSync(dir).sort()) if (n.endsWith('.md')) out.push(join(dir, n));
  }
  return out;
}

/** Every ```mermaid block of a markdown text: its source, first body line, and title. */
export function extractBlocks(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```mermaid\s*$/.test(lines[i])) continue;
    const start = i + 1;
    let j = start;
    while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) j++;
    out.push({ line: start, source: lines.slice(start, j).join('\n') });
    i = j;
  }
  return out.map((b) => ({ ...b, ...headerOf(b.source) }));
}

/** The type keyword and title of one block, past any `---` front matter and `%%` comments. */
export function headerOf(source) {
  const lines = source.split('\n');
  let title = null;
  let i = 0;
  if (lines[0]?.trim() === '---') {
    for (i = 1; i < lines.length && lines[i].trim() !== '---'; i++) {
      const m = lines[i].match(/^\s*title:\s*(.+?)\s*$/);
      if (m) title = m[1].replace(/^["']|["']$/g, '');
    }
    i++;
  }
  const body = lines.slice(i).filter((l) => l.trim() && !/^\s*%%/.test(l));
  const type = body[0]?.trim().split(/\s+/)[0] ?? '';
  const t = body.find((l) => /^\s*title\s+\S/.test(l));
  if (!title && t) title = t.trim().replace(/^title\s+/, '');
  return { type, title, body: body.slice(1) };
}

/** The prose of an artifact — fences removed — squashed for name matching. */
export function proseKey(text) {
  return squash(text.replace(/\r\n/g, '\n').replace(/^\s*```[\s\S]*?^\s*```\s*$/gm, ''));
}
const squash = (s) => String(s).toLowerCase().replace(/<br\s*\/?>/g, ' ').replace(/[^a-z0-9]+/g, '');

/** Sequence: declared participants, and the endpoints of every message. */
function sequenceFacts(body) {
  const declared = new Map();
  const used = new Map();
  let failurePath = false;
  body.forEach((l, k) => {
    const d = l.match(/^\s*(participant|actor)\s+([^\s]+)(?:\s+as\s+(.+?))?\s*$/);
    if (d) { declared.set(d[2], d[3] ?? d[2]); return; }
    if (/^\s*(alt|opt|break|critical)\b/.test(l)) failurePath = true;
    const m = l.match(/^\s*([^\s:+-][^:]*?)\s*(?:-->>|->>|-->|->|--x|-x|--\)|-\))[+-]?\s*([^:]+?)\s*:/);
    if (m) for (const p of [m[1], m[2]]) if (!used.has(p)) used.set(p, k);
  });
  return { declared, used, failurePath };
}

/** Flowchart: decision nodes, and the edges leaving each, labelled or not. */
function flowchartFacts(body) {
  const decisions = new Map();
  const nodes = new Map();
  for (const l of body) {
    for (const m of l.matchAll(/\b([A-Za-z_][\w-]*)\s*(\{(?!\{)([^{}]*)\}|\[\[?([^\]]*)\]?\]|\(\(?([^()]*)\)?\)|\[\(([^)]*)\)\]|>([^\]]*)\])/g)) {
      const label = (m[3] ?? m[4] ?? m[5] ?? m[6] ?? m[7] ?? '').replace(/^["']|["']$/g, '');
      nodes.set(m[1], label);
      if (m[3] !== undefined) decisions.set(m[1], label);
    }
  }
  const unguarded = [];
  for (const [id] of decisions) {
    const out = body.filter((l) => new RegExp(`(^|[\\s;&])${id}(\\s*\\{[^}]*\\})?\\s*(-->|-\\.->|==>|--\\s|-\\.\\s|==\\s)`).test(l));
    if (out.length && out.some((l) => !new RegExp(`${id}(\\s*\\{[^}]*\\})?\\s*(--\\s+[^>-]|-\\.\\s+[^>]|==\\s+[^>=]|(-->|-\\.->|==>)\\s*\\|)`).test(l))) unguarded.push(id);
  }
  return { nodes, decisions, unguarded };
}

/** ER: entities and whether each declares a primary key. */
function erFacts(body) {
  const entities = new Map();
  let current = null;
  for (const l of body) {
    const open = l.match(/^\s*([A-Za-z_][\w-]*)(?:\s*\["[^"]*"\])?\s*\{\s*$/);
    if (open) { current = open[1]; entities.set(current, false); continue; }
    if (current && /^\s*\}\s*$/.test(l)) { current = null; continue; }
    if (current && /\bPK\b/.test(l)) entities.set(current, true);
    const rel = l.match(/^\s*([A-Za-z_][\w-]*)\s+[|}o][|o]--?[.-]?[|o][|{o]\s+([A-Za-z_][\w-]*)\s*:/);
    if (rel) for (const e of [rel[1], rel[2]]) if (!entities.has(e)) entities.set(e, null);
  }
  return { entities };
}

/** C4: the elements a C4 diagram names, by alias and label. */
function c4Facts(body) {
  const elements = new Map();
  for (const l of body) {
    const m = l.match(/^\s*(Person|System|Container|Component|ContainerDb|ComponentDb|SystemDb|ContainerQueue|SystemQueue|Node|Deployment_Node)(?:_Ext)?\s*\(\s*([\w-]+)\s*,\s*"([^"]*)"/);
    if (m) elements.set(m[2], m[3]);
  }
  return { elements };
}

/** The findings for one block of one artifact. */
export function checkBlock(block, prose, file, f) {
  const at = block.line;
  if (!TYPES[block.type]) {
    f.add('E701', file, at, `\`${block.type || '(nothing)'}\` is not a diagram type this bundle draws — use one of ${Object.keys(TYPES).filter((t) => t !== 'graph' && t !== 'stateDiagram').join(', ')}`);
    return;
  }
  if (!block.body.some((l) => l.trim())) { f.add('E702', file, at, `the ${block.type} has no content`); return; }
  if (!block.title) f.add('W710', file, at, `the ${TYPES[block.type]} diagram has no title — add front matter \`title:\` saying what it shows`);
  const missing = (names, what) => {
    for (const [id, label] of names) {
      if (prose.includes(squash(label)) || prose.includes(squash(id))) continue;
      f.add('W716', file, at, `${what} "${label}" is drawn but the prose never names it — the artifact is the authority; name it there or remove it`);
    }
  };
  if (block.type === 'sequenceDiagram') {
    const s = sequenceFacts(block.body);
    for (const [p] of s.used) if (!s.declared.has(p)) f.add('W711', file, at, `participant "${p}" is used without a participant/actor line — declare every lifeline, in order`);
    if (!s.failurePath) f.add('W712', file, at, 'a sequence with no alt/opt/break block shows the happy path only — draw the failure path (timeout, 4xx, 5xx, retry)');
    if (s.declared.size > MAX_NODES) f.add('W717', file, at, `${s.declared.size} lifelines — more than ${MAX_NODES}; split by use case`);
    missing([...s.declared].filter(([id, label]) => !/^(user|client|browser)$/i.test(label)), 'participant');
  } else if (block.type === 'flowchart' || block.type === 'graph') {
    const g = flowchartFacts(block.body);
    for (const id of g.unguarded) f.add('W713', file, at, `decision "${g.decisions.get(id) || id}" has a branch with no guard — label every edge out of a decision (\`-->|yes|\`)`);
    if (g.nodes.size > MAX_NODES * 2) f.add('W717', file, at, `${g.nodes.size} nodes — more than ${MAX_NODES * 2}; split it or use subgraphs per boundary`);
  } else if (block.type === 'erDiagram') {
    const e = erFacts(block.body);
    for (const [name, pk] of e.entities) if (pk === false) f.add('W714', file, at, `entity ${name} declares no PK attribute`);
    missing([...e.entities.keys()].map((n) => [n, n.replace(/_/g, ' ')]), 'entity');
  } else if (block.type.startsWith('C4')) {
    const c = c4Facts(block.body);
    if (c.elements.size > MAX_NODES) f.add('W717', file, at, `${c.elements.size} elements — more than ${MAX_NODES}; go one C4 level down instead`);
    missing(c.elements, 'element');
  }
}

/** The markdown files named — a directory contributes every .md under it. */
export function collect(paths) {
  const out = [];
  const walk = (p) => {
    if (statSync(p).isDirectory()) {
      for (const n of readdirSync(p)) if (!n.startsWith('.') && n !== 'node_modules') walk(join(p, n));
    } else if (p.endsWith('.md')) out.push(p);
  };
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`${p}: no such file or directory`);
    walk(p);
  }
  return out;
}

/** Static check of every block in `files`. Returns the findings and the blocks, per file. */
export function checkFiles(files) {
  const f = new Findings();
  const docs = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const blocks = extractBlocks(text);
    const prose = proseKey(text);
    const rel = relative(process.cwd(), file).replace(/\\/g, '/');
    for (const b of blocks) checkBlock(b, prose, rel, f);
    docs.push({ file, rel, blocks });
  }
  return { findings: f, docs };
}

export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const gateNo = (g) => (g ? Number(g.slice(1)) : 99);

/**
 * Every block of every document, numbered in gate order as `NN-G#-<artifact>-<title>`. The number
 * is the reading order of index.html, so the folder listing and the page agree.
 */
export function planItems(docs) {
  const ordered = docs.map((d, k) => ({ d, k })).sort((a, b) => gateNo(gateOf(a.d.file)) - gateNo(gateOf(b.d.file)) || a.k - b.k);
  const items = [];
  for (const { d } of ordered) {
    const gate = gateOf(d.file);
    const artifact = basename(d.file, '.md');
    d.blocks.forEach((b, j) => {
      const n = String(items.length + 1).padStart(2, '0');
      const title = slugify(b.title ?? '') || `diagram-${j + 1}`;
      items.push({ ...b, gate, artifact, rel: d.rel, file: d.file, name: [n, gate, artifact, title].filter(Boolean).join('-') });
    });
  }
  return items;
}

/** The throwaway page that parses and draws every block, leaving the result on window.__diagrams. */
export function renderPage(sources, mermaidSrc) {
  // Sources travel as JSON, never as markup: a `</script>` in a label must not end the script.
  const data = JSON.stringify(sources).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><script src="${mermaidSrc}"></script></head><body><script>
window.__diagrams = (async () => {
  if (!window.mermaid) return { error: 'mermaid did not load from ${mermaidSrc} — pass --mermaid <local mermaid.min.js> when offline' };
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', fontFamily: 'Arial, Helvetica, sans-serif' });
  const out = [];
  for (const [k, src] of ${data}.entries()) {
    try {
      await mermaid.parse(src);
      const { svg } = await mermaid.render('d' + k, src);
      out.push({ svg });
    } catch (e) { out.push({ error: String(e && e.message || e).split('\\n').slice(0, 4).join(' ') }); }
  }
  return { out };
})();
</script></body></html>`;
}

/** Parse and draw every block in one headless browser. Returns one { svg } or { error } per source. */
export async function renderAll(sources, { browser, mermaidSrc }) {
  const { findBrowser, launchBrowser } = await import('./ui-snap.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'diagram-'));
  const page = join(dir, 'render.html');
  writeFileSync(page, renderPage(sources, mermaidSrc));
  const { cdp, close } = launchBrowser(findBrowser({ flag: browser }));
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => cdp.send(m, p, sessionId);
    await s('Page.enable');
    await s('Page.navigate', { url: pathToFileURL(page).href });
    for (let t = 0; t < 200; t++) {
      const r = await s('Runtime.evaluate', { expression: 'window.__diagrams', awaitPromise: true, returnByValue: true }).catch(() => null);
      const v = r?.result?.value;
      if (v) {
        if (v.error) throw new Error(v.error);
        return v.out;
      }
      await new Promise((ok) => { setTimeout(ok, 100); });
    }
    throw new Error('the render page never finished');
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What a diagram is, for the index: a flowchart says so in its title (`Checkout — activity`). */
export function kindOf(it) {
  if (it.type !== 'flowchart' && it.type !== 'graph') return TYPES[it.type] ?? it.type;
  const said = String(it.title ?? '').split(/\s+[—–-]\s+/).slice(1).join(' ').trim();
  return said ? `${said} (flowchart)` : 'flowchart';
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * One self-contained page per slug, readable with no network: a table of contents (number, gate,
 * artifact, diagram, kind, file), then every diagram in that order, each linking to its source.
 */
export function indexHtml(name, items, outDir) {
  const src = (it) => relative(outDir, it.file).replace(/\\/g, '/');
  const no = (it) => it.name.slice(0, 2);
  const title = (it) => esc(it.title ?? '(untitled)');
  const rows = items.map((it) => `<tr><td>${no(it)}</td><td>${esc(it.gate || '—')}</td><td><a href="${esc(src(it))}">${esc(it.artifact)}.md</a>:${it.line}</td><td><a href="#${esc(it.name)}">${title(it)}</a></td><td>${esc(kindOf(it))}</td><td>${it.svg ? `<a href="${esc(it.name)}.svg">${esc(it.name)}.svg</a>` : '<span class="err">not drawn</span>'}</td></tr>`).join('\n');
  const cards = items.map((it) => `<section id="${esc(it.name)}"><h2>${no(it)} · ${title(it)}</h2><p class="meta">${esc(it.gate || '—')} · ${esc(kindOf(it))} · source <a href="${esc(src(it))}">${esc(it.rel)}:${it.line}</a> · <a href="#top">top</a></p>${it.svg ?? `<pre class="err">${esc(it.error ?? 'not drawn')}</pre>`}</section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Diagrams · ${esc(name)}</title>
<style>body{margin:0;padding:24px 16px;font:14px/1.5 Arial,Helvetica,sans-serif;background:#fff;color:#1b1b1b}main{max-width:1200px;margin:0 auto}section{border:1px solid #d0d0d0;border-radius:6px;padding:16px;margin:0 0 24px;overflow-x:auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0}.meta{color:#5a5a5a;margin:4px 0 12px}.err{color:#a00;white-space:pre-wrap}svg{max-width:100%;height:auto}.toc{overflow-x:auto;margin:0 0 32px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #e3e3e3;white-space:nowrap}th{background:#f4f4f4}a{color:#0b57d0}</style></head>
<body><main id="top"><h1>Diagrams · ${esc(name)}</h1><p class="meta">${items.length} diagram(s) in gate order. Rendered by diagram.mjs. The artifact is the source: if this page and the artifact disagree, the artifact is right.</p>
<div class="toc"><table><thead><tr><th>#</th><th>Gate</th><th>Artifact</th><th>Diagram</th><th>Kind</th><th>File</th></tr></thead><tbody>
${rows}
</tbody></table></div>
${cards}</main></body></html>\n`;
}

export async function main(argv) {
  const args = parseArgs(argv, ['json']);
  const [cmd, ...paths] = args._;
  if (!['check', 'render'].includes(cmd) || !paths.length) {
    console.error('usage: diagram.mjs check|render <slug> | <artifact.md|dir>... [--root <root>] [--out <dir>] [--mermaid <file>] [--browser <path>] [--json]');
    return 2;
  }
  // The SDLC root (§2): --root (or the older --dev), else the profile, else .sdlc/ or dev/.
  const explicit = args.root ?? args.dev;
  const dev = findRoot({ explicit: typeof explicit === 'string' ? explicit : null }).root;
  const bySlug = paths.length === 1 && /^[a-z0-9][a-z0-9-]*$/.test(paths[0]) && !existsSync(paths[0]);
  let files;
  try { files = bySlug ? slugFiles(dev, paths[0]) : collect(paths); } catch (err) { console.error(`diagram: ${err.message}`); return 2; }
  if (bySlug && !files.length) { console.error(`diagram: no artifact of slug "${paths[0]}" under ${dev.replace(/\\/g, '/')}`); return 2; }
  const { findings, docs } = checkFiles(files);
  const items = planItems(docs);
  const summary = { files: files.length, diagrams: items.length };
  if (cmd === 'render' && items.length) {
    const slugs = new Set(files.map(slugOf));
    const name = bySlug ? paths[0] : (slugs.size === 1 && [...slugs][0]) || 'diagrams';
    const out = resolve(args.out ?? join(dev, 'diagrams', name));
    const mermaidSrc = args.mermaid ? pathToFileURL(resolve(args.mermaid)).href : MERMAID_URL;
    let results;
    try { results = await renderAll(items.map((it) => it.source), { browser: args.browser, mermaidSrc }); } catch (err) { console.error(`diagram: ${err.message}`); return 1; }
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    let written = 0;
    items.forEach((it, k) => {
      Object.assign(it, results[k]);
      if (it.error) { findings.add('E703', it.rel, it.line, `mermaid cannot parse this ${it.type}: ${it.error}`); return; }
      if (!/<svg[\s>]/.test(it.svg ?? '')) { delete it.svg; findings.add('E704', it.rel, it.line, 'mermaid drew nothing'); return; }
      writeFileSync(join(out, `${it.name}.svg`), `${it.svg}\n`);
      written++;
    });
    writeFileSync(join(out, 'index.html'), indexHtml(name, items, out));
    summary.rendered = written;
    summary.open = join(out, 'index.html').replace(/\\/g, '/');
  }
  return report('diagram', findings, summary, { json: args.json });
}

if (process.argv[1]?.endsWith('diagram.mjs')) {
  process.exitCode = await main(process.argv.slice(2));
}

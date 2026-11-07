/**
 * diagram.mjs: the notation rules hold, the catalogue every agent copies from is clean, and render
 * puts everything in one folder per slug, in gate order (DEV-CONTRACTS §13.8).
 *
 * The render test drives a real headless Edge/Chrome and needs the network for mermaid; it skips
 * when either is missing, or when DIAGRAM_RENDER=0.
 *
 *   node --test tests/diagram.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Findings } from '../workspace/dev/scripts/lib/check.mjs';
import { checkBlock, checkFiles, extractBlocks, gateOf, kindOf, planItems, proseKey } from '../workspace/dev/scripts/diagram.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SCRIPT = join(ROOT, 'workspace', 'dev', 'scripts', 'diagram.mjs');
const CATALOGUE = join(ROOT, 'skills', 'dev-drawing-diagrams', 'catalogue.md');

const fence = (src) => `\`\`\`mermaid\n${src}\n\`\`\``;
const codes = (prose, src) => {
  const text = `${prose}\n\n${fence(src)}\n`;
  const f = new Findings();
  for (const b of extractBlocks(text)) checkBlock(b, proseKey(text), 'x.md', f);
  return f.list.map((x) => x.code).sort();
};
const titled = (t, body) => `---\ntitle: ${t}\n---\n${body}`;

test('blocks: front-matter title, type and line are read', () => {
  const [b] = extractBlocks(`# A\n\n${fence(titled('Place order — sequence', 'sequenceDiagram\n  participant A'))}\n`);
  assert.equal(b.type, 'sequenceDiagram');
  assert.equal(b.title, 'Place order — sequence');
  assert.equal(b.line, 3); // the ```mermaid fence, 1-based
});

test('an unknown type is E701, an empty block E702', () => {
  assert.deepEqual(codes('', 'pie\n "a": 1'), ['E701']);
  assert.deepEqual(codes('', titled('T', 'flowchart TD')), ['E702']);
});

test('sequence: undeclared lifelines and a happy path only are flagged; a correct one is clean', () => {
  assert.deepEqual(codes('Web app, Order API', titled('S', 'sequenceDiagram\n  W->>A: go')), ['W711', 'W711', 'W712']);
  const good = titled('S', 'sequenceDiagram\n  participant W as Web app\n  participant A as Order API\n  W->>A: POST /orders\n  alt ok\n    A-->>W: 201\n  else fail\n    A-->>W: 503\n  end');
  assert.deepEqual(codes('The Web app calls the Order API.', good), []);
});

test('W716: a participant the prose never names', () => {
  const src = titled('S', 'sequenceDiagram\n  participant W as Web app\n  participant Z as Ghost service\n  W->>Z: x\n  opt fail\n    Z-->>W: 500\n  end');
  assert.deepEqual(codes('The Web app.', src), ['W716']);
});

test('activity: a decision branch without a guard is W713; guarded is clean', () => {
  assert.deepEqual(codes('', titled('A', 'flowchart TD\n  d{Valid?} --> a[Go]\n  d -->|no| b[Stop]')), ['W713']);
  assert.deepEqual(codes('', titled('A', 'flowchart TD\n  d{Valid?} -->|yes| a[Go]\n  d -->|no| b[Stop]')), []);
  assert.deepEqual(codes('', titled('A', 'flowchart TD\n  d{Valid?} -- yes --> a[Go]\n  d -- no --> b[Stop]')), []);
});

test('ER: an entity without PK is W714; names come from the prose', () => {
  const src = titled('E', 'erDiagram\n  ORDER ||--|{ ORDER_LINE : contains\n  ORDER {\n    uuid id PK\n  }\n  ORDER_LINE {\n    int qty\n  }');
  assert.deepEqual(codes('Order and order line entities.', src), ['W714']);
});

test('no title is W710', () => {
  assert.deepEqual(codes('', 'flowchart LR\n  a[A] --> b[B]'), ['W710']);
});

test('the catalogue every agent copies from is clean, and covers every kind it promises', () => {
  const { findings, docs } = checkFiles([CATALOGUE]);
  assert.deepEqual(findings.list.map((f) => `${f.code} ${f.line} ${f.message}`), []);
  const types = new Set(docs[0].blocks.map((b) => b.type));
  for (const t of ['C4Context', 'C4Container', 'sequenceDiagram', 'flowchart', 'stateDiagram-v2', 'erDiagram', 'C4Deployment']) assert.ok(types.has(t), `catalogue has no ${t}`);
});

test('items are numbered in gate order whatever order the files come in', () => {
  const docs = [
    { file: 'dev/deployment/shop/release-plan.md', rel: 'r', blocks: [{ title: 'Prod — deployment', type: 'C4Deployment', line: 3 }] },
    { file: 'dev/design/shop/architecture.md', rel: 'a', blocks: [{ title: 'Place order — sequence', type: 'sequenceDiagram', line: 9 }] },
    { file: 'dev/ui/shop/ui-spec.md', rel: 'u', blocks: [{ title: null, type: 'flowchart', line: 4 }] },
  ];
  assert.deepEqual(planItems(docs).map((i) => i.name), [
    '01-G2-architecture-place-order-sequence',
    '02-G5-ui-spec-diagram-1',
    '03-G10-release-plan-prod-deployment',
  ]);
  assert.equal(gateOf('C:/x/dev/data/shop/data-model.md'), 'G3');
  assert.equal(kindOf({ type: 'flowchart', title: 'Checkout — activity' }), 'activity (flowchart)');
});

test('usage errors exit 2', () => {
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 2);
  const dir = mkdtempSync(join(tmpdir(), 'diagram-'));
  assert.equal(spawnSync(process.execPath, [SCRIPT, 'check', 'no-such-slug'], { cwd: dir, encoding: 'utf8' }).status, 2);
});

test('check <slug> reads every stage folder of the slug and exits 0 on warnings only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diagram-'));
  mkdirSync(join(dir, 'dev', 'design', 'shop'), { recursive: true });
  writeFileSync(join(dir, 'dev', 'design', 'shop', 'architecture.md'), fence('flowchart LR\n  a[A] --> b[B]'));
  const r = spawnSync(process.execPath, [SCRIPT, 'check', 'shop', '--json'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.summary.diagrams, 1);
  assert.deepEqual(out.findings.map((f) => `${f.code} ${f.file}`), ['W710 dev/design/shop/architecture.md']);
});

const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', process.env.UI_SNAP_BROWSER].find((p) => p && existsSync(p));

test('render <slug>: one folder, numbered SVGs in gate order, an index, and a parse error is E703', { skip: !browser || process.env.DIAGRAM_RENDER === '0' ? 'no browser, or DIAGRAM_RENDER=0' : false, timeout: 180_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'diagram-'));
  const cat = readFileSync(CATALOGUE, 'utf8');
  const section = (n) => cat.split(/^## /m).find((s) => s.startsWith(`${n}.`));
  const prose = cat.split(/^## /m)[0];
  const put = (stage, file, body) => {
    mkdirSync(join(dir, 'dev', stage, 'shop'), { recursive: true });
    writeFileSync(join(dir, 'dev', stage, 'shop', file), `${prose}\n## ${body}`);
  };
  put('data', 'data-model.md', section(6));
  put('design', 'architecture.md', `${section(3)}\n${fence(titled('Broken — activity', 'flowchart TD\n  a[A] --> --> b'))}\n`);
  const r = spawnSync(process.execPath, [SCRIPT, 'render', 'shop', '--json'], { cwd: dir, encoding: 'utf8', timeout: 170_000 });
  const net = /mermaid did not load/.test(r.stderr);
  if (net) return; // offline: nothing to judge
  const out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  assert.equal(r.status, 1, 'a block mermaid cannot parse must fail the run');
  assert.deepEqual(out.findings.map((f) => f.code), ['E703']);
  const files = readdirSync(join(dir, 'dev', 'diagrams', 'shop')).sort();
  assert.deepEqual(files, ['01-G2-architecture-place-order-sequence.svg', '03-G3-data-model-orders-er.svg', 'index.html']);
  const index = readFileSync(join(dir, 'dev', 'diagrams', 'shop', 'index.html'), 'utf8');
  assert.match(index, /not drawn/);
  assert.match(index, /href="\.\.\/\.\.\/design\/shop\/architecture\.md"/);
});

test('check <slug> follows the SDLC root: .sdlc/ when it exists, and --root / --dev name another', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diagram-root-'));
  mkdirSync(join(dir, '.sdlc', 'design', 'shop'), { recursive: true });
  writeFileSync(join(dir, '.sdlc', 'design', 'shop', 'architecture.md'), fence('flowchart LR\n  a[A] --> b[B]'));
  const found = spawnSync(process.execPath, [SCRIPT, 'check', 'shop', '--json'], { cwd: dir, encoding: 'utf8' });
  assert.equal(found.status, 0, found.stdout + found.stderr);
  assert.deepEqual(JSON.parse(found.stdout).findings.map((f) => f.file), ['.sdlc/design/shop/architecture.md']);

  mkdirSync(join(dir, 'proc', 'design', 'shop'), { recursive: true });
  writeFileSync(join(dir, 'proc', 'design', 'shop', 'architecture.md'), fence('flowchart LR\n  a[A] --> b[B]'));
  for (const flag of ['--root', '--dev']) {
    const r = spawnSync(process.execPath, [SCRIPT, 'check', 'shop', flag, 'proc', '--json'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).findings.map((f) => f.file), ['proc/design/shop/architecture.md'], flag);
  }
});

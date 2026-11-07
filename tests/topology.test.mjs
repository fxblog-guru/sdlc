/**
 * topology.mjs and lib/clouds.mjs: the provider rules catch what they claim to, the two valid
 * fixtures stay clean, drift sees both directions, and every stencil the registry names exists in
 * the draw.io catalogue it was taken from (DEV-CONTRACTS §13.14).
 *
 * Each rule is shown to fail: a valid model is broken one way and the expected code must appear.
 * The render test drives a real headless Edge/Chrome and needs the network for draw.io; it skips
 * when either is missing, or when TOPOLOGY_RENDER=0.
 *
 *   node --test tests/topology.test.mjs
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Findings } from '../workspace/dev/scripts/lib/check.mjs';
import { IAC, K8S, KINDS, NEUTRAL_GROUPS, PROVIDERS, groupKindOn, groupOf, nodeStyle, providerOf, serviceOf } from '../workspace/dev/scripts/lib/clouds.mjs';
import { checkDrift, checkTopology, drawioFile, iacResources, layout, loadTopology, main, normalise, ranks, retarget, serviceTable, toDrawio } from '../workspace/dev/scripts/topology.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const FIX = join(here, 'fixtures', 'topology');
const shop = () => loadTopology(join(FIX, 'shop.yaml'));
const codes = (model) => { const f = new Findings(); checkTopology(model, 'x.yaml', f); return f.list.map((x) => x.code).sort(); };
const clone = (m) => JSON.parse(JSON.stringify(m));

test('the two valid fixtures are clean', () => {
  assert.deepEqual(codes(shop()), []);
  assert.deepEqual(codes(loadTopology(join(FIX, 'k8s.yaml'))), []);
});

test('E720 unknown provider, E721 unknown kind, E722 a group the provider does not draw', () => {
  assert.deepEqual(codes({ ...shop(), provider: 'digitalocean' }), ['E720']);
  const m = clone(shop()); m.nodes[1].kind = 'mainframe';
  assert.ok(codes(m).includes('E721'));
  const g = clone(shop()); g.groups[2].kind = 'vnet'; // an Azure group on AWS
  assert.ok(codes(g).includes('E722'));
});

test('E723 duplicate or malformed ids, E724 an unknown parent, E727 an unknown edge end', () => {
  const d = clone(shop()); d.nodes[2].id = d.nodes[1].id;
  assert.ok(codes(d).includes('E723'));
  const u = clone(shop()); u.nodes[2].id = 'Public_LB';
  assert.ok(codes(u).includes('E723'));
  const p = clone(shop()); p.nodes[3].in = 'nowhere';
  assert.ok(codes(p).includes('E724'));
  const e = clone(shop()); e.edges.push({ from: 'api', to: 'ghost', label: 'x' });
  assert.ok(codes(e).includes('E727'));
});

test('E725 nesting follows the provider: an AWS subnet outside its VPC, a VPC outside a region', () => {
  const s = clone(shop()); s.groups.find((g) => g.id === 'app').in = 'region';
  assert.ok(codes(s).includes('E725'), 'subnet directly in a region');
  const v = clone(shop()); v.groups.find((g) => g.id === 'net').in = 'cloud';
  assert.ok(codes(v).includes('E725'), 'VPC directly in the AWS Cloud');
  const k = loadTopology(join(FIX, 'k8s.yaml')); k.nodes.find((n) => n.id === 'api').in = 'region';
  assert.ok(codes(k).includes('E725'), 'a Deployment outside its cluster');
});

test('E726 the provider\'s required groups: AWS draws the AWS Cloud and a region', () => {
  const m = clone(shop());
  m.groups = m.groups.filter((g) => g.id !== 'cloud');
  m.groups.find((g) => g.id === 'region').in = undefined;
  assert.ok(codes(m).includes('E726'));
});

test('W730 outside every group, W731 data in a public subnet, W732 unlabelled edge, W734 no title', () => {
  const o = clone(shop()); delete o.nodes.find((n) => n.id === 'queue').in;
  assert.ok(codes(o).includes('W730'));
  assert.ok(!codes(shop()).includes('W730'), 'users at the top level are fine');
  const pub = clone(shop()); pub.nodes.find((n) => n.id === 'db').in = 'public';
  assert.ok(codes(pub).includes('W731'));
  const flag = clone(shop()); flag.groups.find((g) => g.id === 'data').public = true;
  assert.ok(codes(flag).includes('W731'), 'public: true on a neutral subnet counts');
  const l = clone(shop()); l.edges[0].label = '';
  assert.ok(codes(l).includes('W732'));
  assert.ok(codes({ ...clone(shop()), title: '' }).includes('W734'));
});

test('edges accept [from, to, label] and { from, to, label, async }', () => {
  const m = normalise({ provider: 'aws', edges: [['a', 'b', 'x'], { from: 'b', to: 'c', label: 'y', async: true }] });
  assert.deepEqual(m.edges, [{ from: 'a', to: 'b', label: 'x' }, { from: 'b', to: 'c', label: 'y', async: true }]);
});

test('every provider maps every kind, and neutral groups exist on every provider', () => {
  for (const p of PROVIDERS) {
    for (const k of Object.keys(KINDS)) assert.ok(serviceOf(p, k), `${p.id}: no service for ${k}`);
    for (const [k, per] of Object.entries(NEUTRAL_GROUPS)) assert.ok(groupOf(p, per[p.id]), `${p.id}: neutral ${k} → ${per[p.id]} is not a group`);
    for (const r of p.required) assert.ok(p.groups[r], `${p.id}: required ${r} is not a group`);
    for (const [k, def] of Object.entries(p.groups)) for (const parent of def.parents) assert.ok(parent === null || parent === '*' || p.groups[parent], `${p.id}.${k}: parent ${parent} is not a group`);
    for (const k of Object.keys(IAC[p.id] ?? {})) assert.ok(KINDS[k] || p.groups[k], `${p.id}: IaC row for unknown kind ${k}`);
  }
});

test('the same model redraws on all five providers, each clean, each to its own groups', () => {
  for (const p of PROVIDERS) {
    const m = retarget(shop(), p.id);
    assert.deepEqual(codes(m), [], `${p.id}: ${codes(m).join(' ')}`);
    const xml = toDrawio(m, p);
    assert.match(xml, /^<mxGraphModel[\s\S]*<\/mxGraphModel>$/);
    assert.ok(xml.includes(p.groups[groupKindOn(p, 'network')].style.slice(-40).replace(/&/g, '&amp;').slice(-20)), `${p.id}: network group style missing`);
  }
});

test('the drawio file: one page per provider, every node and edge, children inside their parent box', () => {
  const m = shop();
  const p = providerOf('aws');
  const xml = toDrawio(m, p);
  for (const n of m.nodes) assert.match(xml, new RegExp(`<mxCell id="${n.id}" `));
  assert.equal((xml.match(/ edge="1"/g) ?? []).length, m.edges.length);
  assert.match(xml, /resIcon=mxgraph\.aws4\.rds;/);
  assert.match(xml, /grIcon=mxgraph\.aws4\.group_vpc2;/);
  const { box } = layout(m);
  for (const c of [...m.groups, ...m.nodes].filter((x) => x.in)) {
    const b = box.get(c.id), parent = box.get(c.in);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= parent.w && b.y + b.h <= parent.h, `${c.id} spills out of ${c.in}`);
  }
  const file = drawioFile([{ name: 'AWS', xml }, { name: 'GCP', xml: toDrawio(retarget(m, 'gcp'), providerOf('gcp')) }]);
  assert.equal((file.match(/<diagram /g) ?? []).length, 2);
});

test('layout reads left to right along the request path, and is the same every run', () => {
  const m = shop();
  const r = ranks(m);
  assert.ok(r.get('users') < r.get('edge') && r.get('edge') < r.get('lb') && r.get('lb') < r.get('api') && r.get('api') < r.get('db'));
  assert.equal(toDrawio(m, providerOf('aws')), toDrawio(shop(), providerOf('aws')));
});

test('the service table has one column per provider asked for', () => {
  const t = serviceTable(shop(), ['aws', 'gcp']).split('\n');
  assert.match(t[0], /\| AWS \| Google Cloud \|/);
  assert.match(t.find((l) => l.startsWith('| Orders DB')), /Amazon RDS \| Cloud SQL/);
});

test('drift: clean when the IaC builds the model; E740 for a missing resource, W741 for an undesigned one', () => {
  const run = (model, dir) => { const f = new Findings(); checkDrift(model, providerOf(model.provider), iacResources([join(FIX, dir)]), 'x.yaml', f); return f.list.map((x) => x.code).sort(); };
  assert.deepEqual(run(shop(), 'iac-shop'), []);
  assert.deepEqual(run(loadTopology(join(FIX, 'k8s.yaml')), 'iac-catalog'), []);
  const extra = clone(shop()); extra.nodes.push({ id: 'search', kind: 'search', in: 'data', label: 'Product search' });
  assert.deepEqual(run(extra, 'iac-shop'), ['E740']);
  const gone = clone(shop()); gone.nodes = gone.nodes.filter((n) => n.id !== 'queue'); gone.edges = gone.edges.filter((e) => e.from !== 'queue' && e.to !== 'queue');
  assert.deepEqual(run(gone, 'iac-shop'), ['W741']);
  const skip = clone(extra); skip.nodes.at(-1).iac = false;
  assert.deepEqual(run(skip, 'iac-shop'), [], 'iac: false opts a component out');
  const named = clone(shop()); named.nodes.find((n) => n.id === 'db').iac = 'not_orders';
  assert.ok(run(named, 'iac-shop').includes('E740'), 'iac: <name> must match that resource');
});

test('drift reads Terraform, Bicep and Kubernetes manifests', () => {
  const dir = mkdtempSync(join(tmpdir(), 'topo-iac-'));
  writeFileSync(join(dir, 'main.bicep'), "resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {\n}\n");
  writeFileSync(join(dir, 'a.tf'), 'resource "azurerm_linux_virtual_machine" "web" {\n}\n');
  writeFileSync(join(dir, 'd.yaml'), 'apiVersion: apps/v1\nkind: StatefulSet\nmetadata:\n  name: pg\n');
  const types = iacResources([dir]).map((r) => r.type).sort();
  assert.deepEqual(types, ['Microsoft.KeyVault/vaults', 'StatefulSet', 'azurerm_linux_virtual_machine']);
});

test('CLI: check exits 0 on the fixture and 1 on a broken copy; drift needs --iac', async () => {
  assert.equal(await main(['check', join(FIX, 'shop.yaml')]), 0);
  const dir = mkdtempSync(join(tmpdir(), 'topo-'));
  const bad = join(dir, 'topology.yaml');
  writeFileSync(bad, readFileSync(join(FIX, 'shop.yaml'), 'utf8').replace('provider: aws', 'provider: heroku'));
  assert.equal(await main(['check', bad]), 1);
  assert.equal(await main(['drift', join(FIX, 'shop.yaml')]), 2);
  assert.equal(await main(['drift', join(FIX, 'shop.yaml'), '--iac', join(FIX, 'iac-shop')]), 0);
});

test('render --no-svg writes one editable .drawio per provider and an index, with no browser', async () => {
  const out = mkdtempSync(join(tmpdir(), 'topo-out-'));
  assert.equal(await main(['render', join(FIX, 'shop.yaml'), '--as', 'azure,gcp,alibaba,oci', '--no-svg', '--out', out]), 0);
  const files = readdirSync(out).sort();
  assert.deepEqual(files, ['index.html', 'topology-alibaba.drawio', 'topology-aws.drawio', 'topology-azure.drawio', 'topology-gcp.drawio', 'topology-oci.drawio']);
  assert.match(readFileSync(join(out, 'topology-azure.drawio'), 'utf8'), /image=img\/lib\/azure2\/databases\/Azure_Database_PostgreSQL_Server\.svg/);
});

test('the template parses, and checks clean once its placeholders are filled', () => {
  const tpl = readFileSync(join(ROOT, 'workspace', 'dev', '_templates', 'topology.yaml'), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'topo-tpl-'));
  const filled = tpl.replace(/<([^>]+)>/g, (_, v) => v.replace(/^Feature$/, 'Orders'));
  writeFileSync(join(dir, 'topology.yaml'), filled);
  assert.deepEqual(codes(loadTopology(join(dir, 'topology.yaml'))), []);
});

// The stencil names were taken from draw.io's sidebars; this holds them to the catalogue offline,
// against the names recorded when they were verified, so a typo in the registry fails here rather
// than as an empty box in someone's diagram.
test('every stencil the registry draws is one the draw.io catalogue ships', () => {
  const known = JSON.parse(readFileSync(join(FIX, 'stencils.json'), 'utf8'));
  for (const p of PROVIDERS) {
    for (const [kind, [, st]] of Object.entries(p.services)) {
      const style = nodeStyle(p, st);
      if (st.r) assert.ok(known.aws.includes(st.r), `aws ${kind}: resIcon ${st.r}`);
      if (st.s && !st.lib) assert.ok(known.aws.includes(st.s), `aws ${kind}: shape ${st.s}`);
      if (st.lib === 'gcp2') assert.ok(known.gcp2.includes(st.s), `gcp ${kind}: ${st.s}`);
      if (st.lib === 'alibaba_cloud') assert.ok(known.alibaba.includes(st.s), `alibaba ${kind}: ${st.s}`);
      if (st.img) assert.ok(known.azure.includes(st.img.replace('img/lib/azure2/', '')), `azure ${kind}: ${st.img}`);
      if (st.hex) assert.ok(known.gcphex.includes(st.hex), `gcp ${kind}: hexIcon ${st.hex}`);
      assert.ok(style.length > 20);
    }
  }
  for (const [, icon] of Object.values(K8S.services)) assert.ok(known.k8s.includes(icon), `k8s ${icon}`);
});

const browserOk = () => process.env.TOPOLOGY_RENDER !== '0' && ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].some(existsSync);

test('render draws every provider with its official icons through draw.io (live)', { skip: !browserOk() && 'no browser, or TOPOLOGY_RENDER=0', timeout: 240_000 }, async () => {
  const out = mkdtempSync(join(tmpdir(), 'topo-svg-'));
  const code = await main(['render', join(FIX, 'shop.yaml'), '--as', 'azure,gcp,alibaba,oci', '--out', out]);
  const svgs = readdirSync(out).filter((f) => f.endsWith('.svg'));
  if (code === 0 && svgs.length === 0) return; // offline: W744, the .drawio files were still written
  assert.equal(code, 0);
  assert.equal(svgs.length, 5);
  const aws = readFileSync(join(out, 'topology-aws.svg'), 'utf8');
  assert.ok(aws.length > 20_000 && /Orders DB/.test(aws), 'the AWS page has its components drawn');
  const azure = readFileSync(join(out, 'topology-azure.svg'), 'utf8');
  assert.ok(!/href="[^"]*img\/lib\//.test(azure), 'Azure images are inlined, so the SVG stands alone');
});

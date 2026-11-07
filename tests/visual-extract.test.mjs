/**
 * visual-extract.mjs: one screen of the approved visual as its renderer, the helpers it calls and
 * the CSS it uses (DEV-CONTRACTS §13.3).
 *
 * tests/fixtures/visual-extract/ is a script-drawn visual in the shape dev-designing-visuals
 * produces (screens by data-kind, a RENDER map, one <style>), with a string full of braces, a link
 * that names another renderer, another skin's CSS and a RENDER entry whose function does not exist.
 * The starter is the static shape.
 *
 *   node --test tests/visual-extract.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { codeOnly, declarations, extract, parseCss, renderMap, selectorUsed } from '../workspace/dev/scripts/visual-extract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, 'fixtures', 'visual-extract');
const FILE = join(ROOT, 'ui', 'demo', 'visual', 'index.html');
const HTML = readFileSync(FILE, 'utf8');
const STARTER = readFileSync(join(here, '..', 'skills', 'dev-designing-visuals', 'starter', 'index.html'), 'utf8');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'visual-extract.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, 'demo', ...args, '--root', ROOT], { encoding: 'utf8' });
const js = /<script>([\s\S]*?)<\/script>/.exec(HTML)[1];

test('declarations: each top-level function or const whole, a brace in a string or comment ignored', () => {
  const d = declarations(js);
  assert.deepEqual([...d.keys()], ['ic', 'POSTS', 'chip', 'card', 'siteHeader', 'home', 'post', 'RENDER', 'route']);
  assert.match(d.get('chip'), /^function chip\(c\) \{[\s\S]*<\/span>`;\n}$/);
  assert.doesNotMatch(d.get('POSTS'), /The chip/, 'a comment above a declaration is not the end of the one before');
});

test('RENDER: shorthand, named and inline entries', () => {
  const r = renderMap(declarations(js));
  assert.deepEqual(r.get('home'), { fn: 'home' });
  assert.deepEqual(r.get('broken'), { fn: 'missingRenderer' });
  assert.match(r.get('home-alt').inline, /home\(el\)/);
});

test('names in markup are text, not calls', () => {
  assert.equal(codeOnly('`<a href="#post">${f("x")}</a>` + g(\'y\')'), '`${f(\'\')}` + g(\'\')');
});

test('home: the renderer, its helpers one level deep, deeper ones by name only', () => {
  const r = extract(HTML, 'home');
  assert.equal(r.renderer, 'home');
  assert.deepEqual(r.helpers, ['siteHeader', 'POSTS', 'card']);
  assert.deepEqual(r.deeper, ['ic', 'chip']);
  assert.match(r.code, /function card\(p\)/);
  assert.doesNotMatch(r.code, /function post\(el\)|function chip/, 'a link to #post is not a call, and chip is two levels down');
});

test('CSS: only the rules the screen uses, its skin only, media blocks kept, keyframes followed', () => {
  const home = extract(HTML, 'home').css;
  assert.match(home, /\.hero h1 \{/);
  assert.match(home, /\[data-skin="sakura"\] \.hero/);
  assert.doesNotMatch(home, /data-skin="neon"|unused-thing|post-body|@keyframes/);
  assert.match(home, /@media \(max-width: 767px\) \{\n {2}\.site-head \{ flex-direction: column; \}\n\}/);
  assert.match(home, /\.screen\.on/);
  const post = extract(HTML, 'post').css;
  assert.match(post, /\.post-body \{/);
  assert.match(post, /@keyframes spin/);
  assert.doesNotMatch(post, /@keyframes fade/);
});

test('selectors: every class, id and attribute value must appear', () => {
  const words = new Set(['card', 'chip']);
  assert.equal(selectorUsed('.card .chip:hover', words, ''), true);
  assert.equal(selectorUsed('.card .badge', words, ''), false);
  assert.equal(selectorUsed('body', words, ''), true);
  assert.equal(parseCss('a{b:c} @media (x){.d{e:f}}')[1].rules[0].selector, '.d');
});

test('the CLI is much smaller than the visual and says so', () => {
  const r = run('--screen', 'home');
  assert.equal(r.status, 0, r.stderr);
  const [, before, after] = /visual (\d+) bytes → (\d+)/.exec(r.stdout).map(Number);
  assert.ok(after < before / 2, `${after} of ${before}`);
  assert.equal(JSON.parse(run('--screen', 's-post-sakura', '--json').stdout).renderer, 'post');
});

test('FAILS on an unknown screen or a renderer that is not defined', () => {
  const a = run('--screen', 'nope');
  assert.equal(a.status, 1);
  assert.match(a.stderr, /no screen `nope`; screens: home, post, broken/);
  const b = run('--screen', 'broken');
  assert.equal(b.status, 1);
  assert.match(b.stderr, /`missingRenderer`, which is not defined/);
  assert.equal(spawnSync(process.execPath, [SCRIPT, 'demo', '--screen', 'home', '--root', join(here, 'fixtures', 'lane-brief', 'valid')], { encoding: 'utf8' }).status, 2);
});

test('a static visual (the starter) prints the section itself', () => {
  const r = extract(STARTER, 'list');
  assert.equal(r.renderer, null);
  assert.match(r.code, /^<section class="screen" id="s-list">/);
  assert.ok(r.css.length > 0);
});

test('the visual is read, never written', () => {
  const hash = () => createHash('sha256').update(readFileSync(FILE)).digest('hex');
  const before = hash();
  run('--screen', 'home');
  run('--list');
  assert.equal(hash(), before);
});

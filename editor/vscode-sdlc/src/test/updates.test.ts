/**
 * The update notice: read from `.claude/.agentic-fx-updates.json` (written by `afx`), never the
 * network; silent on any doubt; hidden once the reader dismisses that version.
 *
 * Run with: npm run compile && npm test
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { NPX_UPDATE_COMMAND, UPDATE_COMMAND, noticeLabel, readInstalledVersion, parseUpdateNotice, readUpdateNotice, updateChoices, visibleNotice } from '../updates';

const URL = 'https://example.com/agentic-fx/sdlc/-/blob/main/CHANGELOG.md';

function file(dev: Record<string, unknown>): string {
  return JSON.stringify({
    checked_at: '2026-01-01T00:00:00Z',
    bundles: { dev: { installed: '1.0.0', latest: '1.1.0', kind: 'minor', command: UPDATE_COMMAND, changelog_url: URL, ...dev } },
  });
}

function project(text?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-upd-'));
  fs.mkdirSync(path.join(root, '.claude'));
  if (text !== undefined) fs.writeFileSync(path.join(root, '.claude', '.agentic-fx-updates.json'), text);
  return root;
}

test('a minor update is read with its versions, kind and changelog', () => {
  const n = readUpdateNotice(project(file({})), {});
  assert.deepEqual(n, { installed: '1.0.0', latest: '1.1.0', kind: 'minor', command: UPDATE_COMMAND, changelogUrl: URL });
});

test('silent: no file, bad JSON, kind none or unknown, no dev entry, AFX_NO_UPDATE_CHECK=1', () => {
  assert.equal(readUpdateNotice(project(), {}), null);
  assert.equal(readUpdateNotice(project('{oops'), {}), null);
  assert.equal(readUpdateNotice(project(file({ kind: 'none' })), {}), null);
  assert.equal(readUpdateNotice(project(file({ kind: 'unknown' })), {}), null);
  assert.equal(parseUpdateNotice(JSON.stringify({ bundles: { qa: {} } })), null);
  assert.equal(parseUpdateNotice('null'), null);
  assert.equal(readUpdateNotice(project(file({})), { AFX_NO_UPDATE_CHECK: '1' }), null);
});

test('the command run is always the fixed one, and odd fields are refused', () => {
  assert.equal(parseUpdateNotice(file({ source: 'npm:agentic-fx@0.1.0' }))?.command, NPX_UPDATE_COMMAND);
  assert.equal(parseUpdateNotice(file({ source: 'npm:x', command: 'rm -rf /' }))?.command, NPX_UPDATE_COMMAND);
  assert.equal(parseUpdateNotice(file({ source: 'https://gitlab.com/agentic-fx/sdlc.git' }))?.command, UPDATE_COMMAND);
  assert.equal(parseUpdateNotice(file({ command: 'rm -rf /' }))?.command, UPDATE_COMMAND);
  assert.equal(parseUpdateNotice(file({ latest: '1.1.0; echo hi' })), null);
  assert.equal(parseUpdateNotice(file({ changelog_url: 'javascript:alert(1)' }))?.changelogUrl, '');
});

test('dismissing a version hides it until a newer one is announced', () => {
  const n = parseUpdateNotice(file({}));
  assert.equal(visibleNotice(n, '1.1.0'), null);
  assert.equal(visibleNotice(n, '1.0.5'), n);
  assert.equal(visibleNotice(n, undefined), n);
  assert.equal(visibleNotice(null, undefined), null);
});

test('the pill label carries the word and, for a major, the UPGRADE.md warning', () => {
  const minor = noticeLabel(parseUpdateNotice(file({}))!);
  assert.equal(minor.short, 'update 1.1.0');
  assert.match(minor.aria, /^Update available: agentic-fx-dev 1\.1\.0, installed 1\.0\.0, minor\./);
  const major = noticeLabel(parseUpdateNotice(file({ latest: '2.0.0', kind: 'major' }))!);
  assert.match(major.aria, /Major version: read UPGRADE\.md first/);
});

test('the quick pick offers changelog, run and dismiss, and drops the changelog without a URL', () => {
  assert.deepEqual(updateChoices(parseUpdateNotice(file({}))!).map((c) => c.action), ['changelog', 'run', 'dismiss']);
  assert.deepEqual(updateChoices(parseUpdateNotice(file({ changelog_url: '' }))!).map((c) => c.action), ['run', 'dismiss']);
  assert.match(updateChoices(parseUpdateNotice(file({ kind: 'major', latest: '2.0.0' }))!)[1].detail, /UPGRADE\.md/);
});

test('the notice is read from the project root it is given, with its own install manifest', () => {
  const a = project(file({}));
  const b = project();
  assert.equal(readUpdateNotice(a, {})?.latest, '1.1.0');
  assert.equal(readUpdateNotice(b, {}), null);
  // Already updated: the manifest says latest, so the lagging notice is not shown.
  fs.writeFileSync(path.join(a, '.claude', '.agentic-fx.json'), JSON.stringify({ dev: { version: '1.1.0' } }));
  assert.equal(readUpdateNotice(a, {}), null);
  // The manifest's version replaces the notice's installed one.
  fs.writeFileSync(path.join(a, '.claude', '.agentic-fx.json'), JSON.stringify({ dev: { version: '1.0.5' } }));
  assert.equal(readUpdateNotice(a, {})?.installed, '1.0.5');
  assert.equal(readInstalledVersion(a), '1.0.5');
  // A manifest without a usable version changes nothing.
  fs.writeFileSync(path.join(a, '.claude', '.agentic-fx.json'), '{"dev":{"claude":[]}}');
  assert.equal(readUpdateNotice(a, {})?.installed, '1.0.0');
});

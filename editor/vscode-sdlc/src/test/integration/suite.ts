/**
 * The suite that runs inside the Extension Host.
 *
 * It asserts the things only a running editor can answer, and deliberately not the parsing rules —
 * those belong in `model.test.ts`, where they cost milliseconds instead of a VS Code download.
 */

import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'agentic-fx.vscode-sdlc';

const BOARD_VIEW_TYPE = 'sdlc.board';
const WAIT_MS = 5000;

/** Polls until the predicate returns something truthy, or gives up - never waits indefinitely. */
async function waitFor<T>(probe: () => T | undefined, timeout = WAIT_MS): Promise<T | undefined> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() >= deadline) return undefined;
    await new Promise((r) => setTimeout(r, 50));
  }
}

type Case = { name: string; fn: () => Promise<void> | void };

const cases: Case[] = [];
const test = (name: string, fn: Case['fn']): void => {
  cases.push({ name, fn });
};

/** Every file under a directory with its mtime and size — enough to catch a write we did not make. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const s = statSync(full);
        out[full] = `${s.size}:${s.mtimeMs}`;
      }
    }
  };
  walk(dir);
  return out;
}

test('the extension is found and activates', async () => {
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(ext, `extension ${EXTENSION_ID} not found in the host`);
  await ext.activate();
  assert.equal(ext.isActive, true, 'activate() returned but the extension is not active');
});

test('every contributed command is actually registered', async () => {
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(ext);
  const contributed: string[] = (ext.packageJSON.contributes?.commands ?? []).map(
    (c: { command: string }) => c.command,
  );
  assert.ok(contributed.length > 0, 'package.json contributes no commands');

  const registered = await vscode.commands.getCommands(true);
  const missing = contributed.filter((c) => !registered.includes(c));
  assert.deepEqual(missing, [], `contributed but never registered: ${missing.join(', ')}`);
});

test('the fixture workspace is the one under test', () => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'no workspace folder opened');
  const state = JSON.parse(readFileSync(join(folder.uri.fsPath, 'dev', 'state.json'), 'utf8'));
  assert.ok(Array.isArray(state.initiatives) && state.initiatives.length > 0, 'fixture has no initiatives');
});

test('the board opens, and opens as a webview of the right type', async () => {
  await vscode.commands.executeCommand('sdlc.openBoard');

  // `executeCommand` resolving only proves the command did not throw. The tab model is owned by
  // the renderer and catches up a frame or two later, so the assertion that the panel really
  // exists has to be given a moment - but a bounded one, or a broken board would hang instead of
  // failing.
  const board = await waitFor(() =>
    vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .find((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.includes(BOARD_VIEW_TYPE)),
  );

  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
  assert.ok(
    board,
    `no '${BOARD_VIEW_TYPE}' webview tab appeared within ${WAIT_MS}ms; open tabs were: ` +
      (tabs.map((t) => `${t.label} (${t.input?.constructor.name})`).join(', ') || '(none)'),
  );
  assert.equal(board.label, 'SDLC Board');
});

test('the sidebar Overview view resolves', async () => {
  // Contributed views get a `<id>.focus` command for free; focusing is what makes VS Code call
  // resolveWebviewView, which is the only code path a broken provider would fail in.
  await vscode.commands.executeCommand('sdlc.overview.focus');
  await new Promise((r) => setTimeout(r, 300));
});

test('refresh is idempotent and does not throw', async () => {
  await vscode.commands.executeCommand('sdlc.refresh');
  await vscode.commands.executeCommand('sdlc.refresh');
});

test('opening an artifact that the index points at does not throw', async () => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder);
  // A path that does not exist is the honest case here: the fixture ships no artifacts, and the
  // command must degrade to VS Code's own "file not found" rather than taking the extension down.
  await vscode.commands.executeCommand('sdlc.openArtifact', 'dev/intake/demo/problem.md');
});

test('the new settings are contributed with the documented defaults', () => {
  const config = vscode.workspace.getConfiguration('sdlc');
  assert.equal(config.get('accent'), 'lavender');
  assert.equal(config.get('backgroundRebuild'), false, 'the background rebuild must be opt-in: it writes state.json');
});

test('the extension writes nothing to the workspace', async () => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder);
  const dev = join(folder.uri.fsPath, 'dev');
  const before = snapshot(dev);

  await vscode.commands.executeCommand('sdlc.refresh');
  await vscode.commands.executeCommand('sdlc.openBoard');
  await new Promise((r) => setTimeout(r, 500));

  assert.deepEqual(snapshot(dev), before, 'the workspace changed while the viewer was running');
});

export async function run(): Promise<void> {
  const failures: string[] = [];
  for (const c of cases) {
    try {
      await c.fn();
      console.log(`  ok   ${c.name}`);
    } catch (err) {
      failures.push(c.name);
      console.log(`  FAIL ${c.name}`);
      console.log(`       ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\n  ${cases.length - failures.length}/${cases.length} integration tests passed`);
  if (failures.length) throw new Error(`${failures.length} integration test(s) failed: ${failures.join(', ')}`);
}

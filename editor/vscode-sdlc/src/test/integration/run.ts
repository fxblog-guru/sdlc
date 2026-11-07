/**
 * Downloads a real VS Code, builds a throwaway workspace around the shared state fixture, and runs
 * the suite inside it.
 *
 * The unit tests in `model.test.ts` cover the parsing rules, and they run in milliseconds. What
 * they cannot tell you is whether the extension activates at all — whether the view ids in
 * `package.json` match the ones `activate()` registers, whether a command is contributed but never
 * registered, whether the activation event ever fires. Every one of those ships a package that
 * installs cleanly and does nothing, which is the failure a viewer is most likely to have and
 * least likely to notice.
 */

import { cpSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

const here = __dirname;
const extensionDevelopmentPath = resolve(here, '../../..');

// One fixture, shared with the bundle: it is both what these tests render and what
// build-state.mjs is asserted to produce. A second copy here would drift.
const fixture = resolve(extensionDevelopmentPath, '../../tests/fixtures/state.sample.json');

/**
 * Anything launched from inside a VS Code extension host inherits `ELECTRON_RUN_AS_NODE=1` and a
 * set of `VSCODE_*` variables describing *that* host. The child Code.exe then starts as plain Node,
 * takes the workspace path for a script to run, and fails with `MODULE_NOT_FOUND` naming a
 * directory - which says nothing about the cause. Clearing them makes the run independent of who
 * started it, which is what a test should be anyway.
 */
function clearInheritedHostEnv(): void {
  delete process.env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VSCODE_')) delete process.env[key];
  }
}

async function main(): Promise<void> {
  clearInheritedHostEnv();

  const workspace = mkdtempSync(join(tmpdir(), 'sdlc-vscode-'));
  mkdirSync(join(workspace, 'dev'), { recursive: true });
  cpSync(fixture, join(workspace, 'dev', 'state.json'));

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: resolve(here, './suite.js'),
    // Flags take the `=` form: split into two array entries, the value lands as a second
    // positional and VS Code takes it for the test module, which fails as MODULE_NOT_FOUND
    // pointing at the workspace - a confusing way to be told about an argument.
    launchArgs: [
      '--disable-extensions',      // every other extension off, so a failure is ours
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${join(workspace, '.vscode-user')}`,
      `--extensions-dir=${join(workspace, '.vscode-ext')}`,
      workspace,                   // last: a leading positional is taken for Electron's app path
    ],
  });
}

main().catch((err) => {
  console.error('integration tests failed');
  console.error(err);
  process.exit(1);
});

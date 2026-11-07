#!/usr/bin/env node
/**
 * PostToolUse hook: lint the file that was just written, if it is a pipeline artifact.
 *
 * Claude Code passes the tool call as JSON on stdin. This reads the path, hands it to lint-dev.mjs
 * in --file mode, and — only when there are errors — exits 2 with the findings on stderr, which is
 * how a hook feeds text back to the model. Warnings are printed but never block; the linter's
 * remit is syntax and contract, not quality (DEV-CONTRACTS §11).
 *
 * Files outside the dev root exit 0 silently. The hook should have no opinion about code.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { sdlcRoot } from './sdlc-root.mjs';

const DEV_ROOT = sdlcRoot();

let payload = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let file;
  try {
    const input = JSON.parse(payload || '{}');
    file = input.tool_input?.file_path ?? input.tool_input?.path;
  } catch {
    process.exit(0);
  }
  if (!file) process.exit(0);

  const abs = resolve(process.cwd(), file);
  if (relative(DEV_ROOT, abs).startsWith('..') || !abs.endsWith('.md') || !existsSync(abs)) process.exit(0);

  const linter = join(DEV_ROOT, 'scripts', 'lint-dev.mjs');
  if (!existsSync(linter)) process.exit(0);

  const run = spawnSync(process.execPath, [linter, '--root', DEV_ROOT, '--file', abs, '--json'], { encoding: 'utf8' });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    process.exit(0);
  }

  if (report.errors === 0) {
    if (report.warnings) {
      console.log(`lint-dev: ${report.warnings} warning(s) in ${relative(process.cwd(), abs)} (advisory, for the reviewer)`);
    }
    process.exit(0);
  }

  const lines = report.findings
    .filter((f) => f.level === 'error')
    .map((f) => `  ${f.rule}:${f.line}  ${f.message}`);
  console.error(
    `lint-dev: ${report.errors} contract error(s) in ${relative(process.cwd(), abs)} — fix before moving on:\n${lines.join('\n')}\n` +
      `These are shape errors (front matter, headings, ids, vocabulary), not judgements about content. See DEV-CONTRACTS §3 and §11.`,
  );
  process.exit(2);
});

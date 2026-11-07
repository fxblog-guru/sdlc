#!/usr/bin/env node
/**
 * skeleton-check.mjs — do the G6 skeleton files exist and say what they must (DEV-CONTRACTS §18.2,
 * §18.3, §18.4)? G7 runs it; a row that is not PASS fails the gate.
 *
 *   node dev/scripts/skeleton-check.mjs [--source .] [--json]
 *
 * Each row checks a shape, never quality: a README with a runnable block of at most ten command
 * lines, an ARCHITECTURE with a mermaid C4 context and container diagram, a CHANGELOG with an
 * `## [Unreleased]`, a SemVer version reported by `--version`, every Dockerfile and CI image pinned
 * by digest, the five Taskfile tasks, renovate.json, a licence step, .editorconfig, a pinned Node
 * version and save-exact, exact dependency versions, and a runbook per alert in ops/alerts.
 *
 * Rows that do not apply (no package.json → no npm rows) are N/A. Exit 1 on any MISSING or FAIL.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIGEST = /@sha256:[0-9a-f]{64}\b/;
const read = (dir, rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8').replace(/\r\n?/g, '\n') : null);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RANGE = /^[\^~><=*]|\s-\s|\|\||^x$|\.x\b|^latest$/;

/** The first fenced block of a README that holds commands, as its non-comment lines. */
function commandBlock(text) {
  for (const m of text.matchAll(/```(?:sh|bash|shell|console)?\n([\s\S]*?)```/g)) {
    const lines = m[1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (lines.length) return lines;
  }
  return null;
}

function files(dir, pred, depth = 0) {
  if (!existsSync(dir) || depth > 3) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'dev', '.sdlc', 'vendor', 'dist'].includes(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...files(abs, pred, depth + 1));
    else if (pred(name)) out.push(abs);
  }
  return out;
}

export function checkSkeleton(root) {
  const rows = [];
  const row = (check, result, detail) => rows.push({ check, result, detail });
  // The npm project sits at the root or one level down (`web/`, `app/`); its .nvmrc / .npmrc may be
  // beside it or at the root.
  const pkgDir = existsSync(join(root, 'package.json')) ? '.' : readdirSync(root).find((d) => !d.startsWith('.') && d !== 'node_modules' && existsSync(join(root, d, 'package.json'))) ?? '.';
  const near = (name) => read(root, join(pkgDir, name)) ?? read(root, name);
  const pkgText = read(root, join(pkgDir, 'package.json'));
  let pkg = null;
  try { pkg = pkgText ? JSON.parse(pkgText) : null; } catch { pkg = null; }
  const taskfile = read(root, 'Taskfile.yml') ?? read(root, 'Taskfile.yaml');
  // The Go module sits at the root (go-react) or one level down (`backend/` in fullstack-go-react).
  const goDir = existsSync(join(root, 'go.mod')) ? '.' : readdirSync(root).find((d) => !d.startsWith('.') && d !== 'node_modules' && existsSync(join(root, d, 'go.mod'))) ?? '.';
  const goMod = read(root, join(goDir, 'go.mod'));

  const readme = read(root, 'README.md');
  const block = readme && commandBlock(readme);
  if (!readme) row('README.md', 'MISSING', 'a Diátaxis tutorial: clone, run and test');
  else if (!block) row('README.md', 'FAIL', 'no fenced block of commands to clone, run and test');
  else if (block.length > 10) row('README.md', 'FAIL', `${block.length} command lines (max 10)`);
  else row('README.md', 'PASS', `${block.length} command lines`);

  const arch = read(root, 'ARCHITECTURE.md');
  if (!arch) row('ARCHITECTURE.md', 'MISSING', 'C4 levels 1 and 2 in mermaid');
  else if (!/```mermaid\s*\n\s*C4Context/.test(arch) || !/```mermaid\s*\n\s*C4Container/.test(arch)) row('ARCHITECTURE.md', 'FAIL', 'needs a mermaid C4Context and a C4Container diagram');
  else row('ARCHITECTURE.md', 'PASS', 'C4 context and containers');

  const changelog = read(root, 'CHANGELOG.md');
  if (!changelog) row('CHANGELOG.md', 'MISSING', 'Keep a Changelog');
  else if (!/^## \[Unreleased\]/m.test(changelog)) row('CHANGELOG.md', 'FAIL', 'no `## [Unreleased]` section (Keep a Changelog 1.1)');
  else row('CHANGELOG.md', 'PASS', 'Keep a Changelog');

  // Version: Go reports it through -ldflags -X main.version; otherwise package.json's SemVer.
  const buildFiles = [taskfile, read(root, 'Makefile'), read(root, '.goreleaser.yaml'), read(root, join(goDir, 'Makefile')), read(root, join(goDir, '.goreleaser.yaml')), ...files(root, (n) => /^Dockerfile(\..+)?$|\.Dockerfile$/.test(n)).map((f) => readFileSync(f, 'utf8'))];
  const ldflags = /-X\s+["']?main\.version=/.test(buildFiles.filter(Boolean).join('\n'));
  if (goMod) row('version', ldflags ? 'PASS' : 'FAIL', ldflags ? '-ldflags -X main.version' : 'the build sets no `-X main.version=` — `--version` cannot report a release');
  else if (pkg) {
    const ok = SEMVER.test(String(pkg.version ?? '')) && pkg.version !== '0.0.0';
    row('version', ok ? 'PASS' : 'FAIL', ok ? `package.json ${pkg.version}` : `package.json version \`${pkg.version ?? 'none'}\` is not a released SemVer`);
  } else row('version', 'MISSING', 'no go.mod or package.json to carry a version');

  const dockerfiles = files(root, (n) => /^Dockerfile(\..+)?$|\.Dockerfile$/.test(n));
  if (!dockerfiles.length) row('Dockerfile', 'MISSING', 'a multi-stage build pinned by digest');
  else {
    // A FROM is pinned when it carries a digest, is `scratch`, or names an earlier stage.
    const loose = dockerfiles.flatMap((f) => {
      const stages = new Set(['scratch']);
      const out = [];
      for (const l of readFileSync(f, 'utf8').split('\n')) {
        const m = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(l);
        if (!m) continue;
        if (!DIGEST.test(m[1]) && !stages.has(m[1].toLowerCase())) out.push(l.trim());
        if (m[2]) stages.add(m[2].toLowerCase());
      }
      return out;
    });
    row('Dockerfile', loose.length ? 'FAIL' : 'PASS', loose.length ? `not digest-pinned: ${loose.map((l) => l.trim()).join(' · ')}` : `${dockerfiles.length} file(s), every FROM by digest`);
  }

  if (!taskfile) row('Taskfile.yml', 'MISSING', 'setup · dev · seed · check · check:fast');
  else {
    const want = ['setup', 'dev', 'seed', 'check', 'check:fast'];
    const missing = want.filter((t) => !new RegExp(`^  ['"]?${t.replace(':', '\\:')}['"]?:\\s*$`, 'm').test(taskfile));
    row('Taskfile.yml', missing.length ? 'FAIL' : 'PASS', missing.length ? `no task: ${missing.join(', ')}` : 'setup · dev · seed · check · check:fast');
  }

  const renovate = ['renovate.json', '.github/renovate.json', '.gitlab/renovate.json', 'renovate.json5'].find((p) => existsSync(join(root, p)));
  row('renovate.json', renovate ? 'PASS' : 'MISSING', renovate ?? 'the update bot (DEV-PROFILE §Dependencies)');

  const ci = [taskfile, read(root, 'Makefile'), read(root, 'scripts/check.sh'), read(root, '.gitlab-ci.yml'), read(root, '.github/workflows/ci.yml')].filter(Boolean).join('\n');
  row('licence check', /go-licenses|license-checker|licensee|licence|license/i.test(ci) ? 'PASS' : 'MISSING', 'a check step that fails outside the allowlist');

  row('.editorconfig', existsSync(join(root, '.editorconfig')) ? 'PASS' : 'MISSING', 'charset, end of line, indent');

  if (pkg) {
    const nvmrc = near('.nvmrc');
    const ok = (nvmrc && nvmrc.trim()) || pkg.engines?.node;
    row('node version', ok ? 'PASS' : 'MISSING', ok ? `.nvmrc ${nvmrc?.trim() ?? '—'} · engines ${pkg.engines?.node ?? '—'}` : 'no .nvmrc and no engines.node');
    const npmrc = near('.npmrc');
    row('.npmrc', npmrc && /^save-exact\s*=\s*true\s*$/m.test(npmrc) ? 'PASS' : npmrc ? 'FAIL' : 'MISSING', 'save-exact=true');
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
    const ranged = Object.entries(deps).filter(([, v]) => RANGE.test(String(v).trim()));
    row('exact versions', ranged.length ? 'FAIL' : 'PASS', ranged.length ? `${ranged.length} range(s): ${ranged.slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ')}` : `${Object.keys(deps).length} exact`);
  } else {
    for (const c of ['node version', '.npmrc', 'exact versions']) row(c, 'N/A', 'no package.json');
  }

  const ciFiles = [join(root, '.gitlab-ci.yml'), ...files(join(root, '.github', 'workflows'), (n) => /\.ya?ml$/.test(n))].filter(existsSync);
  // An image is `image: x`, `image:\n  name: x`, or GitHub's `container: x` / `uses: docker://x`;
  // a `$VAR` resolves through the file's `KEY: value` lines, as release-management pinned its tags.
  const tagOnly = ciFiles.flatMap((f) => {
    const text = readFileSync(f, 'utf8');
    const vars = Object.fromEntries([...text.matchAll(/^\s+([A-Z][A-Z0-9_]*):\s*["']?([^\s"'#]+)/gm)].map((m) => [m[1], m[2]]));
    const refs = [...text.matchAll(/^[ \t]*image:[ \t]*\n[ \t]+name:[ \t]*["']?([^\s"'#]+)|^[ \t]*(?:image|container):[ \t]*["']?([^\s"'#]+)|docker:\/\/([^\s"'#]+)/gm)].map((m) => m[1] ?? m[2] ?? m[3]);
    return refs.map((r) => r.replace(/^\$\{?([A-Z][A-Z0-9_]*)\}?$/, (all, k) => vars[k] ?? all)).filter((r) => !DIGEST.test(r) && !r.startsWith('$'));
  });
  row('CI images', tagOnly.length ? 'FAIL' : ciFiles.length ? 'PASS' : 'N/A', tagOnly.length ? `pinned by tag only: ${tagOnly.slice(0, 3).join(' · ')}` : ciFiles.length ? 'every image by digest' : 'no CI file at the root');

  const alertsDir = join(root, 'ops', 'alerts');
  const alerts = existsSync(alertsDir) ? readdirSync(alertsDir).filter((f) => /\.ya?ml$/.test(f)).flatMap((f) => [...readFileSync(join(alertsDir, f), 'utf8').matchAll(/^\s*-\s*alert:\s*(\S+)/gm)].map((m) => m[1])) : [];
  if (!alerts.length) row('runbooks', 'MISSING', 'no alert in ops/alerts/*.yml (§18.3)');
  else {
    const noBook = alerts.filter((a) => !existsSync(join(root, 'ops', 'runbooks', `${a}.md`)));
    row('runbooks', noBook.length ? 'FAIL' : 'PASS', noBook.length ? `no ops/runbooks/<alert>.md for ${noBook.join(', ')}` : `${alerts.length} alert(s), each with a runbook`);
  }
  // §13.5: telemetry leaves through one collector config, never a vendor SDK in the code.
  const collector = read(root, 'ops/otel/collector.yaml');
  if (!collector) row('collector', 'MISSING', 'ops/otel/collector.yaml: logs, traces and metrics to the backend the env names (§18.3)');
  else {
    const lacks = ['otlp', 'filelog', 'trace_parser'].filter((k) => !collector.includes(k));
    row('collector', lacks.length ? 'FAIL' : 'PASS', lacks.length ? `ops/otel/collector.yaml has no ${lacks.join(', ')} — spans, stdout logs and the log→trace link` : 'OTLP traces, stdout logs linked to traces');
  }
  return rows;
}

function main(argv) {
  const i = argv.indexOf('--source');
  const root = resolve(i !== -1 ? argv[i + 1] : '.');
  const rows = checkSkeleton(root);
  if (argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else {
    for (const r of rows) console.log(`${r.result.padEnd(8)} ${r.check.padEnd(16)} ${r.detail}`);
    const bad = rows.filter((r) => r.result === 'MISSING' || r.result === 'FAIL').length;
    console.log(`\n${rows.length - bad}/${rows.length} pass or N/A — templates for every row: dev/_templates/skeleton/ (DEV-CONTRACTS §18.2)`);
  }
  process.exit(rows.some((r) => r.result === 'MISSING' || r.result === 'FAIL') ? 1 : 0);
}

if (process.argv[1]?.endsWith('skeleton-check.mjs')) main(process.argv.slice(2));

# Evidence — Step 5b: verification you can count

Written for: whoever has to decide later whether Step 5b of [the learning roadmap](../learning-roadmap.md)
really works. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillar: P4 Verification and safety.

## What was built

| Piece | File |
|---|---|
| Contract | `DEV-CONTRACTS.md` §22 |
| Hard denies: 14 globs + a hook that parses the command line | `settings.json` `deny`, `hooks/bash-guard.mjs` (PreToolUse) |
| Run audit of approved outward commands | `hooks/bash-guard.mjs` (PostToolUse) → `<root>/logs/commands.jsonl` |
| Caught vs escaped, per gate | `workspace/dev/scripts/gate-effect.mjs`, `/sdlc-status --gates` |
| `## Escaped` in post-release, G11 row 22 | `_templates/post-release.md`, `dev-reviewing-monitoring` |
| Tests | `tests/gate-effect.test.mjs` (17), `tests/mutate.mjs guard` |

## Claim 1: the dangerous form is blocked, the safe near-miss is not

`node --test tests/gate-effect.test.mjs` → **17 pass, 0 fail**. Seven deny rules. 26 dangerous forms are
blocked with exit 2 and a reason. They include `git push origin main --force`, `rm -r -f .` (which the
settings glob alone would miss), `echo x > app/.env`, and `psql -c "TRUNCATE users"`. 17 near-misses
are allowed, among them `git push`, `rm -rf node_modules`, `grep TRUNCATE file`, `echo x > .env.example`,
`git reset --hard HEAD~1` and `git commit -m "drop the force flag"`. The first draft of the guard
wrongly blocked `grep TRUNCATE file` and `.env.example`; both are now tests.

A parse error or a non-Bash tool never blocks: the hook exits 0.

## Claim 2: what a human approved is recorded, without secrets

After a `push`, `apply` or `publish` runs, one line goes to `logs/commands.jsonl`. `--token=abc123secret`
is stored as `--token=[REDACTED]`. `ls` is not recorded. `SDLC_RUN_LOG=off` stops it.

## Claim 3: gate effectiveness on real projects (read-only)

`gate-effect.mjs --root <project>/.sdlc`, 2026-10-23:

| Project | Example rows |
|---|---|
| recall (3 initiatives) | G2 15/15 caught · G7 3/4 · G9 1/2 |
| release-management | G5 11/17 · G7 10/18 · G6 6/9 |
| fx-blog | G2 14/14 · G5 10/10 |

No project has a post-release yet, so every `escaped` is 0. The escape side is proven by fixtures only.
Where caught is lower than raised (release-management G7 10/18), findings were raised and never
resolved: they were deferred, accepted or still open. That is worth a look, not a verdict.

## Claim 4: the tests can fail

`node tests/mutate.mjs guard` → **21/21 killed**. The mutants cover each of the seven rules,
the SQL context on `truncate`, the `.env.example` exemption, the exit code, the parse-error path,
Bash-only, the audit, redaction, RESOLVED-only catches, BLOCKER/MAJOR only, slug-keyed ids,
escape counting, `none`, and both verdicts.

## Not proven

- That the hook is honoured by every Claude Code version in use. It uses the documented `PreToolUse`
  exit-2 contract. It was exercised here through stdin, not inside a live session.
- The deny list is a fence, not a sandbox. A determined command (an encoded script, a binary) can
  still do damage. The guard stops the common accidental forms.

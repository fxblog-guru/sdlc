---
description: Security audit on demand: scanners + an attacker's read of code, pipeline or AI feature → SEC-NNN ledger.
argument-hint: [repo | pipeline | ai | <slug>] [--base <ref>] [--scan-only]
disable-model-invocation: true
---

Audit `${1:-repo}` for vulnerabilities.

This is not a gate. It works on any repository, including one that never ran `/sdlc-*`, and it
changes no artifact, gate log or `state.json`. What it leaves is `<root>/security/findings.md`, one
ledger of every finding that keeps its triage across runs (§13.15), and an audit report. G8 and G9
read the ledger, so a finding raised here blocks a release until a human triages it.

| Scope | Reads |
|---|---|
| `repo` (default) | the whole source tree, risk paths in full |
| `pipeline` | CI files, Dockerfiles, IaC, deploy scripts: the DevSecOps audit |
| `ai` | LLM, RAG and agent code: prompts, retrieval, tools, output handling |
| `<slug>` | that slug's changed files since `--base`, against its `threat-model.md` |

Black-box testing of the running app (ZAP active scan, an authz matrix across roles) is the QA
bundle's `/qa-design --type security` (§9). This command reads the code; that one attacks the app.

## Preflight

1. `node <root>/scripts/doctor.mjs`. Note whether Docker is up: without it and without the scanners
   on PATH, every scanner is `NOT RUN`, and the report says so.
2. Run id: `node <root>/scripts/run-id.mjs`.
3. A dirty working tree is fine. Record `git rev-parse HEAD` and `git status --short | wc -l` in the
   audit's scope line, because a finding is about the code as it was read.

## `--scan-only`

Run `node <root>/scripts/security-scan.mjs run --source . ${--base}`, print its output, and stop.
No agent, no audit. Use it in a loop while fixing, or before `/sdlc-verify`.

## Execution

Spawn **`dev-security-engineer`** with: the scope, the run id, the base ref if given, the head sha,
and the paths `<root>/security/findings.md` and (for a slug) `<root>/design/<slug>/threat-model.md`.
Nothing else. No summary of what the code "does" and no suspicion of your own: an independent read
is the point.

## Done

Report the agent's hand-back block, then:

- every `blocking` row from `node <root>/scripts/security-scan.mjs check`, one line each;
- the triage only a human can make, as one batched question: "accept SEC-004 until <date>, owner?"
  Never set `accepted` yourself;
- the next command for the worst finding.

If the agent named a scanner `NOT RUN`, say what would make it run (Docker, or the binary on PATH).

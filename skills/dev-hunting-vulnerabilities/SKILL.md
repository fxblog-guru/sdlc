---
name: dev-hunting-vulnerabilities
description: Use in /sdlc-security or to find vulnerabilities in our code, pipeline or AI feature: attacker's view, proven SEC-NNN findings.
---

# Hunting vulnerabilities — white-box, our own code

You are the security engineer a team hires after the incident: you assume the code is exploitable
until you have read it, and you believe nothing you have not reproduced. Scanners find the known
and the mechanical. You find what only someone who read the code can: the missing owner check, the
role taken from the body, the prompt that can call a tool it should not.

> `DEV-CONTRACTS.md` §13.6 and §13.15: `node <root>/scripts/contracts.mjs 13.6 13.15`.
> `DEV-PROFILE §Security review` lists the risk paths. Print it with `profile.mjs`.

## Scope and guardrail

Only this repository, its pipeline, its infrastructure-as-code, and environments DEV-PROFILE marks
as ours. Never a third-party host or API, never production data, never an exploit beyond the
smallest proof that a finding is real. The proof is a failing test or a `curl` against the local
preview, not a weaponised payload. Installing the project's own dependencies and running its own
test suite or dev server locally is in scope; nothing else is. With no DEV-PROFILE, "ours" means
this repository and localhost only. Black-box testing of a running app (ZAP active scans, authz
matrices across roles) belongs to the QA bundle (§9). Hand that off, do not duplicate it.

## Step 1 — the machines first

```bash
node <root>/scripts/security-scan.mjs run --root <root> --source . [--base <ref>]
node <root>/scripts/risk-paths.mjs --base <ref>          # or every file, for a whole-repo audit
```

The scan prints its run-id. Use it for the audit too, so the audit and its scan stay tied. Read
`<root>/security/runs/<run-id>/tools.md`. A scanner `NOT RUN` is a gap you name in the report, not a
pass. Triage every new `open` row in `<root>/security/findings.md` before you start reading. A finding you
did not triage is noise that hides the next one.

| Status | When | Required |
|---|---|---|
| `fixed` | the code changed and the rerun no longer finds it | left to the script |
| `accepted` | real, and a named human takes the risk until a date | Owner, Until |
| `false-positive` | the scanner is wrong here | Evidence: why, with `file:line` |
| `open` (confirmed) | real, and nobody has fixed or accepted it yet | Evidence: `confirmed: <trace or test>` |

Edit only Status, Owner, Until and Evidence. The script owns the other columns. You propose the triage. Only a human may set `accepted` (§4.5). Write `accepted` rows as a `DEC-NNN`
question instead.

## Step 2 — map the attack surface

Write it down before reading for bugs: every entry point (HTTP routes, webhooks, queue consumers,
CLI, cron, admin tools, CI jobs), what identity reaches it, what it trusts, and what it touches (DB,
files, shell, network, an LLM, a secret). If `design/<slug>/threat-model.md` exists, start from
its `THR-NNN` rows and check that each control is in the code, not just in the document.

## Step 3 — hunt, by class

Read the catalogue for the surface you have, not all of it. Most web services need two:
`web-and-api.md` plus their language's section of `sinks.md`.

| Surface | Read |
|---|---|
| web app, API, auth, data access | [web-and-api.md](web-and-api.md) — OWASP Top 10 and API Top 10, with what to grep and what proves it |
| the language's dangerous calls | [sinks.md](sinks.md) — per-language source → sink table (Go, Python, TypeScript/Node, SQL) |
| an LLM, RAG or agent feature | [ai-features.md](ai-features.md) — prompt injection, tool abuse, data leakage through context |
| CI/CD, containers, IaC, cloud | [pipeline.md](pipeline.md) — the DevSecOps audit: pins, secrets, permissions, signing, gates that cannot fail |

For each candidate: trace **source → sink** in the code (where does the attacker's byte enter, which
checks does it cross, where does it land). If a check stops it, write that down and move on. If
nothing stops it, prove it.

## Step 4 — prove it, or it is not a finding

| Proof | Strength |
|---|---|
| a failing test in a throwaway worktree that a fix would turn green | best: it becomes the regression test |
| a request against the local preview with its response | good |
| a source → sink trace with `file:line` at each hop and no control between | enough for any severity when no harness can be set up; write `proof: trace only` in the Proof cell, and the fix must bring the test |
| "this looks unsafe" | not a finding. Put it under `## Leads` with what would confirm it |

## Step 5 — record

Add each proven finding to `<root>/security/findings.md` as a row in the ledger's column order
(`Id | Severity | Status | Tool | Rule | Where | Finding | Owner | Until | Evidence | Fingerprint`)
with `Tool` = `review`, the next free `SEC-NNN`, `Rule` = the class, `Fingerprint` =
`review-<SEC id>`, and the proof's path in Evidence. Then write
`<root>/security/audits/<run-id>.md`, with the scan's run-id:

```yaml
---
artifact: security-audit
scope: <slug | repo | pipeline>
head: <sha>
date: <YYYY-MM-DD>
---
```

Sections: `## Scope` (what was read in full, what was only scanned, scanners NOT RUN), `## Attack
surface`, `## Findings` (`| SEC | Severity | Class | Where | Attack | Proof | Fix direction |`),
`## Leads`, `## What was checked and held` (the controls that worked, so the next audit does not
redo them).

Severity: `critical`, an unauthenticated path to other users' data, to code execution or to a
secret. `high`, the same with authentication, or any authz bypass. `medium`, it needs a second
condition. `low`, defence in depth. Do not inflate. A report of twenty highs gets ignored.

## Refuse

- Fixing what you found. The fix goes through `/sdlc-implement` or `/sdlc-refactor`. A fix
  written by the auditor has been reviewed by nobody.
- Testing anything outside the scope above, or running a destructive payload, even locally.
- Writing a secret's value anywhere: ledger, audit, log or test. Name its location and type.
- Marking a scanner finding `false-positive` without a line of evidence.

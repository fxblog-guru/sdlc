---
description: Check the install: bundle files, profile, hooks, toolchain, state index, git. Read-only.
disable-model-invocation: true
argument-hint:
---

Run the installation health check and report what it says.

## Run

`node <root>/scripts/doctor.mjs`

Show the output **verbatim**. It is a script, not a judgement: every line is a file that exists or
does not, a command that resolves or does not, an index that matches the disk or does not. A
diagnostic that could hallucinate would be worse than none, which is why this one cannot.

## Then

For each `FAIL`, give the one command or edit that fixes it — nothing more. For each `WARN`, one
line on what it will affect if left alone (a missing `golangci-lint` means the G8 lint gate cannot
run; a placeholder project name means every stage stops at preflight).

A `stale` warning lists `dev-*` / `sdlc-*` entries under `.claude/` that no install manifest
owns — usually a skill the bundle renamed, still loaded on every session. Show
`node <root>/scripts/doctor.mjs --prune` (a dry run) and ask before `--prune --yes` removes them.

If everything is `PASS`, say so in one line and name the next sensible command:
`/sdlc-onboard` if `<root>/knowledge/` is empty, otherwise `/sdlc-status`.

## Do not

- Do not install tools, edit `DEV-PROFILE.md`, or create files to make a check pass. The doctor
  reports; the person decides. An installer that "helpfully" fills in a profile is how a project
  ends up with `Name: My Project` in production dashboards.
- Do not re-check anything by hand that the script already checked.

# Evidence — Step 4: lessons across projects, and back into the bundle

Written for: whoever has to decide later whether Step 4 of [the learning roadmap](../learning-roadmap.md)
really works. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillar: P2 Memory and learning, across projects.

## What was built

| Piece | File |
|---|---|
| Contract | `DEV-CONTRACTS.md` §19.4 |
| `learn.mjs push`: established lessons to Recall, once each | `workspace/dev/scripts/learn.mjs` (`push`, `toPush`, `lessonPayload`) |
| `learn.mjs promote`: lessons several projects learned → bundle candidates | `workspace/dev/scripts/learn.mjs` (`promote`, `specificTo`) |
| `/sdlc-learn --promote` | `commands/sdlc-learn.md` |
| Tests | `tests/promote-lessons.test.mjs` (10), `tests/mutate.mjs promote` |

## Claim 1: only what is earned leaves the project, and only once

`node --test tests/promote-lessons.test.mjs` → **10 pass, 0 fail**. The tests run against a stand-in
Recall CLI that stores entries on disk and refuses duplicates, as the real server does (HTTP 409
`possible_duplicate`). What they show:
- A provisional lesson stays local. A poisoned lesson is never sent, even an established one.
- A pushed lesson is not pushed again. An edited one is.
- A fresh clone whose Recall already holds the text records it as `already`, without re-sending.
- One failed send in a run of three is retried next time; the two that went are not sent twice.
- With no Recall installed, both commands say so and exit 0.

## Claim 2: the bundle learns only from what several projects agree on, and only via a human

`promote` offers a candidate only when two or more projects pushed the same habit. It refuses a
candidate that names one system: a source path, an endpoint, a table, or a pipeline id. It never edits
the bundle; it prints `A human approves each candidate: /sdlc-improve …`.

## Claim 3: the tests can fail

`node tests/mutate.mjs promote` → **14/14 killed**. On the first run two mutants survived: recording a
failed send, and offering a refused candidate as approvable. Each got a test that fails without it.

## Not run against a live Recall

No Recall server was running on this machine (`localhost:8090` refused). The CLI shape the stand-in
mimics (`push … --body -`, `search --kind lesson --tag sdlc --json`, the 409 duplicate) was read
from `recall/cmd/recall/cli.go` and `internal/httpapi/handlers.go`. The first real push should be
checked by hand: `learn.mjs push --dry-run` lists what would go.

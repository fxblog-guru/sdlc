# Benchmark: agentic-fx-dev against the leading AI-SDLC frameworks

Written for: someone deciding whether to adopt this bundle, or to contribute to it, who already
knows one of the frameworks below.

Compared on 2026-10-04, from each repository's README, file tree and three to eight source files.
Star counts are the GitHub API values that day.

| | agentic-fx-dev | [aidlc-workflows](https://github.com/awslabs/aidlc-workflows) | [Spec Kit](https://github.com/github/spec-kit) | [OpenSpec](https://github.com/Fission-AI/OpenSpec) | [Superpowers](https://github.com/obra/superpowers) | [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) |
|---|---|---|---|---|---|---|
| stars | private | 5.0k | 140k | 71k | 295k | 54k |
| unit of work | initiative (slug) with a change class | intent, with a scope profile | feature spec | change folder with delta specs | spec → plan → tasks | project / epic / story |
| phases | 12 gates + GK | 5 phases, 33 stages, 11 profiles | 6 commands | graph of 4 artifacts | 4 skills | agent personas |
| who approves | an independent reviewer subagent, paths only, written log | the human (Approve / Request changes / Accept as-is) | the human | the human | the human, plus a verification skill | the human |
| evidence required for "done" | per checklist row, hashed in the log | approval + state checkboxes | checklists as "unit tests for requirements" | task `[x]` + `openspec validate` | "no completion claims without fresh verification evidence" | story checklist |
| staleness | SHA-256 of inputs and outputs; `STALE` cascades; `--reaffirm` damps it | re-open a stage: Keep / Modify / Redo | re-run | re-run | — | — |
| state | derived `state.json` + `DASHBOARD.md`, rebuilt by hook | `aidlc-state.md` written by tools, audit shards | files | file existence + `[x]` | git-ignored `progress.md` | `.memlog.md` |
| brownfield | GK knowledge track, 6 cards, gate conditions at G2/G6/G7 | `brownfield.md` rule + reverse-engineering stage | — | by construction: spec only what you change | — | — |
| framework self-tests | `node --test tests/` incl. bundle self-lint | 17 workflows | test + CodeQL | ci + security | per-harness tests + evals | — |
| harnesses | Claude Code | 7 | ~20 | 30+ | 18 | several |

## What this bundle does that the others do not

- **The reviewer is not the author and does not see the author.** Every other framework ends a
  stage by asking the human, or by having the same context grade itself. Here a second subagent
  with a fresh context judges the files against a published checklist and writes a log with a
  hash of what it judged. That is the property everything else protects.
- **Staleness is computed, not remembered.** A gate log records the hash of every input and
  output. Edit an approved document and the gate goes `STALE`, and so does everything downstream.
  `--reaffirm` lets a cosmetic upstream change be waved through on the diff alone.
- **The decision ledger.** A question only a human can answer becomes a `DEC-NNN` with options and
  a recommended default; the agent carries on with everything that does not depend on it and may
  not answer it. `status: assumed` requires a named human.
- **Standards are a registry with an owner and a gate**, not taste: pagination, error shape,
  design tokens, log fields, rollout and migration strategy each have one skill that owns them and
  one gate that can fail you on them.

## What was adopted, and from where

| Pattern | From | Where it landed |
|---|---|---|
| one bootstrap loaded once, everything else on demand | Superpowers (`using-superpowers` via SessionStart hook, 708 words) | `dev-stage-protocol`, invoked by every stage command, resident for the session |
| description = trigger, with a word budget | Superpowers `writing-skills` (<200 / <500 words) | every description one line; `tests/bundle.test.mjs` budgets |
| "no instruction lives in two loaded files" | BMAD `bmad-project-context` | the twelve stage commands carry only their deltas |
| tools own state and slicing; prose does not | aidlc-workflows (`aidlc-state.ts`, "edit core/, never dist") | `contracts.mjs` slices the contract by section; `state.json` was already derived |
| the framework is versioned, with a changelog and a constitution-versioning rule | Spec Kit (`constitution` semver + Sync Impact Report), all five keep CHANGELOGs | `VERSION`, `CHANGELOG.md`, the §-renumbering rule |
| CI on the framework itself; governance files | all five | `.gitlab-ci.yml`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md` |
| naming as a checked convention | Spec Kit (`speckit.*`), OpenSpec (`openspec-*`), Superpowers (`<verb-ing>-<object>`) | `sdlc-*`, `dev-*`, `dev-reviewing-<stage>`, `dev-<verb-ing>-<object>`, enforced by the self-lint |

## What was looked at and deliberately not adopted

- **Scope profiles (aidlc's 11, 30-line YAML files).** The three change classes (`initiative`,
  `change`, `fix`) plus reviewer-declared `NOT_APPLICABLE` cover the same ground with one decision
  at intake and no profile to maintain. Revisit if a fourth class keeps being asked for.
- **Human approval at every stage.** It is the industry default and it is what the gate replaces.
  The human is told the next command, asked only through `DEC-NNN`, and may override a gate in
  writing. Adding an approval prompt per stage would reintroduce the "do you want me to…?" ending
  §4.1a forbids.
- **Delta specs and an archive step (OpenSpec).** Attractive for long-lived products. Not built: a
  closed initiative's artifacts and logs are already immutable and indexed by `state.json`. A
  `<root>/archive/` move is a candidate for 0.3.
- **Multi-harness rendering (aidlc's `core/` → `harness/*`).** The largest adoption lever the
  others have and the one this bundle lacks. Not started, because the reviewer isolation rests on
  Claude Code's subagent and `skills:` semantics, which the other harnesses do not all have.
  Deferred, and stated honestly in the README.
- **Agent personas with names (BMAD).** Role nouns (`dev-solution-architect`) carry the same
  information without the theatre.

## Sizes, for calibration

| | agentic-fx-dev (1.0.0) | aidlc-workflows | Spec Kit | Superpowers |
|---|---|---|---|---|
| always-loaded prose | ~7,100 chars of descriptions + 893-word protocol once invoked | 1.8 KB rules file | — | 708-word skill |
| a stage / command file | 270–700 words | 500–760 words typical | 4,000+ words (`specify`), 400–700 bytes in the lean preset | — |
| a skill | 750–2,600 words, ≤500 lines | 3–30 KB | — | 3–10 KB typical |
| a template | 260–620 words, strict headings | ~200-line state template | spec 1.2k words, tasks 1.85k | — |
| the rulebook | `DEV-CONTRACTS.md` 9,100 words, read by section | five-layer rule chain, lazily read | constitution 267 words (template) | — |

## Per-product scorecard

The comparison above is about design. This one is about outcome: what each product built with the
bundle cost, and how long it took to run somewhere real. A bundle change that claims to make the
next product cheaper or faster is held to these numbers. Each row comes from a retro (`/sdlc-learn
--from`, DEV-CONTRACTS §19.5); a number nobody recorded says `not recorded`.

| Product | Class | Days, G0 → production | Gate logs (G0…G11) | Overrides in force | `assumed` DECs at G9 | First `staging` deploy | First `production` deploy | Tokens |
|---|---|---|---|---|---|---|---|---|
| fx-blog (`anime-blog`), 2026-10 — baseline | initiative | 13 (2026-10-18 → 2026-10-31) | 129 (98 full reviews, 31 reaffirms): G0 8 · G1 27 · G2 26 · G3 18 · G4 12 · G5 12 · G6 17 · G7 6 · G8 2 · G9 1 · G10 0 | 3 (G7 twice, G8) | 29 | never | day 13, from a developer's machine through a tunnel, outside G10; the host changed four times that day | not recorded |

What the baseline's owner said, in their words: too slow and too many tokens; the code generated as
one deployable when they wanted client and server apart; no plan for where it runs or who deploys
it until after G9; no pipeline and no environments. The bundle's answer is §18.7 (host, shape,
environments and pipeline bound from G0; a walking-skeleton deploy in the first slice; G8 on
staging; G10 promotes only), the cap on `assumed` decisions (§15.2), and the process signals and
retro of §19. The next product's row is the test: a first `staging` deploy within the first slice,
production through the pipeline, and fewer logs before G7.

### What the round rules would have changed on the baseline

Counted from the baseline's own log names and front matter (run-id, attempt, verdict,
`revalidated_from`, `override`), not estimated:

| Rule | Logs it touches | Effect |
|---|---|---|
| Two rounds per gate, then the owner decides (§4.3, E045) | 16 logs were a third to ninth full review since the gate last passed: G1 2, G2 8, G3 2, G4 2, G6 2 | each needs an answered `round_decision` first; 12 of them are outside G3–G5 |
| Attempt 2 reads the delta (§4.3, E046, E047) | 28 findings new at attempt 2 and not `BLOCKER`, in 16 of the 32 attempt-2 logs | recorded as `follow-up`; 3 attempt-2 logs that held their gate (G2, G6, G7) would have been `PASS`, each ending a cycle that instead started another run |

Together, 16 of the 129 logs (12 %) would not have been written without the owner deciding first.
The 42 G3–G5 logs are the other large cost; the `fast` class (§15.1) skips those gates unless a
slice escalates one. G7, G8 and G9 never
reached a third round on the baseline: the loops there were G8 verification runs and fix lanes
outside the logs, which the cap now counts the same way (§4.3).

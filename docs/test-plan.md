# agentic-fx-dev — test plan for the bundle itself

**Scope:** this plan tests **the pipeline**, not the products built with it. The products get their
own tests at G7–G8 (unit + integration, owned here) and G-QA (cases, e2e, performance, security,
owned by `agentic-fx-qa`). Confusing the two is how a bundle ends up with a green board and a
broken linter.

**Status as of 2026-09-18:** Phase 1 complete (markdown only). **Level 0 has run once, by hand, and
found three real defects** — see §7. Levels 1–5 do not exist yet because the code they test does not
exist yet. That is the honest position, and this plan says when each level becomes possible.

---

## 1. Levels

| Level | What it tests | Exists when | Automated |
|---|---|---|---|
| **L0 — contract consistency** | The bundle's own documents agree with each other: ids, vocabulary, paths, template ↔ skill ↔ gate wiring | now (ad-hoc), scripted in Phase 2 | yes |
| **L1 — script units** | `lint-dev.mjs` and `build-state.mjs` logic: hashing, state derivation, staleness, error/warn classification | Phase 2 | yes |
| **L2 — golden corpora** | The linter accepts a valid artifact set and rejects a deliberately broken one, violation by violation; the state builder reproduces `state.sample.json` exactly | Phase 2 | yes |
| **L3 — runtime behaviour** | What the pipeline actually does inside Claude Code: preflight blocking, reviewer isolation, gate transitions, hooks firing | Phase 3 (first real slug) | no — observed, with a written script |
| **L4 — install and CLI** | `afx install/update/uninstall --bundle dev`, `doctor`, coexistence with the QA bundle | Phase 7 | partly |
| **L5 — editor extension** | The VS Code viewer renders every state correctly and never invents one | with the extension | yes (against fixtures) |

Each level exists because the level below it cannot catch that class of defect. L0 cannot tell you
the linter is wrong; L2 cannot tell you a subagent leaked context.

---

## 2. L0 — contract consistency (`tests/l0-consistency.mjs`)

Mechanical checks over the bundle's own files. Fast enough to run on every commit.

| Id | Check | Why it matters |
|---|---|---|
| L0-01 | Every `stage:` token in a template is in the `DEV-CONTRACTS §10` vocabulary | **caught a real defect: 11 templates carried pre-restructure tokens** |
| L0-02 | Every `artifact:` token in a template is in the `§3.1` enum, and every enum value is used by exactly one template | **caught a real defect: `problem` was missing from the enum entirely** |
| L0-03 | Every `authored_by` / `reviewed_by` names a skill that exists in `skills/`, with the `dev-` prefix | **caught a real defect: 21 templates lacked the prefix** |
| L0-04 | No template's `authored_by` equals its `reviewed_by` | self-approval is the failure the whole design exists to prevent |
| L0-05 | Every gate in `§4` has a command file, an author agent, a review skill, and at least one template | a gate with no reviewer is a gate that always passes |
| L0-06 | Every path in `§2` resolves to a real directory in `workspace/dev/` | paths drift silently after a restructure |
| L0-07 | Every skill referenced anywhere in the bundle exists; every skill that exists is referenced | orphan skills never load; missing skills fail at runtime |
| L0-08 | Every `_templates/*.md` has front matter with `template_for`, `gate`, `authored_by`, `reviewed_by` | the linter reads these to know which template an artifact must match |
| L0-09 | Counts claimed in `README.md` match the files on disk | a README that lies is worse than no README |
| L0-10 | Vocabulary tokens in `§10` appear identically in the templates, the scripts, and the extension | one enum, three consumers, byte-exact |

---

## 3. L1 — script units (`tests/l1/*.test.mjs`)

### `lint-dev.mjs`

| Id | Case | Expected |
|---|---|---|
| L1-01 | Malformed YAML front matter | `error` |
| L1-02 | Missing required front-matter field | `error`, names the field |
| L1-03 | Heading renamed / reordered / added vs the template | `error`, names the heading and the expected position |
| L1-04 | A `<placeholder>` left in the body | `error`, with `file:line` |
| L1-05 | Malformed id (`REQ-1`, `TASK-abc`, `MIG-2026`) | `error` |
| L1-06 | `authored_by == reviewed_by` | `error` |
| L1-07 | Gate log with an empty evidence cell | `error` |
| L1-08 | Unknown vocabulary token (`verdict: OK`) | `error` |
| L1-09 | A section containing only `N/A` with no reason | `warn`, never `error` |
| L1-10 | A weak but well-formed section | **no finding at all** — the linter must not grade quality (§11) |
| L1-11 | An artifact type with no template | `error` |
| L1-12 | Exit code: any `error` → non-zero; only `warn` → zero | the hook and CI depend on this |

### `build-state.mjs`

| Id | Case | Expected |
|---|---|---|
| L1-20 | Body-only hashing: change `updated:` in front matter | hash unchanged, gate stays `PASS` |
| L1-21 | Body-only hashing: change one character in the body | hash changes, gate goes `STALE` |
| L1-22 | CRLF vs LF, trailing whitespace | identical hash — otherwise Windows and CI disagree forever |
| L1-23 | An input artifact changes | that gate `STALE`, and every downstream gate `STALE` transitively |
| L1-24 | A gate with three outputs, one edited | `STALE`, and `stale_because` names which file |
| L1-25 | Gate log verdict `SKIPPED` | state `SKIPPED`, and it unlocks the next gate |
| L1-26 | Log with `revalidated_from` | state `PASS`, prior log linked, not overwritten |
| L1-27 | Two logs for the same gate (attempt 1 and 2) | the latest wins; attempt 1 remains readable |
| L1-28 | A gate log referencing a missing artifact | `BLOCKED`, never a silent `PASS` |
| L1-29 | Idempotence: run twice on unchanged input | byte-identical output, `generated_at` aside |
| L1-30 | `source_hash` recomputation after a manual edit of `state.json` | mismatch detected and reported |
| L1-31 | `hashArtifact` on a `.md` artifact vs a multi-document `.yaml` contract | body-only for markdown, whole-file for yaml — **passing** |
| L1-32 | `--hash <path>` against the hash the builder compares with | identical, because they are one implementation — **passing** |
| L1-33 | GK state derived from `reviews/_repo/GK-knowledge-*.md` | the §4.1 state machine, not "the cards exist" — **passing** |
| L1-34 | Cards on disk with no GK log | `AUTHORING`, and the cards still indexed — **passing** |
| L1-35 | A knowledge card edited after its review | GK `STALE`, `stale_because` names the card with role `output` — **passing** |
| L1-36 | The reserved `_repo` folder | never appears among `initiatives` — **passing** |

---

## 4. L2 — golden corpora (`tests/fixtures/`)

Two artifact sets, built **before** the linter, so the linter is written against a specification
rather than against itself.

| Corpus | Contents | The linter must |
|---|---|---|
| `fixtures/valid/` | One complete initiative — every artifact type, every gate log state (`PASS`, `CHANGES_REQUESTED`, `BLOCKED`, `SKIPPED`, a `--reaffirm` log, a 2-attempt pair) | accept all of it, zero `error` |
| `fixtures/broken/` | The same corpus, one deliberate violation per file, each annotated with the rule id it breaks | reject **exactly** those files, with **exactly** those rule ids — no more, no fewer |

`fixtures/state.sample.json` is the expected `build-state.mjs` output for `fixtures/valid/`, and is
also what the VS Code extension renders against. One file, two consumers: if the builder and the
extension ever drift apart, this test fails first.

It is **generated**, by `node tests/regen-sample.mjs`, and a test asserts the file on disk equals a
fresh derivation. That is not tidiness — the hand-written version silently fell three fields behind
the builder (`knowledge`, `change_class`, `decisions`) while every test here stayed green, because
the fixture *was* the expectation. A fixture that encodes what someone remembered cannot fail when
the thing it describes moves on.

**Rule:** a new linter rule is not merged without a `broken/` fixture that it catches and a `valid/`
fixture that it leaves alone. The second half matters more — most linter regressions are false
positives, not misses.

---

## 5. L3 — runtime behaviour (`tests/l3-runtime.md`)

These cannot be unit-tested: they are properties of how Claude Code executes the bundle. They are
run by hand against the shakedown slug, with the observation written down each time.

| Id | Scenario | Pass criterion |
|---|---|---|
| L3-01 | Run `/sdlc-requirements` with no G0 log | stops in preflight, names the missing gate and the command that fixes it, spawns **no** subagent |
| L3-02 | Run a stage with `DEV-PROFILE` placeholders unfilled | stops with `> **Project setup required:**`, names the section, guesses nothing |
| L3-03 | **Reviewer isolation** — inspect what the review subagent received | paths only; no pasted artifact content, no author summary, no transcript |
| L3-04 | Reviewer tries to improve the artifact | it does not write to the artifact path; findings appear in the log instead |
| L3-05 | Gate log contents | every checklist row has evidence; no row passes on intent |
| L3-06 | `CHANGES_REQUESTED` round 2 | a **new** log file; every prior `CR-NNN` resolved by id; no bulk "all addressed" |
| L3-07 | Force a third round | stops and asks the human — attempt 3 never runs |
| L3-08 | Author tries to declare its own gate `SKIPPED` | refused; only the reviewer may, with a typed reason |
| L3-09 | Edit an approved artifact | `PostToolUse` lint fires; `Stop` hook rebuilds state; the gate shows `STALE` |
| L3-10 | Cascade | editing G1's output marks G2…G11 `STALE` |
| L3-11 | `--reaffirm` on a typo | new log, `PASS`, `revalidated_from` set, verdict unchanged |
| L3-12 | `--reaffirm` on a substantive change | reviewer **declines**; the stage re-runs in full |
| L3-13 | Interrupt a run mid-authoring | `Stop` hook still rebuilds; state shows `AUTHORING`, not a false `PASS` |
| L3-14 | Reviewer cannot read an artifact (bad path) | `BLOCKED`, never `PASS` |
| L3-15 | A secret is present in a draft artifact | lint or review flags it before G9 |
| L3-16 | Token cost per stage | recorded, so the "review doubles the cost" decision stays evidence-based |

L3-03 deserves the most attention: it is the one property the whole architecture rests on, it
degrades silently, and no script can detect it. The check is manual and it is worth repeating every
time a command file changes.

---

## 6. L4 — install and CLI · L5 — extension

| Id | Check | Expected |
|---|---|---|
| L4-01 | `afx install --bundle dev` into an empty repo | `.claude/{commands,agents,skills}`, `DEV-PROFILE.md`, `<root>/` scaffold |
| L4-02 | Install over an existing `DEV-PROFILE.md` | kept, not clobbered; `--force` backs up as `.bak` |
| L4-03 | `--bundle all` with the QA bundle | no filename, command, agent or skill collision |
| L4-04 | `afx uninstall --bundle dev` | removes exactly this bundle's files, QA untouched |
| L4-05 | `afx doctor --bundle dev` on a deliberately broken install | reports the specific missing pieces, exit non-zero |
| L4-06 | Install from a real clone, not `--from-path` | the path most likely to hide a packaging bug |
| L4-07 | Doctor in an installed layout (`.claude/` + `<root>/`) with the profile filled | 0 FAIL — **passing** |
| L4-08 | PostToolUse hook on a broken artifact, real Claude Code stdin JSON, absolute and relative paths | exit 2, findings on stderr — **passing** |
| L4-09 | GK end to end by hand: card → `AUTHORING` → log → `PASS` → edit → `STALE` → restore → `PASS` | each transition visible on the board — **passing** |
| L4-10 | `--brief`, as the SessionStart hook runs it | carries GK — **passing** |
| L4-11 | Full install into a real brownfield codebase, GK → G0 by real subagents | artifacts lint clean, gate logs well-formed, verdicts reasoned — **passing** |
| L3-03 | Reviewer isolation: does the reviewer see the author's reasoning? | verified on live output — the reviewer contradicted an author self-assessment it was never shown — **passing** |
| L3-08 | Answering a `DEC-NNN` propagates staleness with no new mechanism | verified live — **passing** |
| L5-01 | Extension renders every state in `state.sample.json` | all nine states have a distinct, legible treatment |
| L5-02 | `state.json` missing / malformed / unknown `schema` | says so plainly; never renders a guessed board — **passing** |
| L5-03 | Freshness: a referenced file is newer than `generated_at` | "index may be out of date" banner — **passing** |
| L5-04 | File watcher | edits to `state.json` refresh the board without a reload |
| L5-05 | The extension contains no rule of its own | code review: no thresholds, no verdict logic, no markdown parsing |
| L5-06 | Phase derivation from `current_gate` | G0–G1 Backlog · G2–G6 Design · G7–G8 Build · G9–G10 Ship · G11 Live — **passing** |

> **L5-03 changed during implementation.** It originally said "detect a `source_hash` mismatch".
> That is not implementable without re-deriving the builder's hashing rules inside the viewer —
> exactly the duplication the extension exists to avoid. It now compares each referenced file's
> modification time against `generated_at`: no duplicated logic, and it fails in the safe direction
> (it can warn when nothing meaningful changed; it cannot stay quiet when something did).

---

## 7. Defects this plan has already found

Level 0, run by hand on 2026-09-18 against Phase 1:

| # | Defect | Class | Fixed |
|---|---|---|---|
| 1 | 11 templates carried pre-restructure `stage:` tokens (`architecture`, `deploy`, `operate`, `ship`, `verify`) | L0-01 | yes |
| 2 | 21 templates named skills without the `dev-` prefix agreed in decision #3 | L0-03 | yes |
| 3 | `DEV-CONTRACTS §3.1` omitted `problem` from the artifact enum — G0's own artifact type | L0-02 | yes |

All three are invisible to a careful reading and obvious to a three-line script. That ratio is the
argument for running L0 in CI from Phase 2 onward rather than "when we get to testing".

Phase 3, 2026-09-19:

| # | Defect | Class | Fixed |
|---|---|---|---|
| 4 | `hashArtifact` read a `.yaml` contract as markdown, so an OpenAPI document opening with `---` had its first stanza excluded from the hash a gate recorded a PASS over | L1-31 | yes |
| 5 | No way for a reviewer to compute a hash — gate logs asked for SHA-256 with no tool that produced one | L1-32 | yes, `--hash` |
| 6 | GK reported `PRESENT`, which is not a §4.1 state, and derived from card presence rather than from a review — six confidently wrong cards were indistinguishable from six checked ones | L1-33 | yes |
| 7 | `state.sample.json` was hand-written and three fields behind the builder; the extension's `Initiative` type was missing the same three | L2 | yes, generated |
| 8 | The knowledge templates had nowhere to declare coverage gaps, while the GK checklist required it | L0-01 | yes, `## Sources and gaps` |

Phase 3 dry shakedown, 2026-09-19 — the bundle installed into a throwaway Go repository and driven
through GK by hand, with no model in the loop:

| # | Defect | Class | Fixed |
|---|---|---|---|
| 9 | On a board with no initiatives, a brownfield project was told to run `/sdlc-intake` — which intake's own preflight then refuses for want of knowledge cards, one wasted round later | L4 | yes |
| 10 | GK was printed only when the ladder had something on it, so a card edited after its review left GK `STALE` and the board completely silent | L4 | yes |
| 11 | `--brief` dropped the GK line — and `--brief` is what the SessionStart hook prints, so every session opened without being told the knowledge was stale | L4 | yes |

Defects 4 and 6 have the same shape as the Phase 1 three: each one reads as correct, and each is
caught immediately by asking a script rather than a reader. Defect 7 is the more uncomfortable one —
the test suite was green throughout, because the fixture and the code had drifted *together* away
from the contract.

Phase 3 live shakedown, 2026-09-19 — the bundle installed into a real brownfield Python codebase
(`cli-afx`, 1454 lines across 7 modules) and driven GK → G2 by actual subagents, author and
reviewer separated:

| # | Defect | Class | Fixed |
|---|---|---|---|
| 12 | The G0 reviewer filed `decisions/<slug>.md` under `outputs`, which disables the damping valve: answering one question marks the reviewed artifact as edited, `--reaffirm` declines on an output change by design, and a single answer costs a full stage re-run | L2 | yes — §15.2 rule + linter `E016` |
| 13 | The board offered `--reaffirm` on a gate whose staleness came from its own output — a command that refuses by design | L4 | yes |
| 14 | The board named the next stage command for an initiative blocked by open decisions; that command refuses at preflight | L4 | yes |
| 15 | `/sdlc-doctor` checked that git exists but not that `<root>/` is tracked in it — so `--reaffirm` fails the first time it is needed, after a gate has already gone `STALE` | L4 | yes |
| 16 | **A contract contradiction.** §1 gives a stage execution one run-id, §2 names the log after the run-id, §5 requires a second round to write a *new* log. All three cannot hold. Attempt 2 had no filename it could legally take | L0 | yes — `-a<N>` suffix, and `E011` checks it against `attempt` |
| 17 | `build-state.mjs` chose the winning log by filename sort, and `-` (0x2D) sorts before `.` (0x2E) — so a second-round `PASS` lost to the `CHANGES_REQUESTED` it had just resolved, and the gate would never move | L1 | yes — ordering is by `run_id` then `attempt`, from the front matter |
| 18 | A gate log is immutable (§5) while §17 keeps adding checks, so a log written before a rule existed failed it forever and `dev:lint` went permanently red | L1 | yes — §11.1: a superseded log is still checked, but only the log in force can fail the build |
| 19 | `E006` fired on the literal token `REQ-NNN`, so a gate log quoting its published checklist **verbatim as §5.3 requires** could not lint clean. The only escape was paraphrasing the checklist — the exact drift the verbatim rule prevents | L1 | yes — the contract's own id notation is exempt |
| 20 | `--reaffirm` needs every reviewed input version recoverable from git, and nothing required a gate to commit. The reviewer correctly refused to reaffirm a diff it could not bound, which means the damping valve silently does not exist in a project that commits irregularly | L4 | yes — a `PASS` commits `<root>/`, stated in §4.4 and in every command |

What the shakedown proved, as distinct from what it found:

- **Author/reviewer isolation works, and pays.** The GK author reported its conventions card as "a
  full census rather than a sample". The reviewer, given paths and nothing else, re-ran the census
  and found it counted 15 of 25 constants, plus a citation pointing three lines off the fact it
  named. Neither is visible to a reader; both are trivial to a reviewer that runs things. This is
  L3-03, verified on real output rather than by inspection.
- **The reviewer re-ran every command the cards transcribed** — `pytest` exit 5, `compileall`,
  the import probe — rather than trusting the transcripts. Three cards' honesty about their own
  limits rests on those runs.
- **A skill may not answer its own question, and now cannot.** Mid-shakedown the rule was tightened:
  an agent may record a `DEC-NNN` and recommend a default, but may not proceed on that default, and
  `status: assumed` requires a named human (`error` E017). The G1 reviewer applied it the same hour
  and raised `CR-006 MAJOR` — a requirement written to one branch of an open decision, with the
  ledger row still reading `open`. That is the failure mode worth naming: not an agent inventing an
  answer, which is easy to catch, but an agent recording the question, recommending an answer, and
  then building on its own recommendation. The board shows a question outstanding while the code has
  already chosen.
- **`--reaffirm` refused to reaffirm.** Given a diff whose pre-image hash did not match what the
  prior log recorded, the reviewer returned `BLOCKED` rather than approving a change it could not
  bound. It found that by hashing the diff's base and comparing — not by being told. Defect 20 is the
  workflow gap that produced the bad diff.
- **The decision ledger closed its loop live.** Five `DEC-NNN` opened at G0 rather than guessed,
  answered by the maintainer, and the gate went `STALE` through the ordinary input-hash rule with no
  new mechanism — exactly as §15.2 claims. Two answers contradicted the recommended defaults, which
  is the case worth having: a ledger that only ever confirms its own suggestions is not doing
  anything.

Defects 9 to 11 are a different shape againDefects 9 to 11 are a different shape again, and none of them could have been found by reading: all
three are about what the board chose **not** to print. The machinery was right — `state.json` said
`STALE` with the file and both hashes — and the one surface a person actually reads said nothing.
They were found by installing the bundle and looking at it, which is the argument for doing that
before the model-in-the-loop shakedown rather than after. `tests/status.test.mjs` now covers all
three.

---

### Defects 21–28 — found while completing G3–G11 and the editor

- **21 — `coverage.md` was mandated by §2 and absent from §3.1's enum.** The moment the template was
  written, `L0` failed: the test asserts a bijection between the enum and `_templates/`. Two sections
  of one document disagreeing about which artifacts exist is exactly what L0 is for, and it took
  eight months of nobody writing that template for it to surface.
- **22 — `status: approved` could never be written by anyone.** §3.1 and §5.2 said the review skill
  writes it; §12.2 forbids a review skill touching the artifact. Not a wording slip: the narrow
  version that *is* mechanically sound — write the status, then hash — still puts the verdict in two
  places that can disagree. Resolved by removing `approved` from the vocabulary. The gate log is the
  approval; `E010` now reports the withdrawn value with a pointer to where the answer moved.
- **23 — a `change` could ship a migration with no rollback plan.** §15.1 skipped G10 and G11 by
  class, so a one-field change carrying a migration deployed with no release plan and no SLO —
  contradicting §13.4 and §13.5. Fixed by treating G10/G11 the way G2–G5 are already treated: left
  `NOT_STARTED`, decided by each gate's own applicability rule, never guessed at intake. The class
  table was skipping exactly the changes that most needed those gates, silently, weeks early.
- **24 — eleven skills and two commands were named by the contract and did not exist.** §4, §6, §13
  and nine template headers referenced `dev-reviewing-code`, `dev-verifying-build`,
  `dev-designing-ui-system` and others; the installed files used different names. A gate whose
  review skill cannot be resolved cannot be reviewed. Resolved by moving the contract to the
  installed names, writing the four that were genuinely missing
  (`dev-resolving-code-placement`, `dev-documenting-changes`, `dev-writing-migrations`,
  `dev-writing-nextjs-code`), and dropping the rest into the skills that absorbed them.
- **25 — `dev-gate-reviewer` could invoke four review skills out of thirteen.** Its `skills:` front
  matter stopped at G2, so every gate from G3 up would have been judged by a reviewer that could not
  load its own checklist. All four build agents reported it independently, which is the useful
  signal: a gap four readers hit is not an edge case.
- **26 — the CI check I had just written would have failed every pipeline.** `build-state.mjs`
  rewrote `generated_at` on every run, so comparing a rebuild against the committed index always
  found a diff. A check that always fails is a check everyone learns to ignore, which costs the
  thing it was protecting. The index now writes only when something other than the timestamp moved.
- **27 — the test for defect 26 passed against the broken code.** Two rebuilds inside the same
  second produce the same timestamp, so asserting byte-equality proved nothing. Rewritten to backdate
  the committed copy first; reverting the fix now fails it. This is the second time in this bundle a
  test has had to be mutation-checked before being believed, and both times the first version was
  vacuous for a reason that looked like thoroughness.
- **28 — the editor's integration harness could not start inside an editor.** Anything launched from
  a VS Code extension host inherits `ELECTRON_RUN_AS_NODE=1`, so the child VS Code started as plain
  Node and read the workspace path as a script, failing with `MODULE_NOT_FOUND` naming a directory.
  The error says nothing about the cause. The runner now clears the inherited host environment,
  which is what a test should do anyway.

- **29 — the §15.2 leak is pervasive, not local, and nothing surfaced it before a reviewer read for
  it.** The same open decision reached three consecutive gates in three different vocabularies: as
  requirement text at G1, as an accepted-invocation definition in the acceptance criteria at G1
  again, and as a stated fact about the default path at G2. When the G2 author was finally asked to
  sweep rather than patch the quoted sites, it found **ten**, six of them in artifacts the reviewer
  had not cited — including two leaking the *opposite* branch. A rule that only reviewers enforce
  costs one attempt-2 per gate, every gate, forever.

  Answered with `W018`, an advisory linter rule: a stage whose artifacts **and gate log** name none
  of the slug's open decisions is reported. The linter cannot tell whether a sentence picks a branch
  — that is meaning, and §11 keeps it out of meaning — but it can tell that a stage went past an
  open question without ever referring to it. Reading the gate log too is what makes it precise: a
  gate can pass before a decision exists, go `STALE` when it is opened, and be re-reviewed against
  it without the artifact changing, and reading only artifacts would call that silence.

  Both mutations fail it: making the rule never fire breaks two tests, making it chase answered
  decisions breaks the third.

### The GK to G2 shakedown, closed

`bundle-inventory` reached `GK ✔ · G0 ✔ · G1 ✔ · G2 ✔`, every gate earned rather than waived, over
eleven author and reviewer runs against a real repository. What it established that reading the
bundle could not:

- **Author/reviewer isolation pays for itself at every gate.** GK: the author called its conventions
  census complete; the reviewer, given paths only, re-ran it and found 15 of 25. G1: the reviewer
  contradicted four claims by grepping. G2: the reviewer re-ran nine of ten quoted searches
  byte-for-byte and found the tenth no longer reproduced, because the gate's own ADRs had changed
  what it listed — a defect invisible to any reader and obvious to anyone who runs it.
- **The §15.2 sweep converged, and the numbers say why it needed three passes.** The attempt-1 log
  named 4 decision-sensitive sites. The author, asked to sweep rather than patch, found **10**. The
  attempt-2 reviewer, sweeping independently in three passes over eight artifacts, found **20** —
  four beyond the author's, including a threat-model likelihood column and a diagram label. All
  twenty carry `N/A — blocked by DEC-006`; none survived in either direction; the ledger row is
  still `open` and no row is `assumed`. A design was completed, in full, around an unanswered
  question — which is the claim §15.2 makes and the first time it has been demonstrated end to end.
- **Two rounds converged at every gate that needed them.** G1 and G2 both passed at attempt 2 and
  neither reviewer requested a third, so §4.3's stop was never reached. That matters because the
  stop is the expensive branch: it hands the disagreement to a human.
- **`--reaffirm` refused, correctly, and then was unavailable.** The prior verdict's ledger version
  had never been committed, so no diff could be built against it and the gate took a full Mode A
  re-review. That is defect 20 landing in practice, and it is why the commit-on-PASS rule is in
  every gate command rather than in the guide.

### What the editor shakedown proved

- **Seven integration tests run in a real VS Code**, not a mock, and two mutations confirmed they
  discriminate: unregistering a contributed command fails three of them by name; making the viewer
  write one file to the workspace fails exactly the test that claims it never does. That last one is
  the README's central promise, and it is now the only claim in this bundle that a machine checks.
- **The packaged `.vsix` shipped its own test suite and source maps** until `.vscodeignore` was
  rewritten without negations — `!out/**` re-includes everything under `out/`, which is how a 0.1.0
  ends up distributing `model.test.js` to every user.

## 8. Not tested, deliberately

| Not tested | Why | What covers it instead |
|---|---|---|
| Whether a review's *judgement* is correct | There is no oracle for "is this architecture good" | The reviewer's published checklist plus human spot-checks of gate logs |
| Whether a skill produces good prose | Subjective, and the `skill-creator` eval loop is the right tool if it ever becomes worth it | Human reading during the shakedown |
| Model non-determinism across runs | The same prompt legitimately produces different valid artifacts | Contracts constrain the *shape*; L3 checks the *behaviour* |
| Third-party tools (`golangci-lint`, `psql`, `migrate`) | Not ours | `/sdlc-doctor` checks they exist and are the right version |

---

## 9. CI wiring (Phase 7)

```
push / MR
   ├─ L0  node tests/l0-consistency.mjs          # seconds
   ├─ L1  node --test tests/l1/                  # seconds
   ├─ L2  node tests/l2-corpora.mjs              # valid accepted · broken rejected, rule by rule
   ├─ L5  npm --prefix editor test               # extension against the fixtures
   └─ L4  nightly: install into a scratch repo, doctor, uninstall
```

L3 stays out of CI: it needs a real Claude Code session. It runs on the shakedown slug at the end of
Phase 3, and again whenever a command file or a hook changes — those are the two edits that can
break reviewer isolation without breaking anything a script can see.

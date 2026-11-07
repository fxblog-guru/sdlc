# Contributing

Written for: someone changing the bundle itself — a command, an agent, a skill, a template, a
script. Using the bundle in a project is `docs/user-guide.md`.

## Before you start

```bash
node --test tests/*.test.mjs                 # everything must be green before and after your change
node workspace/dev/scripts/doctor.mjs
```

`DEV-CONTRACTS.md` is the authority. If your change needs a rule the contract does not have, change
the contract first, in its own commit, and cite the section from the file that depends on it.

## The three parts, and where a change goes

| You want to… | Edit | Not |
|---|---|---|
| change what happens at one gate | that gate's `commands/sdlc-<stage>.md` (deltas only) and its two skills | the protocol |
| change what happens at every gate | `skills/dev-stage-protocol/SKILL.md` | twelve command files |
| add a check a reviewer must make | `/sdlc-improve <gate> "<check>"` — one checklist row plus two fixtures | prose in the agent |
| change an artifact's shape | the template in `workspace/dev/_templates/` and `lint-dev.mjs` | the skill that fills it |
| change a rule, a path, a vocabulary word | `DEV-CONTRACTS.md` | anywhere else |
| support a new programming language | the four places in "Adding a language" below | a `.go\|.py` list in a checker |

Nothing lives in two loaded files. If you find yourself pasting a paragraph into a second file, it
belongs in the protocol, the contract, or a sibling reference file the skill links to.

## Naming

The self-lint (`tests/bundle.test.mjs`) enforces these; they are listed so you do not discover
them from a failure.

| Kind | Pattern | Example |
|---|---|---|
| command | `sdlc-<stage or verb>` | `sdlc-design`, `sdlc-ask` |
| agent | `dev-<role noun>` | `dev-solution-architect`, `dev-gate-reviewer` |
| reviewing skill | `dev-reviewing-<stage>` — `<stage>` from the §10 vocabulary | `dev-reviewing-plan` |
| authoring skill | `dev-<verb-ing>-<object>` | `dev-writing-go-code`, `dev-mapping-impact` |
| template | `<artifact>.md`, the artifact name from §2 | `threat-model.md` |
| gate log | `G<N>-<stage>-<run-id>.md` (`-a2` on attempt 2) | `G2-design-20260917-101422-7c15.md` |
| ids | `REQ-NNN`, `TASK-NNN`, `ADR-NNN`, `CR-NNN`, `DEC-NNN`, `MIG-*`, `SLO-NNN` … — permanent, never reused; every kind is in the registry | §1.1 |

All names are lowercase kebab-case. A skill's front matter `name:` equals its directory; an
agent's equals its file name. A name is never shared between an agent and a skill: the installer
merges both into one `.claude/` tree.

## Size budgets

Every file an agent loads is paid for on every spawn. Budgets are at the top of
`tests/bundle.test.mjs`; the test fails when one is exceeded.

| What | Budget | Why |
|---|---|---|
| skill / agent description | 200 / 220 chars, one line, written as a trigger (“Use when…”) | all descriptions share ~1% of the context window; overflow is dropped silently |
| command description | 120 chars + `disable-model-invocation: true` | shown in the `/` menu; user-invoked, so not in the model's listing |
| stage command | 750 words | deltas only — the protocol holds the rest |
| `dev-stage-protocol` | 950 words | loaded once per session, stays resident |
| `SKILL.md` | 500 lines | past that, move reference material to a sibling file and link it |
| agent `skills:` preloads | 2 | the full file is injected on every spawn; preload only what every run uses |

Agents read `DEV-CONTRACTS.md` through `node dev/scripts/contracts.mjs <sections>`, never in full.

## Writing style for agent-facing files

Imperative, numbered where order matters, one rule per bullet. State the rule, then at most one
sentence on the failure it prevents. The long "because" paragraph that explains a rule to a human
belongs in `docs/`, not in a file an agent re-reads on every run. A `Refuse` list names only what
is specific to that file; the standing refusals are in the protocol.

## Tests

- `tests/*.test.mjs` run with `node --test tests/*.test.mjs`. CI runs them on every merge request.
- A new reviewer check needs two fixtures: one under `tests/fixtures/broken/` it must catch, one
  under `tests/fixtures/valid/` it must leave alone (§17). `/sdlc-improve` writes both.
- A new lint rule must be shown to fail. Copy the bundle, break the thing, point the lint at the
  copy:

  ```bash
  cp -r . /tmp/bundle && sed -i 's/^description: .*/description: '"$(printf 'x%.0s' {1..300})"'/' /tmp/bundle/commands/sdlc-design.md
  SDLC_BUNDLE_ROOT=/tmp/bundle node --test tests/bundle.test.mjs   # must fail
  ```

## Releasing

1. Update `VERSION`, `GENERATOR_VERSION` in `workspace/dev/scripts/build-state.mjs`, the README
   badge, and add the entry to `CHANGELOG.md`. Work in
   progress sits under `## [Unreleased]` above the latest release. Regenerate
   `tests/fixtures/state.sample.json` with `node tests/regen-sample.mjs`. `tests/bundle.test.mjs`
   fails when these disagree.
   - The CHANGELOG entry is English, short and written for users of the bundle: a one-line summary,
     then a few bullets under Added / Changed / Fixed / Removed. Name what changed for them, not how
     it was found, which project found it, or word and token counts. Move everything under
     `## [Unreleased]` into the new version.
   - Every **MAJOR** adds a `### Breaking` subsection to its CHANGELOG entry (what breaks, for whom)
     and a `## X.0.0 (MAJOR, from …)` section to [UPGRADE.md](UPGRADE.md) from its template, with
     concrete steps. A MINOR that needs manual steps adds a section too. The bundle test enforces
     the MAJOR rule.
   After any change under `workspace/dev/scripts/`, run `node workspace/dev/scripts/doctor.mjs
   --write-manifest`; `tests/doctor.test.mjs` fails on a stale manifest.
2. `node --test tests/*.test.mjs` green; `doctor.mjs` green.
3. Tag `v<version>`. Projects pick it up with `afx update --bundle dev`. A release that renames
   or removes a skill, agent or command leaves the old copy in installs whose manifest predates it:
   `node dev/scripts/doctor.mjs --prune` lists them, `--prune --yes` removes them.

## Adding a product type

A product type that is not a web app (desktop, mobile, extension, CLI, data pipeline…) is a pack,
not new gates. `docs/pack-template.md` lists the six parts and the proof a pack needs before it
leaves `preview`.

## Adding a language

The gates G0–G6 are language-neutral. A language touches four places, and `tests/langs.test.mjs`
fails until all four agree:

1. **An adapter** in `workspace/dev/scripts/lib/langs.mjs`. It holds the id, the role (`server` or
   `client`), the source extensions, the test-file naming of the toolchain, the comment style, and
   the tools `doctor.mjs` checks. It may also hold `limitConst` (how a numeric limit constant is
   written) and `emitCodes` (the generated FieldError enum). A client language whose framework
   keeps server code beside the UI (Next.js) adds `isServer`, which names those files; the backend
   checkers read them through `isServerFile()`. Every checker reads files through it.
   Without an adapter, a stack runs at the `generic` tier: the gates still run, conventions come from
   the knowledge cards, and `doctor.mjs` warns that no code checker reads it (§25).
2. **An implementation skill**, `skills/dev-writing-<lang>-code/`. Start from
   `dev-writing-python-code`: its sections are the ones a reviewer at G7 reads against (layering,
   the error boundary, query checks, tests).
3. **A blueprint**, `skills/dev-resolving-code-placement/blueprints/<lang>-<ui>.md`, ending in the
   JSON `## Rules` block `layout-check.mjs` reads. Add its row to that folder's `README.md`.
4. **A `DEV-PROFILE.md` §Stacks row** naming the skill and the unit-test tool, and the defaults line
   under it.

What stays language-native, on purpose: Go-only rules (W109 test helpers, `go list` import
direction) and the Python import grammar in `layout-check.mjs`. A new language gets those checks
when someone writes its grammar, which is listed as an allowance in `tests/langs.test.mjs` so that
writing it is a decision rather than an accident.

Run `node --test tests/*.test.mjs`, then `node workspace/dev/scripts/doctor.mjs --write-manifest`,
because the manifest hashes every shipped script.

## Language

Prose in this repository is English, including Vietnamese-authored changes. Vietnamese is fine
inside a document where it is data (an example input, a user-typed category), not instructions.

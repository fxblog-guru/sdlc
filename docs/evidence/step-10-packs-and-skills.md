# Evidence — five product packs and six missing skills

Written for: whoever has to decide later whether the bundle covers the whole lifecycle and the main
product types, and how to check it again. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/packs-and-skills` (on top of 1.8.0, MR !26) · Pillar: P1 Intelligence.

## What was built

The audit of 1.8.0 against the five pillars found six lifecycle areas with no owner, and no product
type beyond web. Each piece below is a reference file beside the skill that writes the artifact,
with a reviewer row that fails on it and an exam case.

| Area | File | Row |
|---|---|---|
| User research | `skills/dev-framing-problem/user-research.md` | G0 19 |
| Prioritisation | `skills/dev-planning-implementation/prioritisation.md` | G6 25 |
| Documentation for users | `skills/dev-packaging-release/user-docs.md` | G9 21 |
| CI/CD pipeline | `skills/dev-designing-cloud/ci-cd.md` | G10 29 |
| Incident response | `skills/dev-designing-observability/incident-response.md` | G11 25 |
| Cost after release | `skills/dev-designing-observability/cost-after-release.md` | G11 26 |

| Product type | Blueprint (checked by `layout-check.mjs`) | Verify, release, operate | Row |
|---|---|---|---|
| desktop | `blueprints/electron.md` | `dev-packaging-release/desktop.md` | G9 22 |
| extension | `blueprints/vscode-extension.md` | `dev-packaging-release/vscode-extension.md` | G9 23 |
| cli, library | `blueprints/cli.md` | `dev-packaging-release/cli.md` | G9 24 |
| ai | `blueprints/ai-app.md` | `dev-packaging-release/ai-app.md` | G9 25 |
| mobile | `blueprints/react-native.md` | `dev-packaging-release/mobile.md` | G9 26 |

`lib/coverage.mjs` `PREVIEW_PACKS` registers the five types. `doctor.mjs` reports them as
`preview` (before: `generic`), and says which blueprint applies and that it is not yet proven.

## The exam result

`node tests/exam/grade.mjs docs/evidence/exam/answers-2026-10-23.json`: all 18 exams pass. The
eleven new ones (one seeded flaw and one clean case each) were taken by two independent reviewers
who never saw the key: 11 of 11 flaws found, 11 of 11 clean cases passed, no false alarm. With the
role packs, the total is 36 of 36.

## Tests

`tests/coverage.test.mjs`: preview tiers, the note, doctor output, and each preview pack's blueprint
parses and its reference exists. `tests/role-packs.test.mjs`: all 18 files have principles with
their exceptions, a middle section, anti-patterns, a "G… fails" line and a link from their skill;
every exam row is a real reviewer row. `node tests/mutate.mjs packs`: 12/12.

The test found one real defect before release: `cost-after-release.md` did not open with "Read this
when", so a skill reading its first line would not know when it applies. The file was fixed, not the
test.

## What this does not prove

- **No pack is `full`.** Each needs `/sdlc-onboard` plus one `change` initiative through G6–G9 on
  its proving repository: meeting-capture (desktop), afx-router (extension), cli-afx (cli),
  rag-reference-guide (ai). Mobile has no proving repository yet.
- **No new language skill.** Electron, VS Code extensions and React Native are TypeScript, which the
  bundle already reads; the CLI pack covers Python and Go. Kotlin, Swift, Dart, Rust, Java and C#
  stay `generic` until a real project brings one.
- **Data pipelines (8.5) and other server stacks (8.7)** are not built: their proving repositories
  have been idle since August.
- The exams were written with the packs, so they are the floor. Real releases at G9 are the proof.

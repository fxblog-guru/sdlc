---
name: dev-extracting-conventions
description: Use in /sdlc-onboard to author the GK behavioural cards (conventions, test-conventions, known-debt) with a file:line example per rule.
---

# Extracting conventions — GK

`codebase-map.md` says where things are. You say **how things are written here** — which is what G6
reads to place a file and G7 reads to make new code indistinguishable from the code around it.

## What you are producing

`<root>/knowledge/conventions.md`, `test-conventions.md`, `known-debt.md` — from their templates, each
with `grounded_at: <commit sha>`.

## Extracted, not authored

You are not writing a style guide. You are reporting what the code does.

The distinction has teeth because it inverts the usual instinct. If the codebase does something you
consider wrong, and you write down the better version, then at G7 an agent writes code matching your
preference, a reviewer compares it to the surrounding code, and it matches nothing. You will have
created inconsistency by documenting consistency that did not exist.

So: **a convention with no real example is not a convention.** Every row cites a `file:line` that
does it the way described, and you have opened that line.

## Sample, count, and report the disagreement

Codebases disagree with themselves. That is normal, and hiding it is the single most damaging thing
this card can do.

The method: for each convention, look at **five or more** instances, then record what you found.

- Consistent → state the rule, cite the clearest example.
- Inconsistent → **state that, name the dominant form, and give the count.** "3 handlers return bare
  errors (`api/jobs.go:88`, `api/users.go:41`, `api/auth.go:112`), 11 wrap with context — wrapping
  is dominant and is what new code should match."

That second shape is far more useful than a clean rule, because it tells a G7 reviewer whether a
deviation is a mistake or the house style, which is a question they otherwise cannot answer.

One instance is not a convention. If you looked at one file, say "observed once".

## conventions.md — what to extract

| Area | What to look for | The example to cite |
|---|---|---|
| Naming | files, packages, types, functions, constants, DB objects, routes, env vars | one of each |
| Code placement | where a handler, service, repository, migration, test, fixture, config goes | the directory plus a representative file |
| Error handling | wrapped or bare, sentinel or typed, where mapped to a response | the mapping boundary |
| Logging | library, structured or not, the standard fields, what is never logged | a representative call site |
| Configuration | source, validation, failure behaviour at start-up | the loader |
| Dependency wiring | constructor injection, a container, globals | a constructor |
| Validation | where input is validated, with what | a handler |
| Database access | ORM, query builder, raw SQL, generated code; transaction boundaries | a repository method |
| Concurrency | goroutines/workers/async, how cancellation propagates | a worker |
| API shape | path style, JSON casing, date format, error body, pagination style | a live endpoint |

**Code placement is the row G6 depends on most.** Make it specific enough to place a new file without
guessing: not "handlers go in the API layer" but "one file per resource at `internal/api/<resource>.go`,
registered in `internal/api/router.go:34`".

## test-conventions.md — run the tests

This card has a check the others do not: **the command must actually be run, and its output
recorded.** A documented test command that does not work is worse than none — it will be pasted into
CI at G8 and fail there, in a context where nobody can tell whether the code or the command is
broken.

Record: where tests live relative to the code, the naming pattern, the frameworks, how fixtures and
test data are made, how the database is handled in integration tests, what is mocked and what is
not, the coverage tooling if any, and the run command with its real output — including a failure, if
that is what happened. A test suite that does not currently pass is a fact about this repository, and
`known-debt.md` should carry it.

## known-debt.md — written last, worth the most

You can only see the debt after reading everything else. Write this card at the end.

What belongs in it:

- **Mid-migration areas.** Two patterns coexisting, one of them on the way out. Say which is which
  and where new code goes — this is a fact about a decision already made, not you making one.
- **Fragile code with a reason.** "Do not touch" plus *why*, so a later stage can judge whether its
  change is the exception.
- **Known-broken or skipped tests**, with what they were protecting.
- **Deprecated modules** still in use, and by what.
- **Workarounds** whose original cause is gone or unclear.

Each entry: what it is, where, why it is like that if you can tell, and what happens to someone who
changes it without knowing. Where you cannot tell why, say so — `git log` and `git blame` on the
relevant lines often answer it, and citing the commit is better evidence than inferring intent.

This is the card that most often saves a later stage from a self-inflicted outage, and it is the one
most likely to be skipped because it takes the longest.

## Do not

Recommend, standardise, or improve. Write a gate log or set `status: approved`. Edit application
code or test code. Where you believe something should change, the card says what it is; the change
is an initiative of its own.

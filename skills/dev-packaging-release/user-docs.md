# Documentation for users (G9)

Read this when the change is something a user, an operator or an integrator will use: a feature, a
setting, an API, a CLI flag or an upgrade step. The G9 checklist row 21 cites this file. A junior
release ships the feature. A principal release ships the feature people can find out how to use.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Write for one reader doing one task | A page for everyone helps no one (Diátaxis: tutorial, how-to, reference, explanation) | — |
| 2 | Docs ship in the same change as the feature | Docs written later are never written | — |
| 3 | Every example runs | A copied example that fails costs more trust than no example | — |
| 4 | Release notes say what changed for the reader | "Refactored the service" means nothing to a user; "exports now include notes" does | — |
| 5 | A breaking change has an upgrade path | What to do, in order, before and after | — |
| 6 | Reference is generated from the source of truth | OpenAPI, `--help` and config schemas, not hand-copied tables | — |
| 7 | The user's words | Glossary terms, not internal names | — |
| 8 | Findable | Linked from where the user is: the screen, `--help`, the error message | — |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| In-product help · docs site | One field or one step | A task across several screens |
| Generated reference · hand-written | An API, CLI or config | Concepts and how-tos |
| Changelog · release notes | Developers and integrators | End users |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| Feature with no docs | A user-visible change with no doc, help text or release note |
| Commit log as release notes | Notes list commits or internal names |
| Breaking change, no upgrade steps | A removed or renamed flag, field or endpoint with no migration note |
| Untested examples | Code samples with no check that they run |

G9 fails a release that commits one of these.

# Copy style guide

Read by `dev-specifying-ui` (the ui-spec's `## Copy`), `dev-writing-react-code` (G7) and the
reviewers. `copy-lint.mjs` checks the mechanical rules. Based on the content guidelines of
Atlassian (atlassian.design/content) and Material (m3.material.io/foundations/content-design).

Evidence: release-management (2026-10-13). There were 1,369 strings in 91 `*_COPY` objects and
4 keys in the catalogue. "Cancel" appeared 30 times. The 412 message had 5 wordings and the 429
message had 4. "E-mail" and "e-mail" were both used, as were "GO / NO GO" and "go/no-go", and
"Delete" and "Remove" for the same act. Contractions, empty-state punctuation and Title Case
varied from screen to screen.

## One catalogue

1. Every string a user reads is in `copy/en.ts`, keyed `{area}.{screen}.{element}`
   (`releases.list.emptyTitle`). Shared strings are `common.*` (Cancel, Save, Close) and
   `errors.*` (the Error-UX matrix's copy keys).
2. One string, one key. A second "Cancel" is `common.cancel`, not a new key.
3. A screen reads keys. It never writes text between JSX tags, or a literal `aria-label`,
   `title`, `placeholder` or `alt`.
4. The words in `<root>/glossary.md` are the only words for those things. Its `Not` column lists the
   banned synonyms.

## Voice

| Rule | Write | Not |
|---|---|---|
| Sentence case, everywhere: titles, buttons, menu items, column headers | Add tickets to release | Add Tickets To Release |
| No contractions (they translate badly and read as casual in errors) | could not, do not | couldn't, don't |
| Say what happened, then what to do | The file is larger than 25 MB. Choose a smaller file. | Upload error |
| Buttons are verbs that name the result | Delete release | OK, Yes, Submit |
| Name the object; never "item" when the thing has a name | ticket, release | item, entry, record |
| Numbers as numerals, and through `lib/format` | 3 tickets | three tickets |
| No "please", no "sorry", no exclamation marks | | Oops! Please try again! |

## Patterns

**Errors.** `[Object] could not be [verb]. Try again.` That is `errors.mutation` with `{object}` and
`{verb}`. When the user can fix it, replace "Try again." with the fix ("Choose a smaller file.").
Never show a raw server message, and never show a trace id as the explanation. The trace id goes in
a "Details" disclosure.

**Standard sentences.** Every screen uses these, word for word:

| Case | Sentence |
|---|---|
| 412 | Someone else changed this [object] while you were editing. Reload to see their changes, then make yours again. |
| 429 | Too many requests. Wait [n] seconds, then try again. |
| 5xx | Something went wrong on our side. Try again. |
| offline | You are offline. Changes are not saved until you reconnect. |
| 401 | Your session has ended. Sign in again to continue. |

**Empty states.** A title without a full stop, then one sentence with one. Use the shape for the
case:

| Case | Title | Sentence | Action |
|---|---|---|---|
| first use | No releases yet | Create a release to start tracking its tickets. | Create release |
| no results | No releases match these filters | Change or clear the filters to see more. | Clear filters |
| no permission | You do not have access to this page | Ask a project admin for the Member role. | — |
| not found | This page does not exist | It may have been deleted, or the link is wrong. | Go to releases |
| not a member | You are not a member of this project | Ask a project admin to add you. | — |

**Confirm dialogs.** The title is a question that names the object ("Delete release 2.4?"). The
body is one sentence on the consequence ("Its 12 tickets go back to the backlog."). The confirm
button repeats the verb ("Delete release"). Cancel stays "Cancel". A destructive confirm is the
danger variant. Use the kit's `ConfirmDialog`. The discard guard is "Discard your changes?" /
"Discard changes" / "Keep editing".

**Feedback.** Inline success where the action happened, such as a form footer saying "Saved".
A toast only for an action whose result is off-screen, or for a transient condition (429). A
toast never holds the only route to an action. `role="alert"` only for something a user action
just produced.

## Ready for a second language

1. Plurals use `Intl.PluralRules` through `plural()` in `lib/format`. Keys are `{ one, other }`
   and are never `n === 1 ? … : …`.
2. Interpolate with `t(template, vars)`. Never build a sentence by joining strings, because word
   order differs between languages.
3. No hard-coded locale. Dates, numbers, percentages and sizes go through `lib/format`, which
   reads `<html lang>`.
4. Leave room: a label may grow by 40% in German. Truncate with the full value in a `title`.
5. A second locale is `copy/<lang>.ts` with the same keys, typed `satisfies Copy`, so a missing
   key fails the build.

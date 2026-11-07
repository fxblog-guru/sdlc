# Exploring ideas before framing one (G0)

Read this when the intake starts from `ideas.md`, from user feedback, or from "what should we build
next?" rather than from a request. Framing turns one request into a problem. This file is about
choosing which problem is worth framing at all.

## Sources, in the order they are worth reading

| Source | What it is good for | What it misleads about |
|---|---|---|
| `<root>/ideas.md` ranked rows (§20) | what a real release showed, with evidence | nothing that has not shipped yet |
| `post-release.md` `## Value and cost`, `## Escaped` | where users actually struggled, with numbers | only the features that shipped |
| Support tickets, user interviews | the words users use, the workaround they invented | frequency: the loudest user is not the median |
| Usage analytics | what people do, at scale | why they do it |
| Competitors | what users already expect as table stakes | what to build: copying a competitor's feature copies their guess |
| The team's own ideas | technical leverage nobody outside sees | demand: a team builds what it finds interesting |

Read at least two kinds. One source gives a hypothesis; two that agree give a reason.

## Competitors, done usefully

Name two or three alternatives the user would otherwise use. A spreadsheet and doing nothing count.
For each, write one row: what job it does well, where users complain about it (reviews, forums), and
what switching to us would cost the user. The useful output is the gap, a job nobody does well. A
feature list is not useful. Never copy a competitor's solution into `## Problem statement`; it belongs
at G2 as an alternative, if anywhere.

## From several ideas to one

Write 2–4 options. For each:

- **Value hypothesis.** "If we <change>, <who> will <behaviour>, measured by <metric>." No metric, no
  hypothesis.
- **Evidence.** The sources above that support it, cited.
- **Cost class.** `spike` · `fix` · `refactor` · `change` · `fast` · `initiative`, the honest guess.
- **Kill criterion.** The result, by when, that would mean removing it (§23). An idea nobody can
  say how to kill is one nobody can say how to judge.

Recommend one, and say why the others lost. Do **not** rank `ideas.md` rows. A human ranks (§20).
Your job is to make the comparison easy.

## Red flags

- The idea arrives with a deadline and no metric. Ask what the deadline protects.
- Every option is a feature; none is "do nothing" or "remove something". Removal is often the
  cheapest value there is.
- The evidence is one customer. Write it as `UNVERIFIED:` (§21) and say how many more would convince.
- The value is "users will love it". Ask which behaviour changes, and how you would see it.

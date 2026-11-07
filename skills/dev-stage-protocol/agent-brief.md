# Agent brief — the block every spawn prompt ends with

The orchestrator pastes the block below, filled in, at the end of every author, implementer and
reviewer spawn prompt. The stage's own instructions come first; this block is what every agent
needs and none remembers unprompted.

It exists because of the way long agent runs fail. A single tool call that writes 400 lines, or a
test run with no timeout, stalls past the 600 s limit, and everything since the last commit is
lost. An agent that runs tests against the dev database wipes it for everyone. An agent that
"fixes" a contract it cannot satisfy hides the defect from the reviewer. Each line below answers
one of those.

```text
## Working rules (paste as is; fill the <...>)

- Scope: <the TASK ids, the slice, or the one artifact>. Nothing else; note what you find
  outside it under "Not done" and leave it.
- Tool calls stay short: one file or one command each. Write a long file in parts, with the
  Edit or Write tool, never as one large heredoc (heredocs eat backslashes and get cut off).
- Every command that can hang has a timeout: tests, servers, package installs.
- Commit after each step that leaves the tree green: one task, one artifact section, one fix.
  A stall then loses one step, not the run.
- Commits: author <name> <email>, §18.1 format, `Refs:` / `Slug:` / `Done:` trailers. No
  co-author trailer. Never push, merge, tag or deploy.
- Tests run against the test database only (<test DSN or env var>), never the dev or shared one.
  If only a shared database is reachable, stop and say so.
- Ids: CR and DEC ids from `node <root>/scripts/run-id.mjs --next-cr|--next-dec <slug>`, never
  by counting.
- Facts: a claim about this system or its users that you cannot cite (a file, a card, a DEC, a
  log, a lesson) is written `UNVERIFIED: <claim>`, never stated as known. A question only a human
  can answer is a DEC instead (§21).
- Contract defect: if the requirement, contract or plan cannot be met as written, stop. Do not
  bend the code or the artifact to fit. Report it as below with the exact clause.
- Report, and nothing more:
    status: done | partial | blocked
    commits: <short shas, oldest first>
    paths: <files written or changed>
    tests: <command> → <pass/fail counts>
    not done: <ids, with one line each>
    blocked by: <the clause, DEC or outside dependency>, or none
```

Fill `<name> <email>` from `DEV-PROFILE §Delivery` `Commit author` when it is set, else from
`git config user.name` / `user.email`. Fill the test database from `DEV-PROFILE §Environments`
`Test database`.
A reviewer spawn drops the commit, test-database and contract-defect lines: it writes one log and
changes nothing else.

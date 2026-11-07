# Recall — lessons at the start of a stage (§19)

Preflight step 7. It costs one index, a few hundred tokens at most, and it is the step that makes a
lesson learned on one initiative change what the next one does.

```bash
node <root>/scripts/learn.mjs recall --gate G<N> --stage <stage> --shared
```

| Output | Do |
|---|---|
| `No lesson applies.` and nothing else | Nothing. Say nothing about it; go on. |
| An index of `LRN-…` lines, each with a probe | For each hit **whose probe is a question this stage will face**, run `learn.mjs show <id> …` once for all of them. Pass the lesson ids to the author in the spawn prompt, as a path list: `Lessons: <root>/learnings/LRN-….md`. Skip a hit whose probe is not your question. |
| `Shared, from other projects (Recall)` lines | Another project's habit, shared with every project by the Recall Owner. Pass the titles to the author as hypotheses, labelled `shared`. Never read one as a rule for this repository. |
| `WARN … withheld` on stderr | A lesson failed the safety scan. Carry on without it, and name it in the stage's closing lines for `/sdlc-learn --audit`. |
| `(Recall unreachable …)` | Carry on with the local lessons. This step never stops a stage. |

The author treats a lesson as the first hypothesis. The code, the cards and the reviewer decide. A
lesson that contradicts the code is not obeyed: the author says so under `Not done`, and the lesson
goes to `/sdlc-learn --audit`.

The reviewer is **not** given the lessons. It judges the artifact against its checklist, and a reviewer
primed with "what went wrong last time" stops seeing what is wrong this time (§4.5).

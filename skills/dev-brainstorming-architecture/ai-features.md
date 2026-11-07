# Designing a feature that calls a model (G2)

Read this when the design sends a prompt to an LLM, retrieves context for one (RAG), lets a model call
tools, or ranks or classifies with one. A model is a dependency that is probabilistic, priced per
token, rate-limited, and changes under you. Design for each of those, or G8 has nothing to verify.

## Decide these in the architecture, each with its reason

| Decision | Options worth comparing | What decides it |
|---|---|---|
| Is a model needed at all | rules · search · a small classifier · an LLM | If a regex or a lookup is right 95 % of the time, it is cheaper, faster and testable |
| Which model | the provider's small · mid · large tier | Start with the smallest that passes the eval set. Record the exact model id; an alias moves |
| Where context comes from | the prompt only · retrieval (RAG) · tools | Retrieval when the answer lives in your data; tools when it needs an action or fresh state |
| Sync or async | in the request · a job with a status | p95 latency of the model call against the screen's budget (§13.7) |
| Cost bound | tokens per call × calls per user per day × users | Write the monthly number in `## Quality attributes`; G11 compares it (§23) |
| Failure behaviour | retry · fall back to a smaller model · fall back to no-AI · show an error | The model will time out, rate-limit and refuse. Say what the user sees each time |

## Threats specific to models (add them to the threat model, §13.6)

- **Prompt injection.** Anything the model reads that a user or a third party wrote (a document, a web
  page, an email, a tool result) can carry instructions. The model must not have a permission that
  data could talk it into using. Least privilege per tool; a human confirms any write action.
- **Data leakage.** What goes into the prompt goes to the provider. Classify it (§13.8): no secrets, no
  PII the provider's terms do not cover, no other tenant's data in retrieval. Filter retrieval by
  tenant before ranking, never after.
- **Output trust.** Model output is untrusted input. Escape it before rendering, validate it against a
  schema before acting on it, and never execute it.
- **Cost abuse.** A user who can make the system call the model can make it spend. Rate-limit per user
  and cap tokens per request.

## The eval set is the test suite (G8)

A model feature has no unit test that proves it works. It has an eval set:

- 30 cases at minimum, 100 before a gate leans on the number. They come from real or realistic
  inputs, not from the prompt author's imagination.
- Each case states what a good answer must contain or must not contain, checked by code where
  possible and by a judge only where it must be.
- A judge (an LLM grading outputs) is validated against human labels before its score counts. An
  unvalidated judge produces numbers that look exactly like real ones. Use the ai-eval bundle for this.
- The result is reported with an interval, not a single percentage, and it is re-run when the model,
  the prompt or the retrieval changes.

G8 fails an AI feature that has no eval result. "We tried it and it looked good" is not a result.

## Versioning

The prompt, the retrieval configuration and the model id are versioned artifacts, changed through
review like code. A prompt edited in production is a deploy nobody reviewed.

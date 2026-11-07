# AI application pack: verify, release, operate (preview)

Read this when `DEV-PROFILE` `Product type` is `ai`. The tree is
`dev-resolving-code-placement/blueprints/ai-app.md`; design rules are
`dev-brainstorming-architecture/ai-features.md`. G9 row 25 cites this file. In an AI app a change to
one line of a prompt can change every answer. So the prompt and the model are released like code,
measured on an eval before they ship, and watched for cost and quality afterwards.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | A prompt or model change is a release | It changes behaviour as much as code does | — |
| 2 | The eval set decides, not a demo | Thirty or more labelled cases, scored before and after (G8 row 26) | — |
| 3 | Pin the model id | An alias that moves changes answers with no change of yours | Evaluation of a new model on purpose |
| 4 | Cap cost per call and per day | A loop or an abuse costs money by the hour | — |
| 5 | A fallback when the model fails | Timeouts and refusals happen; the user sees a useful state | — |
| 6 | Abstain rather than invent | "Not found" beats a confident wrong answer (G1 row 18) | — |
| 7 | Log prompts and answers without personal data | You need traces to debug, not a store of users' secrets | — |
| 8 | Roll out new prompts gradually | A flag or a percentage, compared on live quality signals | — |

## Verify, release, operate

| Part | What G8–G11 expect |
|---|---|
| Verify (G8) | the eval result by prompt version and model id, against the previous release |
| Release (G9) | prompt version, model id and eval result in the release notes; a flag for the new prompt |
| Operate (G11) | eval score on sampled live traffic, cost per call, refusal and fallback rate |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| Prompt edited with no eval run | A prompt diff in the release with no eval result |
| `model: "latest"` | An unpinned model alias |
| No spend cap | No per-call or per-day limit on model calls |
| Raw prompts with user data in logs | Logs that store full prompts containing personal data |

G9 fails an AI release that commits one of these.

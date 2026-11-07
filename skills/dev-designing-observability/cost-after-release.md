# Cost after release (G11)

Read this when a change runs on paid infrastructure or calls a paid API (a model, a map, an email
provider); G11 judges it. The G11 checklist row 26 cites this file. A junior team finds out what a
feature costs from the invoice. A principal team attributes cost to the feature, compares it with
the estimate, and has an alert before the invoice.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Cost is a metric of the feature | Cost per request, per user or per tenant is designed in, like latency | A fixed-price hosting plan |
| 2 | Tag everything | Untagged spend cannot be attributed to a feature, a team or an environment | — |
| 3 | Unit cost beats the total | The total rises with success; cost per unit says whether the design is efficient | — |
| 4 | A budget alert exists before launch | A runaway loop or a scraped endpoint costs thousands by morning | — |
| 5 | Compare with the G2 estimate | The gap is a lesson for the next estimate (§23) | — |
| 6 | Idle is waste | Non-production environments scale to zero or stop out of hours | — |
| 7 | Tokens are cost | A model call has a price per call and a cap; an agent loop has a token budget | — |
| 8 | Rightsize from data | Sizes come from measured use, not the first guess | The first week, before there is data |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| On-demand · committed use | Load is new or spiky | Load is steady for a year or more |
| Serverless · always-on | Low or bursty traffic | Steady high traffic |
| A bigger model · a smaller or cached one | Quality fails the eval otherwise | The eval passes with the cheaper one |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| No cost tags | Resources with no feature, team or environment tag |
| No budget alert | A paid feature launched with no spend alert |
| Total only | `## Value and cost` reports the monthly total with no unit cost |
| Uncapped model calls | A model feature with no per-call or per-day cap |

G11 fails a release that commits one of these.

# Product at principal level (G0)

Read this when framing an `initiative`, or any change whose value is not obvious. The G0 checklist
rows 15–17 cite this file. A junior problem statement describes a feature. A principal one names the
outcome it moves, the evidence that the problem is real, and the smallest thing that would prove the
value before the rest is built.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Outcomes over output | Shipping the feature is not the goal; the change in behaviour is | Compliance work: the output is the outcome |
| 2 | Every metric sits in a tree | One outcome (north star), the input metrics that drive it, and a guardrail that must not get worse | — |
| 3 | No vanity metrics | Page views and sign-ups rise while value falls. Measure use that means value: retained, completed, repeated | — |
| 4 | Evidence before investment | A problem cited to research, tickets, usage or a named person; an assumption says so and is tested cheaply first | — |
| 5 | "A competitor has it" is not evidence | It says what they built, not what our users need | — |
| 6 | The smallest test of value comes first | A prototype, a concierge version or a flag for ten users answers the question for a tenth of the cost | Infrastructure that has no smaller form |
| 7 | Say what you will not do | Scope is defined by its edges | — |
| 8 | Launch is planned | Who gets it first, how they hear of it, how adoption is measured | Internal tools with one user |
| 9 | Kill criteria are written before the build | After the build, nobody wants to stop (§23) | — |
| 10 | Price and packaging are product questions | Who pays, for what, and what is free decides what to build | Free products; say so |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| Discovery first · build first | The problem or the solution is uncertain | Both are known, and building is cheaper than learning |
| One big release · staged rollout | Never by default | Almost always: a flag, a beta group, a percentage |
| Activation · retention metric | A new product: do people get to value at all? | An established one: do they come back? |
| Qualitative · quantitative evidence | Why people do something | How many, how often |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| Success is "launch the feature" or "more page views" | The success signal is an output or a vanity metric, with no outcome above it |
| "Users want X" with nothing cited | No research, ticket, data or named person behind the problem |
| No guardrail | The metric could rise by harming something else (support load, churn, cost) and nothing watches it |
| Build everything, then release to everyone | No smaller version and no staged launch |
| "Competitor Y has it" as the reason | The only evidence is another product's feature list |

G0 fails an `initiative` that commits one of these without a `DEC-NNN` a human answered.

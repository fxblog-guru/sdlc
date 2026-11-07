# Domain and process at principal level (G1)

Read this when the requirements describe a business process with several steps or actors, or use a
word that may mean different things to different people. The G1 checklist rows 19–20 cite this
file. A junior requirement lists what the screen does. A principal one models the domain: the words,
the boundaries between meanings, and every path a process can take, including the unhappy ones.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | One word, one meaning, everywhere | The same term in requirements, code and UI removes a whole class of bugs (ubiquitous language) | — |
| 2 | One word with two meanings marks a boundary | "Account" for login and for billing are two bounded contexts; name them both | — |
| 3 | A process is a state machine | States, the event that moves each, who acts, and what is forbidden | A single-step action |
| 4 | The unhappy paths are the requirements | Timeouts, rejections, cancellations and partial failures are where systems break | — |
| 5 | Events are named in the past tense, in the business's words | `ReleaseApproved`, not `UpdateStatus` | — |
| 6 | Rules belong to the domain, not the screen | "A release cannot ship with an open blocker" holds for the API, jobs and imports too | — |
| 7 | Find the domain with the people who live it | Event storming or an interview with a named person, cited | Small, well-understood changes |
| 8 | Model what is, then what changes | The as-is process first, so the to-be shows what really moves | Greenfield products |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| One model · two bounded contexts | The meaning is the same for everyone | Two groups use the word differently, or change it at different rates |
| Status field · explicit state machine | Two or three states, any order | Ordered steps, forbidden transitions, actors per step |
| Synchronous approval · asynchronous workflow | One person, seconds | Several people, hours or days, reminders and timeouts |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| "Order" means the cart in one requirement and the shipment in another | One term with two definitions, no context named |
| Happy path only | A multi-step process with no rejection, timeout or cancellation path |
| Status as free text | States not enumerated, transitions not stated |
| Rules on the button | A business rule written as UI behaviour only |

G1 fails requirements that commit one of these.

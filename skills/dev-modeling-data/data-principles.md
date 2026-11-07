# Data at principal level (G3)

Read this when an entity is copied, synchronised or read by another system, when history must be
kept, when the data feeds reporting or analytics, or when a pipeline or import loads it. The G3
checklist rows 28–32 cite this file. A junior model has tables. A principal model says who owns each
fact, who may depend on it, and how anyone knows it is still right.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | One source of truth per fact | Two writable copies drift, and nobody can say which is right | A cache or projection that names its source and its staleness bound |
| 2 | Every dataset has an owner | An unowned table is changed by everyone and fixed by no one | — |
| 3 | Data others read is a contract | Schema, meaning, freshness and change policy are promised; a breaking change is a new version | Data private to one service |
| 4 | History that matters is never overwritten | An `UPDATE` destroys the evidence of who changed what. Append, or version | Values with no audit, legal or analytical use |
| 5 | Model for the question | Transactions want normalised rows; analytics wants facts at a stated grain with dimensions | — |
| 6 | Quality is checked where data enters | A bad row found at the dashboard has already been used | — |
| 7 | Lineage is known | When a number is wrong, you must find every input and every consumer | Throwaway analysis |
| 8 | Keys are stable and meaningless | An email or a name as a key changes; a surrogate id does not | Natural keys that are truly immutable (an ISO code) |
| 9 | Time is explicit | Store UTC instants; say whether a date is an event time or a load time | — |
| 10 | Governance scales with risk | A solo project needs an owner column; a regulated one needs a catalogue and access reviews | — |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| Normalised · denormalised | Writes dominate and consistency matters | Reads dominate and the copy names its refresh |
| Mutable row · append-only events | Only the current value matters | History, audit or replay matters |
| Slowly changing dimension type 1 · type 2 | Corrections: the old value was wrong | Real change over time: reports must show what was true then |
| Batch · streaming | Minutes or hours of delay are fine | The decision is made in seconds |
| Schema on write · schema on read | The shape is known and shared | Raw landing data that is shaped later, and never served directly |
| Soft delete · hard delete | Undo matters and nothing personal is kept | Personal data a person asked to remove (`privacy.md`) |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| Two systems both write the customer's address | The same attribute is writable in two stores, with no owner named |
| Another team reads our tables directly | A consumer queries the schema with no contract, view or versioned export |
| Status overwritten in place on an audited entity | An audit, billing or approval field updated with no history table or event |
| Dashboards on the OLTP schema | Reporting joins live transactional tables, no grain stated |
| Load and hope | An import or pipeline with no not-null, unique, accepted-value or freshness checks, and no plan for a failing row |
| Email as the primary key | A key that a person can change |
| Local time in the database | Timestamps with no zone |

G3 fails a model that commits one of these without an ADR that names it and accepts it.

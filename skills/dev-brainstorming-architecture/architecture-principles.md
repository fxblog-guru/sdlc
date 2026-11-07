# Architecture at principal level (G2)

Read this when the design adds a component, a store, a queue or an integration, replaces a running
system, serves more than one tenant, or has to choose between two quality attributes. The G2
checklist rows 25–29 cite this file. A junior design lists boxes. A principal design says what each
box costs, what it buys, and what the design gave up to get it.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | A quality attribute is a scenario, not an adjective | "Fast" and "scalable" cannot fail a review; "p95 under 300 ms at 200 rps with one node down" can | Never: an attribute nobody can measure is a wish |
| 2 | Every design trades one attribute for another, and says which | Consistency against availability, latency against cost, flexibility against simplicity. A design that gives nothing up has not been decided | — |
| 3 | Start as one deployable; split only for a reason you can name | A service boundary buys independent deploy, scaling or ownership, and costs a network call, a contract and a failure mode | Two teams that block each other, or one part with ten times the load of the rest |
| 4 | One write that must stay consistent is one transaction, or a named pattern | Writing a database and then a broker loses one of the two on a crash | — |
| 5 | Prefer boring technology the team runs already | Each new runtime is a pager, an upgrade path and a skill to hire | The new tool removes a whole class of failure the old one has |
| 6 | Design for the change you can see coming | Name the next two features; the design takes them without touching its core (§23) | Speculative generality: abstractions for changes nobody has asked for |
| 7 | A migration is designed like a feature | It has steps, a rollback per step, and a point of no return, named | A system with no users yet |
| 8 | Tenant isolation is a property of every query, not of the login | One missing `WHERE tenant_id` is a breach | Single-tenant products |
| 9 | Buy what is not your differentiator, and know the exit | A bought service costs its price plus the cost of leaving it | Regulated data the vendor cannot hold |
| 10 | Decisions that are expensive to reverse get an ADR; cheap ones do not | ADRs for everything bury the few that matter | — |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| Synchronous call · event | The caller needs the answer to continue | The caller only needs to know it will happen; the receiver may be down |
| One transaction · outbox · saga | One store owns every row written | Outbox: one store plus a message. Saga: several owners; each step has a compensation |
| Shared database · database per service | One team, one deploy | Teams deploy independently and the data has one owner each |
| Shared schema with `tenant_id` · schema per tenant · database per tenant | Many small tenants, cheap | Schema: moderate isolation, per-tenant migrations. Database: a contract or a regulator demands it |
| Strangler · parallel run · big bang | Strangler: route by route, both live | Parallel run: compare outputs before the cutover. Big bang: only with no traffic or a tested full rollback |
| Build · buy | It is the product's reason to exist | It is a commodity: auth, email, payments, search |
| Cache · read replica · precompute | Hot keys, tolerant of staleness | Replica: heavy reads, fresh within seconds. Precompute: the same expensive answer asked many times |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| Dual write: save to the database, then publish | Two writes to two systems in one flow with no outbox, transaction or saga |
| Distributed monolith: services that must deploy together | Every change in the design touches two or more services; synchronous chains three deep |
| Microservices for a team of three | A new service whose stated reason is "separation of concerns" |
| Adjective attributes | `## Quality attributes` says fast, scalable, secure, with no number |
| Big-bang rewrite | "Replace the old system" with one cutover date and no route-by-route plan |
| Tenant check at the gateway only | Queries in the design with no tenant predicate, trusting the token check upstream |
| Golden hammer | The same queue or database for every problem, because it is the one already there |
| Resume-driven design | A new runtime the team has never operated, with no failure it removes |

G2 fails a design that commits one of these without an ADR that names it and accepts it.

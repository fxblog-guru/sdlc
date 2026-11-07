---
name: dev-designing-cloud
description: Use when a change runs on AWS, Azure, GCP, Alibaba or OCI: provider and runtime (G2), topology.yaml drawn to the provider's standard, IaC drift (G10).
---

# Designing for the cloud — G2 and G10

You are the solution architect and the DevOps engineer for one change. At G2 you decide **where it
runs** while that is still cheap to change; at G10 you make sure **what gets built is what was
decided**. Both halves work on one file, `deployment/<slug>/topology.yaml`, and one script reads it.

> `DEV-CONTRACTS.md` §13.14 (the rules and codes), §13.4 (deployment), §13.5 (observability),
> §13.6 (security), §2 (paths). `DEV-PROFILE.md` §Environments, §Delivery, §Cloud.
> Print only those: `node <root>/scripts/contracts.mjs 13.14 13.4`.

Reference files, read only the one the step needs:

| File | Read it when |
|---|---|
| [`providers.md`](providers.md) | choosing a provider, or naming the service for a kind on one |
| [`runtime.md`](runtime.md) | choosing VM, managed containers, Kubernetes or functions |
| [`patterns.md`](patterns.md) | shaping the topology: tiers, multi-zone, multi-region, edge, async, DR |
| [`well-architected.md`](well-architected.md) | scoring the design and writing its review headings |
| [`kubernetes.md`](kubernetes.md) | the runtime is Kubernetes on any provider |
| [`delivery.md`](delivery.md) | G10: IaC, pipeline, GitOps, rollout, secrets, cost |
| [`ci-cd.md`](ci-cd.md) | G10: the pipeline itself — fast feedback, build once, OIDC, pinned actions, protected deploys (G10 row 29) |

## The model is the source; the picture is derived

Never draw the cloud diagram by hand and never treat the `.drawio` as the source. Write the YAML,
then generate:

```
node <root>/scripts/topology.mjs check  <slug>                     # provider rules, no browser
node <root>/scripts/topology.mjs render <slug> --as gcp,azure      # → <root>/diagrams/<slug>/cloud/
node <root>/scripts/topology.mjs table  <slug> --as gcp,azure      # service table for the artifact
node <root>/scripts/topology.mjs drift  <slug> --iac infra/,deploy/k8s/   # G10: the IaC builds the model
```

`render` draws each provider's page with its **official icons** (AWS Architecture Icons, Azure,
Google Cloud, Alibaba Cloud, Kubernetes community icons; OCI as the OCI toolkit's component cards)
and its **own group nesting** — an AWS subnet inside a VPC inside a region, an Azure subnet inside a
VNet in a subscription, an OCI subnet in a VCN in a compartment. The output is one editable
`.drawio` per provider plus an SVG and `index.html`. A human may polish the `.drawio` in draw.io;
that polish is not the source, and the next `render` replaces it.

Start from `<root>/_templates/topology.yaml`. Use **neutral group kinds** (`root`, `region`,
`network`, `zone`, `subnet`, `public-subnet`) unless the design needs a provider-only group
(`security-group`, `auto-scaling`, `compartment`, `availability-domain`). Neutral kinds redraw on any
provider, which is what makes the comparison in step 3 one command.

## G2 — decide where it runs

Invoked by `dev-solution-architect` after `dev-brainstorming-architecture` has ranked the quality
attributes. Your output: `topology.yaml`, an ADR, and the `## Deployment` content of
`architecture.md`.

1. **Read the constraints that pick a cloud before taste does.** `DEV-PROFILE §Cloud` (the
   organisation's provider, accounts, regions, approved services), data residency, compliance
   (PCI-DSS, HIPAA, SOC 2, GDPR), the team's operating experience, contracts already signed. If the
   profile names a provider, that is the default and a different one is an ADR arguing against it.
   If nothing names one, the provider is a `DEC-NNN` — recommend, do not assume.
2. **Choose the runtime model** with `runtime.md`: VM, managed containers, Kubernetes, functions.
   The default for a web service with a team under ~5 is **managed containers** (ECS on Fargate,
   Container Apps, Cloud Run, SAE, OCI Container Instances). Kubernetes needs a row of that file
   that forces it — "we might need it" is not a row.
3. **Lay out at least two options.** Write the topology for the recommended one; get the others with
   `table --as` and `render --as`. Options that differ only in provider are real options when a
   constraint (price, region, a managed service, the team) separates them; say which.
4. **Shape it with `patterns.md`**: which tier sits in which subnet, how many zones, what is public,
   what is async, what the recovery objective forces (RTO/RPO → backup, pilot light, warm standby,
   active-active).
5. **Score it with `well-architected.md`** against the chosen provider's pillars. Each pillar gets a
   decision and the risk it leaves — not a slogan.
6. **Write it up.** The ADR records provider and runtime (§13.14 rule 1). `architecture.md`
   `## Deployment` (under the existing section the template names) carries: the service table from
   `table`, a link to `diagrams/<slug>/cloud/<slug>-<provider>.svg`, the zone/region decision with
   its RTO/RPO, and the monthly cost order of magnitude with what drives it.
7. **Run `check` until it is clean**, then `render`, and open the SVG. Look at it the way the reader
   will: is every component the prose names drawn, in the group the prose says, with each arrow
   labelled? A diagram that passes the checker and reads wrong is still wrong.

Stop there. Do not write IaC at G2, size instances, or pick a CI provider — those are G6/G7/G10
decisions, and fixing them now makes the design look more settled than it is.

## G10 — build what was decided

Invoked by `dev-release-engineer` alongside `dev-planning-deployment`. The model now gets the detail
G2 left out: real CIDRs, instance and replica counts, the Kubernetes objects if any. Then:

1. **Hold the IaC against it.** `drift <slug> --iac <dirs>` must exit 0. An `E740` means something
   designed was never built — build it, or mark the component `iac: false` and say why in
   `release-plan.md`. A `W741` means something was built that nobody designed — add it to the model
   (and the picture) or remove it.
2. **Plan the delivery with `delivery.md`**: the IaC layout and state, the pipeline stages and their
   gates, GitOps for Kubernetes, how secrets reach the workload, the rollout strategy the provider
   supports natively (the numbers stay `dev-planning-deployment`'s), tagging and the budget alert.
3. **Redraw.** `render` again, so the picture in `release-plan.md` `## Release` is the one that will
   be deployed. Link the SVG and keep the mermaid deployment diagram only if it adds the environment
   promotion view the cloud picture lacks.

## The diagram rules a reviewer checks

The checker holds the structural rules (§13.14 codes). These it cannot:

- **One diagram, one environment.** Production and staging differ in zone count and size; drawing
  both in one picture hides the difference that matters.
- **Name components as the prose does.** `label:` is the component name from `## Components`; the
  service name comes from the adapter and prints under it. Never `Service1`, `DB`, `Lambda 2`.
- **Draw the request path left to right.** `render` ranks by edge direction, so declare edges in
  flow order; a diagram whose first arrow goes right-to-left is usually missing an edge.
- **Show the boundary that a threat crosses.** Public subnet, private subnet, the managed-service
  boundary: each trust boundary of the threat model is a group here.
- **Count what is counted.** `count:` on replicas, zones as groups. "Highly available" with one zone
  drawn is a finding.
- **Leave out what does not change the answer.** IAM roles, every log group, CI runners: they belong
  in IaC, not in the picture.

## Do not

Design the schema, the API or the screens. Choose a provider because you know it best. Hard-code a
vendor style in the YAML — a kind the registry lacks is a change to `scripts/lib/clouds.mjs` (an
adapter row, a verified stencil, an IaC type), made once for every project. Put credentials, account
ids or real hostnames in the model or the diagram. Run `terraform apply`, `tofu apply`, `kubectl
apply` or any command that changes an environment — this skill plans and checks.

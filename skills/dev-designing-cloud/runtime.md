# Runtime — VM, managed containers, Kubernetes or functions

Read with `SKILL.md` step 2. Choose the least operational burden that meets the ranked quality
attributes. Each step down this list buys control and costs a team's time.

| Runtime | Kind | You operate | Choose when |
|---|---|---|---|
| Functions | `serverless-function` | code and config | event-driven, spiky or low traffic; each invocation short (< 15 min) and stateless; cold start acceptable |
| Managed containers | `container-service` | the image and its scaling rules | **the default** for an HTTP service or worker: long-running, a container image, no cluster to patch |
| Kubernetes | `kubernetes` + `k8s-*` | cluster upgrades, node pools, add-ons, policies, the platform | a row below forces it |
| VMs | `vm` | the OS, patching, agents, scaling groups | a licence, kernel, GPU driver, appliance or lift-and-shift that a container cannot carry |

## Kubernetes is forced by one of these — otherwise it is not chosen

| Row | Evidence that counts |
|---|---|
| Many services, one platform | ≥ ~10 deployables owned by several teams who need one deploy, policy and observability model |
| A platform team exists | named people whose job is the cluster, on call for it |
| Portability is a requirement | a customer or regulator requires running on-premises or on a second provider with the same manifests |
| A workload needs what managed containers lack | sidecars / service mesh, DaemonSets, custom schedulers, GPU sharing, operators (databases, Kafka) the team will run |
| Already standardised | the organisation runs Kubernetes and this service joins it |

If none holds, pick managed containers and record "Kubernetes rejected: no row of runtime.md
applies" in the ADR — that sentence is what stops the decision being reopened every quarter.

## Sizing at G2 is an order of magnitude

Write "2 tasks × 0.5 vCPU / 1 GB, scale 2–10 on CPU 60 %", not an instance family. The family,
reserved capacity and savings plans are G10 detail, decided with real load data.

## State never lives in the compute

Whatever the runtime: sessions in a cache, files in object storage, jobs in a queue, configuration
in environment variables from the provider's secret store (12-factor, factors III, VI, IX). A
container or VM that holds state cannot be replaced, scaled or rolled back, and every rollout
strategy in `delivery.md` assumes it can.

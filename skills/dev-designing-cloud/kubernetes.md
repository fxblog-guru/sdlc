# Kubernetes — on any provider

Read only when `runtime.md` chose Kubernetes. The cluster is a group (`kind: cluster`) inside the
provider's network group; namespaces and node pools nest in it; workloads are `k8s-*` kinds drawn
with the Kubernetes community icons.

```yaml
groups:
  - { id: cluster, kind: cluster, in: app, label: EKS prod }
  - { id: ns-shop, kind: namespace, in: cluster, label: shop }
nodes:
  - { id: ingress, kind: k8s-ingress, in: ns-shop, label: shop ingress }
  - { id: api, kind: k8s-deployment, in: ns-shop, label: Checkout API, count: 3 }
  - { id: api-hpa, kind: k8s-hpa, in: ns-shop, label: api HPA 3–12 }
```

Draw the managed control plane once (the provider's `kubernetes` kind, in the region group) and the
workloads inside the cluster group. Do not draw nodes, kube-system or add-ons unless the change
touches them.

## Managed offerings

| | AWS EKS | Azure AKS | GKE | Alibaba ACK | OCI OKE |
|---|---|---|---|---|---|
| serverless pods | Fargate profiles | virtual nodes (ACI) | Autopilot | ACK Serverless (ECI) | virtual nodes |
| workload identity | EKS Pod Identity / IRSA | Entra Workload ID | Workload Identity Federation | RRSA | workload identity |
| ingress default | AWS Load Balancer Controller | Application Gateway for Containers | GKE Gateway | ALB Ingress | OCI native ingress |

## The baseline every workload meets

- **Requests and limits** on every container; memory limit = request (no overcommit of memory).
- **Probes**: readiness gates traffic, liveness restarts a hung process, startup protects slow boots.
  A readiness probe checks the dependency the pod cannot serve without; liveness never does.
- **≥ 2 replicas, a PodDisruptionBudget, topology spread across zones** for anything user-facing.
- **HPA** on a leading signal; **VPA** in recommend mode to set requests.
- **Pod Security Standards `restricted`**: non-root, read-only root filesystem, no privilege
  escalation, dropped capabilities, seccomp `RuntimeDefault`.
- **NetworkPolicy default-deny** per namespace, then allow by label.
- **Secrets from the provider's store** via External Secrets Operator or the CSI Secrets Store
  driver — never a base64 `Secret` committed to git.
- **Images by digest**, from the provider's registry, signed (cosign) and admitted by policy
  (Kyverno or Gatekeeper).
- **One namespace per app per environment**, with ResourceQuota and LimitRange.

## Delivery on Kubernetes

GitOps (OpenGitOps v1.0: declarative, versioned and immutable, pulled automatically, continuously
reconciled) with **Argo CD** or **Flux**, both CNCF graduated. The pipeline builds and pushes an
image, then commits the new digest to the environment's manifests; the controller applies it.
Nobody runs `kubectl apply` against production.

Packaging: **Helm** for third-party charts, **Kustomize** overlays per environment for your own
manifests (base + `overlays/{dev,staging,production}`). Progressive delivery with **Argo Rollouts**
or **Flagger** (canary with analysis on the same metrics `dev-planning-deployment` names, or
blue-green with a preview service).

## Cluster operations the ADR must own

Upgrade cadence (the provider supports ~3 minor versions; plan one upgrade a quarter), node image
updates, add-on versions, cost allocation per namespace (Kubecost / OpenCost), backup of persistent
volumes (Velero) if stateful workloads run in-cluster — and prefer managed databases outside the
cluster over StatefulSets for anything you cannot afford to lose.

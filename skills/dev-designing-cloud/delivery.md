# Delivery — IaC, pipeline, secrets, rollout, cost (G10)

Read at G10. `dev-planning-deployment` owns the release plan's numbers (promote/abort thresholds,
soak, rollback of data); this file owns how the cloud side is built and shipped.

## Infrastructure as code

| Tool | Use when | Note |
|---|---|---|
| **OpenTofu** | default for any provider | MPL-2.0, Linux Foundation; drop-in for Terraform ≤ 1.5 syntax; state encryption built in |
| Terraform | the organisation already standardised on it / HCP Terraform | BSL 1.1 since 1.6 (2023); IBM-owned since 2025 |
| Bicep | Azure-only shops | first-party, no state file (ARM is the state) |
| AWS CDK / Pulumi | the team prefers a general-purpose language | the program is code: test it like code |
| Crossplane | infrastructure managed from Kubernetes | CNCF graduated; a platform-team tool |

Layout, the same whatever the tool:

```
infra/
  modules/<component>/        reusable, versioned, no environment values
  envs/<env>/                 one root per environment: backend, providers, module calls, tfvars
    main.tf  backend.tf  variables.tf  <env>.tfvars
```

- **Remote state per environment** with locking (S3 + DynamoDB/S3 lock file, Azure Storage, GCS,
  OSS + Tablestore, OCI Object Storage) and encryption. Never one state for all environments.
- **Pin** provider and module versions exactly; renovate bumps them (§18.4).
- **Tag every resource** through provider default tags: `app`, `env`, `owner`, `cost-center`,
  `managed-by=opentofu`.
- **Plan in CI on the merge request, apply from the pipeline after approval**, never from a laptop.
  Store the plan artefact and apply exactly that plan.
- **Static checks** in the pipeline: `tofu fmt -check`, `tofu validate`, `tflint`, and a policy
  scanner (Checkov, Trivy config, or OPA/Conftest) that fails on a public data store, an
  unencrypted volume, a wildcard IAM action, a security group open to 0.0.0.0/0 on a non-edge port.
- Then **`topology.mjs drift <slug> --iac infra/`** — the model and the code agree.

## Pipeline

One pipeline per deployable, stages in this order, each a gate with a fail edge:

1. **Build** — compile, unit tests, lint (G8's gates).
2. **Package** — container image built once, tagged with the commit SHA, pushed by digest; SBOM
   generated (Syft → SPDX/CycloneDX); image scanned (Trivy/Grype) — fail on critical with a fix;
   signed (cosign, keyless OIDC) with SLSA provenance.
3. **Infra plan** — `tofu plan` per environment, posted to the merge request.
4. **Deploy to dev** automatically on merge; **staging** automatically after dev's smoke checks;
   **production** after the manual approval `DEV-PROFILE §Environments` names.
5. **Verify** — smoke checks (§13.4) and the rollout analysis; failure triggers rollback.

CI authenticates to the cloud by **OIDC federation** (GitHub Actions / GitLab CI → AWS IAM role,
Azure federated credential, GCP Workload Identity Federation, Alibaba RAM OIDC, OCI identity
domain) — never a stored access key. GitHub Actions and GitLab CI templates live in `<root>/ci/`.

## Secrets and configuration

Configuration in environment variables (12-factor III); secrets in the provider's store (Secrets
Manager / Key Vault / Secret Manager / KMS Secrets Manager / OCI Vault), injected at run time by the
platform (ECS secrets, Container Apps secret refs, Cloud Run secret mounts, External Secrets on
Kubernetes). Rotation on, with the application reading the current version. Never a secret in
tfvars, a manifest, a Dockerfile or a pipeline variable that prints.

## Rollout, as each platform does it natively

| Platform | Blue-green | Canary | Rolling |
|---|---|---|---|
| ECS | CodeDeploy blue/green; ECS native blue/green | CodeDeploy canary / linear | ECS rolling update (min healthy %) |
| Lambda | alias swap | alias weighted routing (CodeDeploy canary/linear) | — |
| Container Apps | revisions + label swap | revision traffic split % | single-revision mode |
| Cloud Run | tagged revision, then 100 % | revision traffic split % | — |
| Kubernetes | Argo Rollouts blue-green | Argo Rollouts / Flagger canary with analysis | Deployment `maxSurge` / `maxUnavailable` |
| VMs | two instance groups behind the LB | weighted target groups | rolling instance refresh |

`dev-planning-deployment` writes the numbers; name here which mechanism carries them.

## Observability wiring

OpenTelemetry SDK in the service, exporting to the collector or the provider's endpoint (CloudWatch /
X-Ray, Azure Monitor / Application Insights, Cloud Monitoring / Trace, ARMS, OCI APM). Metrics,
logs and traces carry the same `service.name`, `deployment.environment`, version and trace id.
Alerts as code beside the IaC; each `SLO-NNN` has its alert (§18.3, E091).

## Cost guardrails

A budget per environment with alerts at 50 / 80 / 100 %, and anomaly detection on. Non-production
scales to zero or stops out of hours. Log retention set explicitly (30 days application logs by
default, `DEV-PROFILE §Defaults`). Commitments (savings plans, reservations, committed-use
discounts) only after a month of real usage. The FinOps FOCUS export enabled where the provider
supports it, so cost is comparable across providers.

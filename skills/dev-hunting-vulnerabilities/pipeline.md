# Pipeline, containers and infrastructure — the DevSecOps audit

The pipeline holds the deploy keys, the registry token and write access to production. Audit it as
production infrastructure. Each row: the check, and the failure it prevents. Mark each `PASS`,
`FAIL` (a `SEC` row) or `N/A` (with the reason) in the audit's `## What was checked and held`.

## The gates can actually fail

| # | Check | Failure it prevents |
|---|---|---|
| P1 | No security job ends in `\|\| true`, `allow_failure: true`, `continue-on-error: true` or `--exit-code 0` unless a later job reads its report and decides | a scan that never reached the target shows green |
| P2 | Secret scan reads **history** (`gitleaks git`, full clone `GIT_DEPTH: 0`), not just the tree | a key deleted in the next commit is still leaked |
| P3 | SAST runs with explicit rules (`semgrep scan --config p/default`), not `semgrep ci` without a token | the job checks nothing and passes |
| P4 | SCA blocks fixable `critical`/`high` (`--ignore-unfixed --exit-code 1`) | a known-exploitable dependency ships |
| P5 | DAST against a preview, exit codes read: ZAP 0/2 pass, 1/3 fail | a dead staging URL counts as a clean scan |
| P6 | A gate job consumes the scanners' SARIF and the release depends on the gate | the scans run and nobody reads them |
| P7 | Legacy debt has a baseline (`--baseline-commit`, `.checkov.baseline`), not a disabled job | the job gets switched off because it is always red |

## Supply chain

| # | Check | Failure it prevents |
|---|---|---|
| S1 | Every CI image pinned `version@sha256:` (scanners first), every GitHub Action by commit SHA | a repointed tag runs attacker code with your secrets (tj-actions, 2025) |
| S2 | No `curl … \| sh` or `bash <(curl …)` from a branch. Use a pinned image or a checksum-verified release | a compromised script in the job that holds credentials |
| S3 | Lockfiles committed and installs use them (`npm ci`, `uv sync --frozen`, `go mod verify`) | a resolved-at-build dependency changes under you |
| S4 | SBOM generated per image (syft, CycloneDX/SPDX) and kept with the release | you cannot answer "are we affected?" in the next incident |
| S5 | Image signed (`cosign sign`, keyless OIDC) and **verified before deploy** | an unsigned or swapped image reaches production |
| S6 | Base images by digest, rebuilt on a schedule for patches (§18.2) | a pinned base never receives its security fixes |
| S7 | Dependency bot (Renovate/Dependabot) bumps pins with review | pins rot into known CVEs |

## Secrets and identity

| # | Check | Failure it prevents |
|---|---|---|
| I1 | Cloud access by OIDC federation, not stored long-lived keys | a leaked CI variable is a permanent cloud credential |
| I2 | Secrets are masked **and** protected (only on protected branches/tags) | a fork MR or a feature branch prints or uses the deploy key |
| I3 | Fork / external MR pipelines get no secrets (`pull_request`, not `pull_request_target` with checkout of the head) | a contributor's PR exfiltrates secrets |
| I4 | GitHub `permissions:` set per workflow, least privilege (`contents: read` by default) | `GITHUB_TOKEN` with write-all |
| I5 | No secret in `ENV`/`ARG`/a layer. Build secrets via `--secret` mounts | `docker history` shows the key |
| I6 | Deploy to production needs an environment approval / protected environment | any merge auto-deploys an unreviewed change |
| I7 | Self-hosted runners do not run untrusted MRs, and are ephemeral or cleaned | a job leaves a backdoor for the next one |

## Containers and runtime

Non-root `USER`. Read-only root filesystem where possible. No `--privileged`, no Docker socket
mount in a job that runs untrusted code. Drop capabilities. Health checks. Minimal base
(distroless/alpine/chainguard). `trivy image` on the built digest, not the tag.

## Infrastructure as code

checkov or trivy-config across Terraform, Kubernetes, Helm, Dockerfiles and CI files. The findings
that matter most: public buckets and databases, `0.0.0.0/0` on admin ports, encryption off at rest,
IAM `*:*`, Kubernetes pods running as root or with host networking, no NetworkPolicy, secrets in
plain ConfigMaps. Drift: the deployed state matches the code (§13.14).

## Branch and repository

Protected default branch. Required review and required pipeline. No force-push. Signed commits or
verified authors where the org requires it. `CODEOWNERS` on `ci/`, `deploy/`, infrastructure and
auth code.

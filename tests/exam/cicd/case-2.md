# .gitlab-ci.yml review notes (excerpt) — orders

## Pipeline

Images pinned by digest (`node:22.11@sha256:…`). Cloud access through GitLab OIDC to a role scoped to the deploy. `deploy:prod` runs only on the protected `main` branch, in the protected `production` environment, with one approver. No job has `allow_failure`.

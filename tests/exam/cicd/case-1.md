# .gitlab-ci.yml review notes (excerpt) — orders

## Pipeline

`image: node:latest`. AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are CI variables. `deploy:prod` runs on any branch. `test:e2e` has `allow_failure: true`.

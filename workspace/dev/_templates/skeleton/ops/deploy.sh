#!/usr/bin/env sh
# ops/deploy.sh <staging|production> <sha> — put the image built from <sha> on that environment.
#
# The pipeline calls it (deploy_staging automatically on the default branch, deploy_production on a
# manual approval, the same <sha>), and a person can run it the same way. The default body is one
# host per environment over SSH, running docker compose with ops/compose.prod.yaml. For another host
# (Kubernetes, a container service, a PaaS) replace the body and keep the interface: environment and
# SHA in, exit 0 only once the new version answers its health check (DEV-CONTRACTS §13.4, §18.7).
#
# CI variables (masked, protected): SSH_PRIVATE_KEY, SSH_KNOWN_HOSTS, STAGING_SSH and PRODUCTION_SSH
# (user@host), STAGING_URL and PRODUCTION_URL. The host keeps its secrets in /srv/app/.env, never in
# git; ops/config/<env>.env.example lists the keys.
set -eu

env="${1:?usage: ops/deploy.sh <staging|production> <sha>}"
sha="${2:?usage: ops/deploy.sh <staging|production> <sha>}"
case "$env" in
  staging) host="${STAGING_SSH:?set STAGING_SSH (user@host)}"; url="${STAGING_URL:-}" ;;
  production) host="${PRODUCTION_SSH:?set PRODUCTION_SSH (user@host)}"; url="${PRODUCTION_URL:-}" ;;
  *) echo "deploy: unknown environment '$env' (staging or production)" >&2; exit 2 ;;
esac
image="${IMAGE:-${CI_REGISTRY_IMAGE:?set IMAGE or CI_REGISTRY_IMAGE}}"
dir="${DEPLOY_DIR:-/srv/app}"

mkdir -p ~/.ssh && chmod 700 ~/.ssh
printf '%s\n' "${SSH_PRIVATE_KEY:?set SSH_PRIVATE_KEY}" > ~/.ssh/id_deploy && chmod 600 ~/.ssh/id_deploy
printf '%s\n' "${SSH_KNOWN_HOSTS:?set SSH_KNOWN_HOSTS — never skip host key checking}" > ~/.ssh/known_hosts
ssh_() { ssh -i ~/.ssh/id_deploy -o BatchMode=yes "$host" "$@"; }

# The new version runs its migrations as it starts (compose.prod.yaml), so the copy is taken first.
# DB_SNAPSHOT unset: no database, or none to protect, and nothing runs.
if [ -n "${DB_SNAPSHOT:-}" ]; then sh ops/snapshot.sh "$env" "$sha"; fi

scp -i ~/.ssh/id_deploy -o BatchMode=yes ops/compose.prod.yaml "$host:$dir/compose.yaml"
if [ -n "${CI_REGISTRY_PASSWORD:-}" ]; then
  printf '%s' "$CI_REGISTRY_PASSWORD" | ssh_ "docker login -u '$CI_REGISTRY_USER' --password-stdin '$CI_REGISTRY'"
fi
ssh_ "cd '$dir' && IMAGE='$image' TAG='$sha' docker compose pull && IMAGE='$image' TAG='$sha' docker compose up -d --wait"

if [ -n "$url" ]; then
  i=0
  until wget -q -O /dev/null "$url/readyz"; do
    i=$((i + 1))
    [ "$i" -ge 30 ] && { echo "deploy: $url/readyz did not answer after 60 s — roll back with ops/deploy.sh $env <previous sha>" >&2; exit 1; }
    sleep 2
  done
fi
echo "deploy: $env now runs $image:$sha"

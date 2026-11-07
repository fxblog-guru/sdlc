#!/usr/bin/env sh
# ops/snapshot.sh <staging|production> <sha> — take a restorable copy of the database before a
# deploy migrates it (DEV-CONTRACTS §7, §13.4).
#
# ops/deploy.sh calls it before the new version starts, when DB_SNAPSHOT names how this host takes
# one; with DB_SNAPSHOT unset nothing runs, so a product with no database pays nothing. Staging runs
# first in the pipeline, so the snapshot and the migration are rehearsed there before production.
# The name carries the environment and the SHA, so `## Rollout and rollback` can say which copy a
# restore uses. Keep the one this host has and delete the rest; add a case for another host.
#
#   DB_SNAPSHOT=neon      neonctl branches create (NEON_PROJECT_ID, NEON_API_KEY; the parent is the env's branch)
#   DB_SNAPSHOT=rds       aws rds create-db-snapshot (RDS_INSTANCE_<ENV>, AWS credentials through OIDC)
#   DB_SNAPSHOT=cloudsql  gcloud sql backups create (CLOUDSQL_INSTANCE_<ENV>)
#   DB_SNAPSHOT=pg_dump   pg_dump -Fc of DATABASE_URL_<ENV> to SNAPSHOT_DIR (a mounted volume or a bucket sync)
#
# The tool runs on the CI runner: give the deploy job an image that has it (aws, gcloud, pg_dump),
# pinned by digest like the others.
#
# Exit 0 only once the copy exists: a deploy that cannot snapshot does not migrate.
set -eu

env="${1:?usage: ops/snapshot.sh <staging|production> <sha>}"
sha="${2:?usage: ops/snapshot.sh <staging|production> <sha>}"
case "$env" in staging|production) ;; *) echo "snapshot: unknown environment '$env' (staging or production)" >&2; exit 2 ;; esac
name="pre-${env}-$(printf '%s' "$sha" | cut -c1-12)"
ENV_UPPER=$(printf '%s' "$env" | tr '[:lower:]' '[:upper:]')
var() { eval "printf '%s' \"\${$1_${ENV_UPPER}:-}\""; }

case "${DB_SNAPSHOT:-}" in
  neon)
    npx --yes "neonctl@${NEONCTL_VERSION:?pin neonctl to an exact version}" branches create --project-id "${NEON_PROJECT_ID:?set NEON_PROJECT_ID}" \
      --parent "$env" --name "$name" --api-key "${NEON_API_KEY:?set NEON_API_KEY}" ;;
  rds)
    instance=$(var RDS_INSTANCE); [ -n "$instance" ] || { echo "snapshot: set RDS_INSTANCE_${ENV_UPPER}" >&2; exit 2; }
    aws rds create-db-snapshot --db-instance-identifier "$instance" --db-snapshot-identifier "$name"
    aws rds wait db-snapshot-available --db-snapshot-identifier "$name" ;;
  cloudsql)
    instance=$(var CLOUDSQL_INSTANCE); [ -n "$instance" ] || { echo "snapshot: set CLOUDSQL_INSTANCE_${ENV_UPPER}" >&2; exit 2; }
    gcloud sql backups create --instance "$instance" --description "$name" ;;
  pg_dump)
    url=$(var DATABASE_URL); [ -n "$url" ] || { echo "snapshot: set DATABASE_URL_${ENV_UPPER}" >&2; exit 2; }
    dir="${SNAPSHOT_DIR:?set SNAPSHOT_DIR}"; mkdir -p "$dir"
    pg_dump -Fc --no-owner -f "$dir/$name.dump" "$url" ;;
  '') echo "snapshot: DB_SNAPSHOT is not set — nothing to copy"; exit 0 ;;
  *) echo "snapshot: unknown DB_SNAPSHOT '$DB_SNAPSHOT' (neon, rds, cloudsql, pg_dump)" >&2; exit 2 ;;
esac
echo "snapshot: $name taken (${DB_SNAPSHOT}) — record it in the deploy run; restore it, not the down migration, once rows have moved"

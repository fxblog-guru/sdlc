-- name: GetRelease :one
SELECT * FROM release WHERE id = $1;

-- name: ListReleases :many
SELECT * FROM release WHERE project_id = $1 ORDER BY created_at DESC, id LIMIT $2;

-- name: CreateRelease :exec
INSERT INTO release (id, project_id, name) VALUES ($1, $2, $3);

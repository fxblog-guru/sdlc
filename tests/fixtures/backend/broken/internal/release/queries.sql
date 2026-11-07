-- name: GetRelease :one
SELECT * FROM release WHERE id = $1;

-- name: InsertRelease :exec
INSERT INTO release (id, project_id, name) VALUES ($1, $2, $3);

-- name: ReleaseName :one
SELECT name FROM release WHERE id = $1;

-- name: ProjectExists :one
SELECT EXISTS (SELECT 1 FROM project WHERE id = $1);

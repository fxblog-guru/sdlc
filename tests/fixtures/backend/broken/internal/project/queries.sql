-- name: ProjectExists :one
SELECT EXISTS (SELECT 1 FROM project WHERE id = $1);

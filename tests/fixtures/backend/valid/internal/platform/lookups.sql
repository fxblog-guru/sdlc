-- The shared cross-domain lookups: one copy, every package reads it.
-- name: ExistsProject :one
SELECT EXISTS (SELECT 1 FROM project WHERE id = $1);

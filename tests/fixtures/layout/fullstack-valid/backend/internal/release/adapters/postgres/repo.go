package postgres

import (
	"example.com/shop/backend/internal/release/app"
	"example.com/shop/backend/internal/release/domain"
)

// Repo implements app.Repo.
type Repo struct{}

var _ app.Repo = Repo{}

// Get returns one release.
func (Repo) Get(name string) (domain.Release, error) { return domain.Release{Name: name}, nil }

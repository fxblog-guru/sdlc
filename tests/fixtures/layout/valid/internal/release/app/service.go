package app

import "example.com/shop/internal/release/domain"

// Service is the release use cases.
type Service struct{ Repo Repo }

// Get returns one release.
func (s *Service) Get(name string) (domain.Release, error) { return s.Repo.Get(name) }

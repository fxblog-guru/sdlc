package app

import "example.com/shop/internal/release/domain"

// Repo is the port the service needs.
type Repo interface{ Get(name string) (domain.Release, error) }

package domain

import (
	"errors"

	"example.com/shop/internal/platform/apperr"
)

// Release is one release.
type Release struct{ Name string }

// ErrNotFound is returned when no release matches.
var ErrNotFound = &apperr.Error{Code: "release-not-found"}

var errEmpty = errors.New("empty")

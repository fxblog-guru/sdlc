package httpapi

import (
	"errors"
	"net/http"

	"demo/internal/fielderr"
	"demo/internal/release"
)

const (
	TypeValidation      = "/problems/validation"
	TypeReleaseNotFound = "/problems/release-not-found"
	TypeReleaseConflict = "/problems/release-conflict"
	TypeInternal        = "/problems/internal"
)

// problemTable is the one place a status is chosen.
var problemTable = map[string]struct {
	Status int
	Title  string
}{
	TypeValidation:      {Status: http.StatusUnprocessableEntity, Title: "Validation failed"},
	TypeReleaseNotFound: {Status: http.StatusNotFound, Title: "Release not found"},
	TypeReleaseConflict: {Status: http.StatusConflict, Title: "Release in another state"},
	TypeInternal:        {Status: http.StatusInternalServerError, Title: "Internal error"},
}

// toProblem maps a typed domain error to its problem type.
func toProblem(err error) (string, []fielderr.FieldError) {
	var ve *fielderr.Error
	switch {
	case errors.As(err, &ve):
		return TypeValidation, ve.Fields
	case errors.Is(err, release.ErrNotFound):
		return TypeReleaseNotFound, nil
	case errors.Is(err, release.ErrConflict):
		return TypeReleaseConflict, nil
	default:
		return TypeInternal, nil
	}
}

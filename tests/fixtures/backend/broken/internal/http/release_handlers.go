package httpapi

import "net/http"

const TypeReleaseGone = "/problems/release-gone"

// Each line below is one defect problems-check must name.
func releaseError(kind string) error {
	switch kind {
	case "missing":
		return &Error{Status: http.StatusNotFound, Type: TypeReleaseNotFound} // E103: outside the table
	case "missing-again":
		return &Error{Status: http.StatusUnprocessableEntity, Type: TypeReleaseNotFound} // E104: a second status
	case "gone":
		return &Error{Status: http.StatusGone, Type: TypeReleaseGone} // E102: not in the catalogue
	case "dynamic":
		return &Error{Status: http.StatusForbidden, Type: "/problems/" + kind} // E102: built at runtime
	}
	return &Error{Status: http.StatusBadRequest, Type: TypeValidation, Errors: []FieldError{{Field: "name", Code: "too_long"}}} // E107
}

var titles = map[string]string{
	TypeReleaseConflict: "Release In Another State", // E106
}

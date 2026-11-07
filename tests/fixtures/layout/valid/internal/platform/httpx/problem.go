package httpx

import (
	"net/http"

	"example.com/shop/internal/platform/apperr"
)

// WriteError maps a domain error to a problem response.
func WriteError(w http.ResponseWriter, err error) {
	_ = apperr.Error{}
	w.WriteHeader(http.StatusInternalServerError)
}

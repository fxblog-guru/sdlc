// Package fielderr is the one FieldError of this service (DEV-CONTRACTS §13.2, §13.11).
//
// Template: copy to internal/fielderr/ at the first G7 task that validates input, then run
// `go generate ./internal/fielderr` so codes.go holds the contract's FieldError.code enum.
// Every package that refuses a field returns *Error; the HTTP boundary maps it to 422
// `validation` with errors[]. No package declares its own FieldError or its own code constants.
//
// Message style: one full sentence, sentence case, ending in a period, naming the field in
// words and never a number — "The name is too long.", not "name must be at most 100 chars".
// The number goes in Limit, so the client renders it in its own words and limits.yaml stays
// the only place it is written.
package fielderr

//go:generate node ../../dev/scripts/problems-check.mjs --openapi ../../dev/api/<slug>/openapi.yaml --emit-codes go --package fielderr --out codes.go

import "strings"

// FieldError is the contract's FieldError: one refused field.
type FieldError struct {
	Field   string `json:"field"`
	Code    Code   `json:"code"`
	Message string `json:"message"`
	Limit   int    `json:"limit,omitempty"`
}

// Error carries every refused field of one request.
type Error struct {
	Fields []FieldError
}

func (e *Error) Error() string {
	parts := make([]string, 0, len(e.Fields))
	for _, f := range e.Fields {
		parts = append(parts, f.Field+": "+string(f.Code))
	}
	return "invalid: " + strings.Join(parts, ", ")
}

// Add appends a refusal; a nil *Error is a valid empty receiver for collecting.
func (e *Error) Add(field string, code Code, message string, limit int) *Error {
	if e == nil {
		e = &Error{}
	}
	e.Fields = append(e.Fields, FieldError{Field: field, Code: code, Message: message, Limit: limit})
	return e
}

// OrNil returns nil when nothing was refused, so a caller can `return errs.OrNil()` without the
// typed-nil trap (a nil *Error returned as error is not nil).
func (e *Error) OrNil() error {
	if e == nil || len(e.Fields) == 0 {
		return nil
	}
	return e
}

package apperr

// Kind is what a domain error means to a caller.
type Kind int

// Error is a domain error with a kind and a code.
type Error struct {
	Kind Kind
	Code string
}

func (e *Error) Error() string { return e.Code }

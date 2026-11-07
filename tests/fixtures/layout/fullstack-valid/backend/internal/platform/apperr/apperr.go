package apperr

// Error is a domain error.
type Error struct{ Code string }

func (e *Error) Error() string { return e.Code }

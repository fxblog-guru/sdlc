package release

import (
	"context"
	"errors"

	"demo/internal/fielderr"
	"demo/internal/platform/obs"
)

// MaxName is limits.yaml release.name.
const MaxName = 100

// MaxNotes is limits.yaml release.notes.
const MaxNotes = 10000

var (
	ErrNotFound = errors.New("release: not found")
	ErrConflict = errors.New("release: conflict")
)

// NameTooLongMessage names no number: the limit travels in FieldError.limit.
const NameTooLongMessage = "The name is too long."

func validate(name string) error {
	if len([]rune(name)) > MaxName {
		return &fielderr.Error{Fields: []fielderr.FieldError{{Field: "name", Code: fielderr.CodeTooLong, Message: NameTooLongMessage, Limit: MaxName}}}
	}
	return nil
}

func (s *Service) Create(ctx context.Context, name string) error {
	if err := validate(name); err != nil {
		return err
	}
	obs.Event(ctx, "release.release_created", "name_len", len(name))
	s.metrics.created.Inc()
	return nil
}

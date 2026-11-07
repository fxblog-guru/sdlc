// Package testkit holds the helpers every package's tests share.
package testkit

import "testing"

// NewEnv is the one test environment constructor.
func NewEnv(t *testing.T) *Env { t.Helper(); return &Env{} }

type Env struct{}

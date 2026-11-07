package release

import (
	"testing"

	"demo/internal/testkit"
)

func TestValidate(t *testing.T) {
	tests := map[string]struct {
		name    string
		wantErr bool
	}{
		"ok":       {name: "R1"},
		"too long": {name: string(make([]byte, MaxName+1)), wantErr: true},
	}
	_ = testkit.NewEnv(t)
	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			if err := validate(tc.name); (err != nil) != tc.wantErr {
				t.Fatalf("validate(%q) = %v", tc.name, err)
			}
		})
	}
}

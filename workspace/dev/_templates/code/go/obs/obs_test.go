package obs

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func lines(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if l == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(l), &m); err != nil {
			t.Fatalf("not one JSON object per line: %q: %v", l, err)
		}
		out = append(out, m)
	}
	return out
}

func TestEventIsOneStructuredLine(t *testing.T) {
	var buf bytes.Buffer
	Setup(&buf, "svc", "test", "1.2.3", slog.LevelDebug)
	ctx := WithUserID(WithRequestID(context.Background(), "req-12345678"), "u_42")
	Event(ctx, "release.release_created", "release_id", 7, "user_email", "a@b.c", "api-key", "k")

	got := lines(t, &buf)
	if len(got) != 1 {
		t.Fatalf("want one line, got %d", len(got))
	}
	l := got[0]
	for k, want := range map[string]any{"event": "release.release_created", "level": "info", "service": "svc", "env": "test", "version": "1.2.3", "request_id": "req-12345678", "user_id": "u_42", "release_id": float64(7), "user_email": "[REDACTED]", "api-key": "[REDACTED]"} {
		if l[k] != want {
			t.Errorf("%s = %v, want %v", k, l[k], want)
		}
	}
	if _, ok := l["timestamp"]; !ok {
		t.Error("no timestamp")
	}
}

func TestEventUsesItsCataloguedLevel(t *testing.T) {
	var buf bytes.Buffer
	Setup(&buf, "svc", "test", "1", slog.LevelWarn)
	levels["release.publish_failed"] = slog.LevelError
	defer delete(levels, "release.publish_failed")
	Event(context.Background(), "release.release_created") // info: below the threshold
	Event(context.Background(), "release.publish_failed")
	got := lines(t, &buf)
	if len(got) != 1 || got[0]["level"] != "error" {
		t.Fatalf("want only the error line, got %v", got)
	}
}

func TestRequestsEchoesTheIDAndLogsTheRouteTemplate(t *testing.T) {
	var buf bytes.Buffer
	Setup(&buf, "svc", "test", "1", slog.LevelInfo)
	shutdown, err := StartTracing(context.Background(), "svc", "1")
	if err != nil {
		t.Fatal(err)
	}
	defer shutdown(context.Background())

	mux := http.NewServeMux()
	var traceInHandler string
	mux.HandleFunc("GET /releases/{id}", func(w http.ResponseWriter, r *http.Request) {
		if traceInHandler == "" {
			traceInHandler = TraceID(r.Context())
		}
		w.WriteHeader(http.StatusNotFound)
	})
	srv := Requests(mux)

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest("GET", "/releases/123", nil))
	id := rec.Header().Get(RequestIDHeader)
	if len(id) != 32 {
		t.Fatalf("minted id %q", id)
	}

	rec2 := httptest.NewRecorder()
	in := httptest.NewRequest("GET", "/releases/9", nil)
	in.Header.Set(RequestIDHeader, "bad id\nforged")
	srv.ServeHTTP(rec2, in)
	if got := rec2.Header().Get(RequestIDHeader); got == "bad id\nforged" || len(got) != 32 {
		t.Fatalf("an unsafe inbound id was kept: %q", got)
	}

	l := lines(t, &buf)[0]
	for k, want := range map[string]any{"event": "http.request_completed", "http.route": "/releases/{id}", "http.response.status_code": float64(404), "http.request.method": "GET", "request_id": id} {
		if l[k] != want {
			t.Errorf("%s = %v, want %v", k, l[k], want)
		}
	}
	if l["trace_id"] == nil || l["trace_id"] != traceInHandler || traceInHandler == "" {
		t.Errorf("trace_id %v does not match the handler's %q", l["trace_id"], traceInHandler)
	}
}

func TestATraceparentIsContinued(t *testing.T) {
	var buf bytes.Buffer
	Setup(&buf, "svc", "test", "1", slog.LevelInfo)
	shutdown, _ := StartTracing(context.Background(), "svc", "1")
	defer shutdown(context.Background())
	srv := Requests(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	srv.ServeHTTP(httptest.NewRecorder(), req)
	if got := lines(t, &buf)[0]["trace_id"]; got != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Fatalf("trace_id %v: the caller's trace was not continued", got)
	}
}

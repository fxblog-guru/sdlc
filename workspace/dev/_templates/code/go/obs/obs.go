// Package obs is the one logging API of this service, and its seam to traces and metrics
// (DEV-CONTRACTS §13.5, §13.11).
//
// Template: copy to internal/platform/obs/ at the first G7 task, then rename the `app_` metric
// prefix in metrics.go to DEV-PROFILE `Metric prefix`. Code writes
//
//	obs.Event(ctx, "release.release_created", "release_id", id)
//
// and nothing else: no slog.Info, no log.Printf, no fmt.Println beside it (obs-check E116). Each
// call is one JSON line on stdout with timestamp, level, service, env, version, trace_id, span_id,
// request_id, user_id, event and the typed fields. The OpenTelemetry Collector (ops/otel/) ships
// those lines to whichever backend the environment names, so the code never names a vendor.
package obs

import (
	"context"
	"io"
	"log/slog"
	"strings"

	"go.opentelemetry.io/otel/trace"
)

// levels holds each catalogued event's one level (observability.md ## Log events). An event not
// listed is info. obs-check reads this table and fails a level the catalogue disagrees with.
var levels = map[string]slog.Level{
	"http.request_completed": slog.LevelInfo,
}

// Event writes one event at its catalogued level. The name is a literal from the catalogue,
// never built at runtime (obs-check E115).
func Event(ctx context.Context, name string, fields ...any) {
	lvl, ok := levels[name]
	if !ok {
		lvl = slog.LevelInfo
	}
	slog.Default().Log(ctx, lvl, name, fields...)
}

// Err is the field an error travels in: its message, never a stack or a request body.
func Err(err error) slog.Attr {
	if err == nil {
		return slog.String("error", "")
	}
	return slog.String("error", err.Error())
}

type ctxKey int

const (
	requestIDKey ctxKey = iota
	userIDKey
)

// WithRequestID carries the request id; Requests sets it, a job or consumer sets its own.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

// RequestID is the id Requests echoed in X-Request-Id, or "".
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

// WithUserID carries the pseudonymous user id (§13.5): an opaque id, never an email or a name.
func WithUserID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, userIDKey, id)
}

// TraceID is the current trace id, for the error response the runbook asks a user to quote.
func TraceID(ctx context.Context) string {
	if sc := trace.SpanContextFromContext(ctx); sc.HasTraceID() {
		return sc.TraceID().String()
	}
	return ""
}

// Setup installs the JSON handler as slog's default. Call it once in main, before anything logs.
func Setup(w io.Writer, service, env, version string, level slog.Level) *slog.Logger {
	h := slog.NewJSONHandler(w, &slog.HandlerOptions{Level: level, ReplaceAttr: replace})
	l := slog.New(ctxHandler{h}).With("service", service, "env", env, "version", version)
	slog.SetDefault(l)
	return l
}

// ParseLevel reads LOG_LEVEL (debug, info, warn, error); anything else is info.
func ParseLevel(s string) slog.Level {
	var l slog.Level
	if err := l.UnmarshalText([]byte(s)); err != nil {
		return slog.LevelInfo
	}
	return l
}

// sensitive names a field whose value never reaches a log line (§12.5, §13.5). A match anywhere
// in the key counts: `user_email`, `X-Api-Key`, `refresh_token`.
var sensitive = []string{"password", "passwd", "secret", "token", "authorization", "cookie", "api_key", "apikey", "email", "phone", "card", "ssn"}

func replace(groups []string, a slog.Attr) slog.Attr {
	if len(groups) == 0 {
		switch a.Key {
		case slog.TimeKey:
			a.Key = "timestamp"
			return a
		case slog.MessageKey:
			a.Key = "event"
			return a
		case slog.LevelKey:
			return slog.String("level", strings.ToLower(a.Value.String()))
		}
	}
	k := strings.ToLower(strings.ReplaceAll(a.Key, "-", "_"))
	for _, s := range sensitive {
		if strings.Contains(k, s) {
			return slog.String(a.Key, "[REDACTED]")
		}
	}
	return a
}

// ctxHandler adds the ids the context carries to every record, so no call site passes them.
type ctxHandler struct{ slog.Handler }

func (h ctxHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		r.AddAttrs(slog.String("trace_id", sc.TraceID().String()), slog.String("span_id", sc.SpanID().String()))
	}
	if id := RequestID(ctx); id != "" {
		r.AddAttrs(slog.String("request_id", id))
	}
	if id, _ := ctx.Value(userIDKey).(string); id != "" {
		r.AddAttrs(slog.String("user_id", id))
	}
	return h.Handler.Handle(ctx, r)
}

func (h ctxHandler) WithAttrs(as []slog.Attr) slog.Handler { return ctxHandler{h.Handler.WithAttrs(as)} }
func (h ctxHandler) WithGroup(name string) slog.Handler    { return ctxHandler{h.Handler.WithGroup(name)} }

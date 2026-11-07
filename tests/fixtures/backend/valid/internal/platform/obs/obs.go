package obs

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Event is the one logging API: one JSON line whose message is the event name.
func Event(ctx context.Context, name string, fields ...any) {
	slog.Default().Log(ctx, slog.LevelInfo, name, fields...)
}

var (
	releaseCreated = prometheus.NewCounter(prometheus.CounterOpts{Name: "demo_release_created_total", Help: "Releases created."})
	requestSeconds = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "demo_http_request_duration_seconds",
		Help: "Request duration.",
	}, []string{"route", "method", "status_class"})
)

// Requests writes one line per request and echoes the request id.
func Requests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		id := r.Header.Get("X-Request-Id")
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r)
		Event(r.Context(), "http.request_completed", "http.request.method", r.Method, "duration_ms", time.Since(start).Milliseconds())
	})
}

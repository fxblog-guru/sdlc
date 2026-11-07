package obs

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// RequestIDHeader is echoed on every response, so a user's report and the log line meet (§13.5).
const RequestIDHeader = "X-Request-Id"

// An inbound id is kept only when it is short and plain; anything else is replaced, so a caller
// cannot write arbitrary text into the logs.
var validID = regexp.MustCompile(`^[A-Za-z0-9._-]{8,64}$`)

// Requests wraps the router. It continues the caller's trace (W3C traceparent) or starts one,
// takes or mints the request id, echoes it in X-Request-Id, and writes http.request_completed
// once per request with the OTel HTTP attributes. The route is the matched template
// ("/releases/{id}"), never the raw path: a raw path is unbounded cardinality (§13.5).
func Requests(next http.Handler) http.Handler {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		id := r.Header.Get(RequestIDHeader)
		if !validID.MatchString(id) {
			id = newID()
		}
		w.Header().Set(RequestIDHeader, id)
		req := r.WithContext(WithRequestID(r.Context(), id))
		rec := &recorder{ResponseWriter: w, code: http.StatusOK}
		next.ServeHTTP(rec, req)

		route := Route(req)
		span := trace.SpanFromContext(req.Context())
		span.SetName(r.Method + " " + route)
		span.SetAttributes(attribute.String("http.route", route), attribute.String("request_id", id))
		elapsed := time.Since(start)
		requestSeconds.WithLabelValues(route, r.Method, statusClass(rec.code)).Observe(elapsed.Seconds())
		Event(req.Context(), "http.request_completed",
			"http.request.method", r.Method,
			"http.route", route,
			"http.response.status_code", rec.code,
			"url.scheme", scheme(r),
			"server.address", r.Host,
			"duration_ms", elapsed.Milliseconds(),
		)
	})
	return otelhttp.NewHandler(inner, "http.server")
}

// Route is the pattern http.ServeMux matched, without its method. Another router: replace this
// with its matched template (chi: chi.RouteContext(r.Context()).RoutePattern()).
func Route(r *http.Request) string {
	p := r.Pattern
	if i := strings.IndexByte(p, ' '); i >= 0 {
		p = p[i+1:]
	}
	if p == "" {
		return "unmatched"
	}
	return p
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func statusClass(code int) string { return strconv.Itoa(code/100) + "xx" }

func scheme(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}
	return "http"
}

type recorder struct {
	http.ResponseWriter
	code    int
	written bool
}

func (r *recorder) WriteHeader(code int) {
	if !r.written {
		r.code, r.written = code, true
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *recorder) Write(b []byte) (int, error) {
	r.written = true
	return r.ResponseWriter.Write(b)
}

// Unwrap lets http.ResponseController reach Flush and Hijack on the real writer.
func (r *recorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

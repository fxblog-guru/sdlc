package obs

import (
	"context"
	"net/http"
	"os"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// requestSeconds is RED for every route: its count is the rate, its 5xx share the errors, its
// buckets the p50/p95/p99. Rename app_ to DEV-PROFILE `Metric prefix`; the name must be the one
// in observability.md ## Metrics.
var requestSeconds = prometheus.NewHistogramVec(prometheus.HistogramOpts{
	Name:    "app_http_request_duration_seconds",
	Help:    "HTTP request duration, by matched route.",
	Buckets: prometheus.DefBuckets,
}, []string{"route", "method", "status_class"})

func init() { prometheus.MustRegister(requestSeconds) }

// Metrics serves /metrics for Prometheus, or for the collector's prometheus receiver.
func Metrics() http.Handler { return promhttp.Handler() }

// StartTracing installs the tracer provider and the W3C propagator. Spans are always made, so a
// trace id is in every log line and error response; they are exported only when the standard
// OTEL_EXPORTER_OTLP_ENDPOINT (or _TRACES_ENDPOINT) names a collector. Sampling follows
// OTEL_TRACES_SAMPLER. Call the returned func on shutdown to flush what is buffered.
func StartTracing(ctx context.Context, service, version string) (func(context.Context) error, error) {
	opts := []sdktrace.TracerProviderOption{sdktrace.WithResource(resource.NewSchemaless(
		attribute.String("service.name", service),
		attribute.String("service.version", version),
	))}
	if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") != "" || os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") != "" {
		exp, err := otlptracehttp.New(ctx)
		if err != nil {
			return nil, err
		}
		opts = append(opts, sdktrace.WithBatcher(exp))
	}
	tp := sdktrace.NewTracerProvider(opts...)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	return tp.Shutdown, nil
}

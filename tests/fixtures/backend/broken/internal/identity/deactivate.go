package identity

import (
	"context"
	"log/slog"

	"demo/internal/platform/obs"

	"github.com/prometheus/client_golang/prometheus"
)

var signins = prometheus.NewCounter(prometheus.CounterOpts{Name: "signins", Help: "no prefix, no _total"})

func setActive(ctx context.Context, verb string) {
	obs.Event(ctx, "account."+verb+"d")         // E115: built at runtime
	slog.InfoContext(ctx, "account.sign_in_done") // E116: a second logging path
	obs.Event(ctx, "account.signin_ok")           // E114: not in the catalogue
}

package http

import (
	"net/http"

	"example.com/shop/backend/internal/platform/httpx"
	"example.com/shop/backend/internal/release/app"
)

// Routes mounts the release handlers.
func Routes(mux *http.ServeMux, svc *app.Service) {
	mux.HandleFunc("/v1/releases", func(w http.ResponseWriter, r *http.Request) {
		if _, err := svc.Get(r.URL.Query().Get("name")); err != nil {
			httpx.WriteError(w, err)
		}
	})
}

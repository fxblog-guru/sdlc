package server

import (
	"net/http"

	releasehttp "example.com/shop/backend/internal/release/adapters/http"
	"example.com/shop/backend/internal/release/adapters/postgres"
	"example.com/shop/backend/internal/release/app"
)

// Run builds the graph and serves.
func Run() {
	mux := http.NewServeMux()
	releasehttp.Routes(mux, &app.Service{Repo: postgres.Repo{}})
}

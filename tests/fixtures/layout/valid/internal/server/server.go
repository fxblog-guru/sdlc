package server

import (
	"net/http"

	"example.com/shop/internal/release/adapters/postgres"
	releasehttp "example.com/shop/internal/release/adapters/http"
	"example.com/shop/internal/release/app"
)

// Run builds the graph and serves.
func Run() {
	mux := http.NewServeMux()
	releasehttp.Routes(mux, &app.Service{Repo: postgres.Repo{}})
}

package config

// Load reads every key .env.example declares, and nothing else.
func Load(getenv func(string) string) Config {
	return Config{
		DatabaseURL: getenv("DEMO_DATABASE_URL"),
		HTTPAddr:    getenv("DEMO_HTTP_ADDR"),
		LogLevel:    getenv("DEMO_LOG_LEVEL"),
	}
}

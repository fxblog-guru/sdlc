# <product name>

<One sentence: what it does and for whom.>

## Run it

You need Docker, [Task](https://taskfile.dev) and the toolchain in `.nvmrc` / `go.mod`.

```sh
git clone <repository URL> && cd <repository>
task setup        # dependencies, .env from .env.example, git hooks
task dev          # the app on http://localhost:3000, database in Docker
task seed         # invented demo data only
task check:fast   # lint, types and unit tests, under 2 minutes
```

`task check` is the whole gate CI runs. How it is built: [ARCHITECTURE.md](ARCHITECTURE.md). What
changed: [CHANGELOG.md](CHANGELOG.md).

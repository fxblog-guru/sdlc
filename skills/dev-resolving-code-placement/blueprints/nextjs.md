# Blueprint: nextjs

A Next.js App Router application whose server code lives in the same repository: server
components, route handlers and server actions over a domain layer and a database. If there is a
separate API in another language, the API repository gets its own blueprint, and this repository
holds only the Next.js half.

## Standards it follows

| Area | Standard | What it decides here |
|---|---|---|
| Routing | [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure) (official) | `src/app/` holds routes only: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`. Route groups `(group)` and private folders `_x` keep it tidy |
| Features | [bulletproof-react project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | `src/features/<feature>/` owns the feature's components, actions and queries; `app/` composes |
| Naming | [Airbnb React/JSX naming](https://github.com/airbnb/javascript/tree/master/react#naming), [typescript-eslint naming-convention](https://typescript-eslint.io/rules/naming-convention/) | `PascalCase.tsx` components, `camelCase.ts` modules, kebab-case route segments |
| Server code | [Ports and adapters](https://alistair.cockburn.us/hexagonal-architecture/), applied to `src/server/` | `domain` → `app` → `adapters`; nothing under `server/` imports React |
| Server-only boundary | [`server-only`](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning) | every module in `src/server/` starts with `import 'server-only'` |
| Shared parts | `README.md` §What every blueprint shares | — |

## The tree

```
.
├── src/
│   ├── app/                       routes only, and thin: read params, call a feature, render
│   │   ├── (marketing)/  (app)/   route groups, one layout each (the shells in docs/ui-patterns.md)
│   │   ├── api/<resource>/route.ts   public HTTP endpoints only; the UI uses server actions
│   │   └── layout.tsx  error.tsx  not-found.tsx
│   ├── features/<feature>/
│   │   ├── components/            this feature's components (server or 'use client', said at the top)
│   │   ├── actions.ts             'use server' actions: validate, call server/<domain>/app, revalidate
│   │   ├── queries.ts             server-side reads for this feature's pages
│   │   └── index.ts
│   ├── server/                    import 'server-only' in every file
│   │   ├── <domain>/{domain,app,adapters/{db,http}}/
│   │   └── platform/{errors,config,db,obs,auth}/   errors.ts is the one RFC 9457 mapper for route handlers
│   ├── components/{ui,layouts}/   the design-system kit and the shells
│   ├── hooks/  lib/  config/  types/  styles/
├── public/
├── migrations/  or  prisma/  or  drizzle/   whichever the profile's migration tool owns, nothing else
├── tests/{integration,e2e,contract,perf,fixtures}/
├── deploy/{docker,compose,helm|terraform}/
├── ops/{runbooks,observability}/
├── scripts/  docs/  dev/  ci/
├── README.md  CONTRIBUTING.md  Makefile  .editorconfig  .env.example  CODEOWNERS
├── package.json  next.config.ts  tsconfig.json  eslint.config.mjs
```

## Rules beyond the shared ones

1. `src/app/**` never imports `src/server/**/adapters`. Routes call into a feature, and the
   feature calls into `server/<domain>/app`.
2. `src/server/**` never imports `src/app`, `src/features` or `src/components`. The server knows
   nothing about React.
3. `src/features/<a>` never imports `src/features/<b>`.

## Rules

```json
{
  "name": "nextjs",
  "requiredDirs": ["src/app", "src/features", "src/server", "src/components", "tests", "deploy", "ops", "docs", "dev"],
  "requiredFiles": ["README.md", "CONTRIBUTING.md", ["Makefile", "Taskfile.yml"], ".editorconfig", ".env.example", ["CODEOWNERS", ".gitlab/CODEOWNERS", "docs/CODEOWNERS"], "package.json"],
  "codeRoots": ["src", "public", "migrations", "prisma", "drizzle", "tests", "deploy", "scripts", "ci", "dev"],
  "rootCode": ["next.config.ts", "next.config.mjs", "next.config.js", "eslint.config.mjs", "eslint.config.js", "postcss.config.mjs", "postcss.config.js", "tailwind.config.ts", "vitest.config.ts", "playwright.config.ts", "middleware.ts", "instrumentation.ts", "next-env.d.ts", "drizzle.config.ts"],
  "tests": {
    "root": "tests",
    "tiers": ["integration", "e2e", "contract", "perf", "fixtures"],
    "rootFiles": ["README.md"],
    "placement": [
      { "name": "\\.spec\\.ts$", "under": ["tests/e2e/"], "why": "Playwright journeys live in tests/e2e/" },
      { "name": "\\.integration\\.test\\.tsx?$", "under": ["tests/integration/"], "why": "integration tests live in tests/integration/" }
    ]
  },
  "packageCeiling": 40,
  "alias": { "@/": "src/" },
  "imports": [
    { "lang": "ts", "from": "src/app/**", "deny": ["src/server/*/adapters/**"], "why": "routes go through a feature and the app layer, never straight to an adapter" },
    { "lang": "ts", "from": "src/server/**", "deny": ["src/app/**", "src/features/**", "src/components/**", "react", "react-dom"], "why": "server code knows nothing about React" },
    { "lang": "ts", "from": "src/server/{d}/domain/**", "deny": ["src/server/*/app/**", "src/server/*/adapters/**", "next", "next/**"], "why": "domain imports no layer above it and no framework" },
    { "lang": "ts", "from": "src/features/{f}/**", "deny": ["src/features/!{f}/**", "src/app/**"], "why": "features never import each other; app/ composes them" },
    { "lang": "ts", "from": "src/components/**", "deny": ["src/features/**", "src/app/**"], "why": "shared code never imports a feature" }
  ]
}
```

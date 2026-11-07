# Blueprint: ai-app (preview)

An application whose behaviour depends on a model: prompts, retrieval, tools, an eval set. The
prompt, the model id and the eval set are versioned artifacts, reviewed like code. `preview` until
proven on rag-reference-guide or recall's AI layer. Design rules are
`dev-brainstorming-architecture/ai-features.md`; the pack's verify, release and operate parts are
`dev-packaging-release/ai-app.md`. The app's HTTP side uses a web blueprint beside this one.

## Standards it follows

| Area | Standard | What it decides here |
|---|---|---|
| Threats | [OWASP Top 10 for LLM applications](https://genai.owasp.org/llm-top-10/) | injection, data leakage, excessive agency: each has a control |
| Evaluation | an eval set of at least 30 labelled cases (G8 row 26) | a prompt or model change ships only with its eval result |
| Versioning | prompts in files, the model id pinned in config | no prompt text inline in code |
| Shared parts | `README.md` §What every blueprint shares | — |

## The tree

```
.
├── src/<pkg>/
│   ├── llm/          the one client: model id, timeouts, retries, caps, fallback
│   ├── prompts/      one file per prompt, versioned; loaded, never built by string concatenation
│   ├── retrieval/    chunking, embedding, search; returns its sources with every passage
│   ├── tools/        the tools the model may call, each with an allow-list
│   └── app/          features that call llm/, retrieval/, tools/
├── evals/{cases,results}/   labelled cases (≥ 30) and each run's scores, by prompt and model version
├── tests/{unit,integration,fixtures}/
├── docs/  dev/
```

## Rules beyond the shared ones

1. Only `llm/` calls the provider SDK. Everything else goes through it, so caps and fallback hold.
2. `app/` holds no prompt text; it loads prompts from `prompts/`.

## Rules

```json
{
  "name": "ai-app",
  "requiredDirs": ["evals", "tests", "docs", "dev"],
  "requiredFiles": ["README.md", ["pyproject.toml", "package.json"]],
  "codeRoots": ["src", "evals", "tests", "scripts", "deploy", "dev"],
  "rootCode": ["setup.py", "noxfile.py"],
  "tests": { "root": "tests", "tiers": ["unit", "integration", "fixtures"], "rootFiles": ["README.md", "conftest.py"], "placement": [] },
  "packageCeiling": 40,
  "imports": [
    { "lang": "python", "from": "src/*/app/**", "deny": ["anthropic", "openai", "google.genai"], "why": "only llm/ calls a provider SDK, so caps and fallback always apply" },
    { "lang": "ts", "from": "src/app/**", "deny": ["@anthropic-ai/sdk", "openai"], "why": "only llm/ calls a provider SDK, so caps and fallback always apply" }
  ]
}
```

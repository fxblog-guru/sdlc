# release-packet.md (excerpt) — rag-reference-guide 0.4 (ai)

## Release

Model `claude-sonnet-5-5` pinned in config. Prompt `answer.v4` replaces v3: eval 34/40 → 37/40 on `evals/cases` (results in `evals/results/0.4.json`). Caps: 4,000 output tokens per call, 20,000 calls a day. Logs keep the prompt version and token counts, not the prompt text.

# CI/CD pipeline design (G10)

Read this when the change adds or changes the pipeline, a build, a deploy job or a release step.
The G10 checklist row 29 cites this file; `delivery.md` covers the cloud side. A junior pipeline
runs the tests. A principal pipeline is fast enough that nobody skips it, proves what it ships, and
cannot leak the credentials it uses.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Fast feedback first | Lint and unit tests in minutes, before slow stages; a slow pipeline gets bypassed | — |
| 2 | Build once, promote the digest | What was tested is what ships (`sre-principles.md`) | — |
| 3 | The pipeline is code, reviewed like code | A pipeline change can ship anything | — |
| 4 | Short-lived credentials | OIDC to the cloud from the job, not a long-lived key in a variable | A platform with no OIDC: a scoped, rotated token |
| 5 | Pin actions, images and tools | A moved tag runs someone else's code in your pipeline | — |
| 6 | Protected branches and environments | Production deploys need the protected branch and an approver | — |
| 7 | Every gate is a required check | An optional check is a check nobody looks at | — |
| 8 | Reproducible builds | Lockfiles and pinned toolchains: the same commit builds the same artifact | — |
| 9 | Provenance and SBOM | You can say what is in the artifact and where it came from | Internal throwaway tools |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| Trunk-based · release branches | Continuous delivery, small changes | Several supported versions at once |
| One pipeline · per-component pipelines | A monorepo with one deploy | Components that release on their own clock |
| Hosted runners · self-hosted | Default | Cost, network access or hardware need it; then patch and isolate them |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| Cloud keys in CI variables | A long-lived access key where OIDC is available |
| `image: node:latest`, `uses: action@main` | Unpinned images, actions or tools |
| Deploy from any branch | Production deploy job with no branch or environment protection |
| Tests allowed to fail | `allow_failure: true` or `continue-on-error` on a gate |

G10 fails a pipeline that commits one of these.

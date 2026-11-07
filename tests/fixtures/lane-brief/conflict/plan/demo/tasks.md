---
slug: demo
stage: plan
artifact: tasks
status: draft
---

## Tasks

| Id | Task | REQ | Stack | Files | Depends on | Test | Estimate | Status |
|---|---|---|---|---|---|---|---|---|
| TASK-001 | Platform config | REQ-001 | nextjs | src/config/site.ts · scripts/eslint/no-soft-link.mjs | none | site.test.ts | S | todo |
| TASK-002 | Card component | REQ-001 | react | src/components/ui/post-card.tsx · src/components/ui/post-card.test.tsx | TASK-001 | post-card.test.tsx | S | todo |
| TASK-003 | Read model | REQ-002 | nextjs | src/server/posts/app/{list,get}.ts · src/server/posts/app/list.test.ts | TASK-001 | list.test.ts | M | todo |
| TASK-004 | Home page | REQ-002 | nextjs | src/app/(site)/page.tsx · src/features/reading/components/home-feed.tsx · src/components/ui/post-card.tsx | TASK-002, TASK-003 | home-feed.test.tsx | M | todo |
| TASK-005 | Post page | REQ-003 | nextjs | src/features/reading/components/post-view.tsx · tests/integration/platform/not-found.integration.test.ts | TASK-004 | post-view.test.tsx | M | todo |
| TASK-006 | Ops scripts | REQ-004 | sql | scripts/db-guard.mjs · Taskfile.yml | none | db-guard.test.mjs | S | todo |
| TASK-007 | Later slice | REQ-005 | nextjs | src/server/seo/app/sitemap.ts | TASK-003 | sitemap.test.ts | S | todo |

## Sequence

**Slices run in order.** Each lane owns a disjoint set of files (§5.5):

| Lane | Owns |
|---|---|
| `platform` | `src/config/**`, `scripts/eslint/**`, `src/proxy.ts` |
| `ops` | `Taskfile.yml`, `scripts/**` other than `scripts/eslint/**` |
| `web` | `src/components/**`, `src/lib/**` |
| `content` | `src/server/{posts,seo}/**`, `src/features/reading/**` UI in `(site)` |

A file that two lanes need belongs to one of them. `src/proxy.ts` belongs to `platform`. `tests/integration/platform/not-found.integration.test.ts` is written only by TASK-005 (`content`).

| Slice | Name | Tasks, by lane |
|---|---|---|
| 1 | Skeleton | platform: TASK-001 · ops: TASK-006 · web: TASK-002 |
| 2 | Reading | content: TASK-003, TASK-004, TASK-005 |
| 3 | SEO | content: TASK-007 |

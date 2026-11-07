---
slug: demo
stage: ui
artifact: ui-spec
status: draft
authored_by: dev-specifying-ui
reviewed_by: pending
tracker: none
created: 2026-10-14
updated: 2026-10-14
requirements: [REQ-001]
---

## Screens

| Screen | Route | REQs | Roles | Entry points | Pattern |
|---|---|---|---|---|---|
| S01 Releases | `/releases` | REQ-001 | Viewer, Member | sidebar | `shell.sidebar` · `list` |
| S02 Release | `/releases/:id` | REQ-001 | Viewer, Member | S01 row | `shell.sidebar` · `detail` |

### Roles matrix

| Screen | Action | Operation | Viewer | Member |
|---|---|---|---|---|
| S01 Releases | view the list | `listReleases` | enabled | enabled |
| S01 Releases | New release | `createRelease` | hidden | enabled |
| S02 Release | view | `getRelease` | read-only | enabled |
| S02 Release | Delete | `deleteRelease` | hidden | disabled (needs Admin) |

## User flows

Open S01, pick a row, read S02; Back returns to S01 with its filters in the URL.

## States

| Screen | Loading | Empty | No results | Error | Partial / stale | No permission | Offline | Long text / missing data | Populated |
|---|---|---|---|---|---|---|---|---|---|
| S01 Releases | table skeleton, 5 rows | "No releases yet" and New release | "No release matches" and Clear filters | 5xx or 10 s timeout: notice, Try again | last page greyed with a stale notice | R-403 panel | banner, list kept | name truncates with title; no date shows "—" | the table |
| S02 Release | detail skeleton | N/A — the route needs an existing release; a missing one is 404 | N/A — the screen has no filter | 5xx or 10 s timeout: notice, Try again | sections load independently | R-403 panel | banner, read-only | notes wrap; no owner shows "Unassigned" | the record |

## Components

| Screen | Component | From kit | Variant | Notes |
|---|---|---|---|---|
| S01 | DataTable | yes | default | server sort |

### Traceability

| Screen | Component | Operation | Ids |
|---|---|---|---|
| S01 Releases | DataTable, Pager | `listReleases` | AC-001, UB-001 |
| S02 Release | Card, Dialog | `getRelease`, `deleteRelease` | AC-001 |

## Design tokens

Every value cites a token from docs/design-tokens.md.

## Lists and tables

| List | Endpoint | Pagination | Page size | Sortable columns | Filters | Small-screen behaviour |
|---|---|---|---|---|---|---|
| S01 | `listReleases` | cursor | 20 | name | status | cards |

## Forms

N/A — this fixture has no form.

## Interaction and feedback

| Id | Screen | Roles | Trigger | Expected |
|---|---|---|---|---|
| UB-001 | S01 | Member | Back from S02 | S01 with the same filters and page |

## Accessibility

Page h1 per screen; the table has a caption; focus returns to the row link on Back.

## Responsive behaviour

| Breakpoint | Shell | Lists and tables | Dialogs and forms | Media |
|---|---|---|---|---|
| `bp.sm` | drawer | cards | full-screen sheet | none |
| `bp.md` | icon rail | priority columns | centred dialog | none |
| `bp.lg` | sidebar | full table | centred dialog | none |

## Copy

Keys under releases.list.* in copy/en.ts.

## Test hooks

Role and name selectors; `data-testid="release-row"` on each row.

## Open questions

None.

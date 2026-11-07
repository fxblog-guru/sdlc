# Architecture

The shape of the system at C4 levels 1 and 2. The reasoning, the alternatives and every decision are
in `.sdlc/design/` and `.sdlc/design/adr/`; this page only draws the boxes and links there.

## System context (C4 level 1)

```mermaid
C4Context
  title System context — <product name>
  Person(user, "<user role>", "<what they do with it>")
  System(app, "<product name>", "<one line>")
  System_Ext(ext, "<external system>", "<what it provides>")
  Rel(user, app, "uses", "HTTPS")
  Rel(app, ext, "<reads / sends>", "<protocol>")
```

## Containers (C4 level 2)

```mermaid
C4Container
  title Containers — <product name>
  Person(user, "<user role>")
  System_Boundary(b, "<product name>") {
    Container(web, "Web app", "<React / Next.js>", "<what it renders>")
    Container(api, "API", "<Go / Python>", "<what it serves>")
    ContainerDb(db, "Database", "<PostgreSQL 16>", "<what it stores>")
  }
  Rel(user, web, "uses", "HTTPS")
  Rel(web, api, "calls", "JSON/HTTPS")
  Rel(api, db, "reads and writes", "SQL")
```

## Where to read more

| Question | Document |
|---|---|
| Why this shape | `.sdlc/design/<slug>/architecture.md` |
| A specific decision | `.sdlc/design/adr/` |
| The data | `.sdlc/data/<slug>/data-model.md` |
| The API | `.sdlc/api/<slug>/openapi.yaml` |

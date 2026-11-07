# Errors at one boundary — the status table and the mapper (§13.2, §13.11)

`api/<slug>/problems.yaml` is the catalogue; this is how the code holds to it. `problems-check.mjs`
fails a status chosen anywhere else.

## The shape

| File | Holds | Never |
|---|---|---|
| `internal/<domain>/errors.go` | typed domain errors: sentinels (`ErrNotFound`) and structs carrying data (`*ConflictError{Current string}`) | an HTTP status, a problem type |
| `internal/fielderr` | the one `FieldError`, codes generated from the contract (`_templates/code/go/fielderr`) | a second `FieldError` type, a raw code string |
| `internal/http/problem.go` | the type constants, **the status table**, and `toProblem`, the one mapper | a domain rule |
| `internal/http/<domain>_handlers.go` | decode, call the service, `return err` | `&Error{Status: …}`, `http.StatusXxx` in an error path |

## The status table

One map, one row per catalogue entry, status and title together, so `problems.yaml` and the code
are compared row by row:

```go
var problemTable = map[string]struct {
    Status int
    Title  string
}{
    TypeValidation:      {Status: http.StatusUnprocessableEntity, Title: "Validation failed"},
    TypeReleaseNotFound: {Status: http.StatusNotFound, Title: "Release not found"},
    TypeReleaseConflict: {Status: http.StatusConflict, Title: "Release in another state"},
}
```

A type built at runtime (`"/problems/" + kind`) cannot be compared with anything; map each kind
to a named constant.

## The mapper

```go
// toProblem is the only function that turns an error into a problem.
func toProblem(err error) Problem {
    var (
        fe *fielderr.Error
        ce *release.ConflictError
    )
    switch {
    case errors.As(err, &fe):
        return newProblem(TypeValidation, withFields(fe.Fields))
    case errors.Is(err, release.ErrNotFound):
        return newProblem(TypeReleaseNotFound)
    case errors.As(err, &ce):
        return newProblem(TypeReleaseConflict, withCurrentStatus(ce.Current))
    default:
        return newProblem(TypeInternal) // the cause is logged, never sent
    }
}
```

`newProblem` reads status and title from the table. A domain package that needs a new outcome adds
an error to its `errors.go`, a catalogue row at G4, a table row and one `case` here — four lines
in four obvious places.

## Rules

1. A single-field rule is a `fielderr.Error` with a code from the contract enum, mapped to 422
   `validation` — never a new type.
2. One type, one status. A refusal that "depends" is two types.
3. A domain error never names a status; a handler never builds an `Error` literal.
4. A message is a full sentence in sentence case with no number; the number goes in `Limit`.
5. Not-found details come from the catalogue's `when` intent — one sentence per type, not per
   handler.

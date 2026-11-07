"""The one FieldError of this service (DEV-CONTRACTS §13.2, §13.11).

Template: copy to <package>/fielderr.py at the first G7 task that validates input, and generate
fielderr_codes.py from the contract:

    node .sdlc/scripts/problems-check.mjs --openapi .sdlc/api/<slug>/openapi.yaml \
        --emit-codes python --out <package>/fielderr_codes.py

Every module that refuses a field raises FieldErrors; the HTTP boundary maps it to 422
`validation` with errors[]. With Pydantic, convert its ValidationError here, once — never per
router. Message style: one full sentence, sentence case, no number ("The name is too long.");
the number goes in `limit`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .fielderr_codes import Code


@dataclass(frozen=True)
class FieldError:
    field: str
    code: Code
    message: str
    limit: int | None = None


@dataclass
class FieldErrors(Exception):
    fields: list[FieldError] = field(default_factory=list)

    def add(self, name: str, code: Code, message: str, limit: int | None = None) -> "FieldErrors":
        self.fields.append(FieldError(name, code, message, limit))
        return self

    def raise_if_any(self) -> None:
        if self.fields:
            raise self

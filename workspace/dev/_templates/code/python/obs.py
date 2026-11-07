"""The one logging API of this service, and its seam to traces (DEV-CONTRACTS §13.5, §13.11).

Template: copy to <package>/obs.py at the first G7 task. Code writes

    obs.event("release.release_created", release_id=rid)

and nothing else: no logger.info, no print beside it (obs-check E116). Each call is one JSON line
on stdout with timestamp, level, service, env, version, trace_id, span_id, request_id, user_id,
event and the typed fields. The OpenTelemetry Collector (ops/otel/) ships those lines to whichever
backend the environment names, so the code never names a vendor.

Standard library only. When opentelemetry-api is installed, trace_id and span_id come from the
current span, and `Requests` continues an inbound W3C traceparent; without it they come from the
traceparent header alone.
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
import secrets
import sys
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

try:  # optional: the trace ids come from OTel when it is there
    from opentelemetry import trace as _otel_trace
except ImportError:  # pragma: no cover - exercised when the package is absent
    _otel_trace = None

# Each catalogued event's one level (observability.md ## Log events). An event not listed is info.
LEVELS: dict[str, int] = {
    "http.request_completed": logging.INFO,
}

REQUEST_ID_HEADER = "X-Request-Id"
_VALID_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
_TRACEPARENT = re.compile(r"^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$")
_SENSITIVE = ("password", "passwd", "secret", "token", "authorization", "cookie", "api_key", "apikey", "email", "phone", "card", "ssn")

_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")
_user_id: contextvars.ContextVar[str] = contextvars.ContextVar("user_id", default="")
_trace: contextvars.ContextVar[tuple[str, str]] = contextvars.ContextVar("trace", default=("", ""))

_logger = logging.getLogger("obs")


def event(name: str, /, **fields: Any) -> None:
    """Write one event at its catalogued level. The name is a literal, never built (E115)."""
    _logger.log(LEVELS.get(name, logging.INFO), name, extra={"fields": fields})


def err(exc: BaseException) -> str:
    """The field an error travels in: its type and message, never a stack or a request body."""
    return f"{type(exc).__name__}: {exc}"


def set_request_id(rid: str) -> contextvars.Token[str]:
    return _request_id.set(rid)


def request_id() -> str:
    return _request_id.get()


def set_user_id(uid: str) -> contextvars.Token[str]:
    """The pseudonymous user id (§13.5): an opaque id, never an email or a name."""
    return _user_id.set(uid)


def trace_id() -> str:
    """The current trace id, for the error response the runbook asks a user to quote."""
    return _ids()[0]


def _ids() -> tuple[str, str]:
    if _otel_trace is not None:
        sc = _otel_trace.get_current_span().get_span_context()
        if sc.is_valid:
            return f"{sc.trace_id:032x}", f"{sc.span_id:016x}"
    return _trace.get()


def _redact(fields: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for k, v in fields.items():
        key = k.lower().replace("-", "_")
        out[k] = "[REDACTED]" if any(s in key for s in _SENSITIVE) else v
    return out


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str, env: str, version: str) -> None:
        super().__init__()
        self.base = {"service": service, "env": env, "version": version}

    def format(self, record: logging.LogRecord) -> str:
        line: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower().replace("warning", "warn"),
            **self.base,
        }
        # A library's own log line keeps one format but is not a catalogued event.
        if record.name == "obs":
            line["event"] = record.getMessage()
        else:
            line["logger"], line["message"] = record.name, record.getMessage()
        tid, sid = _ids()
        for key, value in (("trace_id", tid), ("span_id", sid), ("request_id", _request_id.get()), ("user_id", _user_id.get())):
            if value:
                line[key] = value
        line.update(_redact(getattr(record, "fields", {})))
        if record.exc_info:
            line["error"] = err(record.exc_info[1])
        return json.dumps(line, default=str, ensure_ascii=False)


def setup(service: str, env: str, version: str, level: str = "info", stream: Any = None) -> None:
    """Install the JSON handler on the root logger. Call once at start-up, before anything logs."""
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(JsonFormatter(service, env, version))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    name = level.upper()
    root.setLevel(getattr(logging, "WARNING" if name == "WARN" else name, logging.INFO))


Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict[str, Any]]]
Send = Callable[[dict[str, Any]], Awaitable[None]]


class Requests:
    """ASGI middleware: takes or mints the request id, echoes it in X-Request-Id, continues an
    inbound traceparent, and writes http.request_completed once per request. The route is the
    matched template (`/releases/{id}`), never the raw path: unbounded cardinality (§13.5)."""

    def __init__(self, app: Callable[[Scope, Receive, Send], Awaitable[None]]) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        rid = headers.get(REQUEST_ID_HEADER.lower(), "")
        if not _VALID_ID.match(rid):
            rid = secrets.token_hex(16)
        tp = _TRACEPARENT.match(headers.get("traceparent", ""))
        t_tok = _trace.set((tp.group(1), secrets.token_hex(8)) if tp else (secrets.token_hex(16), secrets.token_hex(8)))
        r_tok = _request_id.set(rid)
        status = 500
        start = time.perf_counter()

        async def send_with_id(message: dict[str, Any]) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message.setdefault("headers", [])
                message["headers"] = [*message["headers"], (REQUEST_ID_HEADER.encode(), rid.encode())]
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            route = scope.get("route")
            event(
                "http.request_completed",
                **{
                    "http.request.method": scope.get("method", ""),
                    "http.route": getattr(route, "path", None) or "unmatched",
                    "http.response.status_code": status,
                    "url.scheme": scope.get("scheme", "http"),
                    "server.address": headers.get("host", ""),
                    "duration_ms": round((time.perf_counter() - start) * 1000),
                },
            )
            _request_id.reset(r_tok)
            _trace.reset(t_tok)

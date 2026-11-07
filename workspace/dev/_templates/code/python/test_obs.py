"""The obs template's own tests: one JSON line, the catalogued level, redaction, the request line.

Copy beside obs.py; standard library only (`python -m unittest`).
"""

import asyncio
import io
import json
import logging
import unittest

import obs


def lines(buf: io.StringIO) -> list[dict]:
    """The catalogued events; a library's own lines (asyncio's debug) carry `logger`, not `event`."""
    return [e for e in (json.loads(line) for line in buf.getvalue().splitlines() if line) if "event" in e]


class Route:
    path = "/releases/{id}"


async def app(scope, receive, send):
    scope["route"] = Route()
    await send({"type": "http.response.start", "status": 404, "headers": []})
    await send({"type": "http.response.body", "body": b""})


def call(headers):
    sent = []

    async def send(m):
        sent.append(m)

    async def receive():
        return {"type": "http.request"}

    scope = {"type": "http", "method": "GET", "path": "/releases/9", "scheme": "http", "headers": [(k.encode(), v.encode()) for k, v in headers.items()]}
    asyncio.run(obs.Requests(app)(scope, receive, send))
    return dict((k.decode(), v.decode()) for k, v in sent[0]["headers"])


class ObsTest(unittest.TestCase):
    def setUp(self):
        self.buf = io.StringIO()
        obs.setup("svc", "test", "1.2.3", "debug", self.buf)

    def test_event_is_one_structured_line(self):
        token = obs.set_request_id("req-12345678")
        obs.set_user_id("u_42")
        obs.event("release.release_created", release_id=7, user_email="a@b.c", api_key="k")
        obs._request_id.reset(token)
        [line] = lines(self.buf)
        for key, want in {"event": "release.release_created", "level": "info", "service": "svc", "env": "test", "version": "1.2.3", "request_id": "req-12345678", "user_id": "u_42", "release_id": 7, "user_email": "[REDACTED]", "api_key": "[REDACTED]"}.items():
            self.assertEqual(line.get(key), want, key)
        self.assertIn("timestamp", line)

    def test_event_uses_its_catalogued_level(self):
        obs.setup("svc", "test", "1", "warn", self.buf)
        obs.LEVELS["release.publish_failed"] = logging.ERROR
        try:
            obs.event("release.release_created")
            obs.event("release.publish_failed")
        finally:
            del obs.LEVELS["release.publish_failed"]
        self.assertEqual([line["level"] for line in lines(self.buf)], ["error"])

    def test_requests_echoes_the_id_and_logs_the_route_template(self):
        headers = call({"host": "api.local"})
        rid = headers[obs.REQUEST_ID_HEADER]
        self.assertEqual(len(rid), 32)
        [line] = lines(self.buf)
        for key, want in {"event": "http.request_completed", "http.route": "/releases/{id}", "http.response.status_code": 404, "request_id": rid}.items():
            self.assertEqual(line.get(key), want, key)
        self.assertEqual(len(line["trace_id"]), 32)

    def test_an_unsafe_inbound_id_is_replaced_and_a_traceparent_continued(self):
        headers = call({"x-request-id": "bad id\nforged", "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"})
        self.assertNotEqual(headers[obs.REQUEST_ID_HEADER], "bad id\nforged")
        self.assertEqual(lines(self.buf)[0]["trace_id"], "4bf92f3577b34da6a3ce929d0e0e4736")


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Fast dashboard smoke test for local development and Raspberry checks.

The goal is intentionally small: import the Flask app, render the main pages,
validate the most important API contracts, and catch duplicate DOM ids. It is
not a hardware benchmark and does not require real cameras.
"""

from __future__ import annotations

import sys
import os
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
os.environ.setdefault("EASY_DASHBOARD_SKIP_GLOBAL_APP", "1")

from app import create_app


class IdCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name == "id" and value:
                self.ids.append(value)


def assert_ok(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_keys(payload: dict, keys: Iterable[str], label: str) -> None:
    missing = [key for key in keys if key not in payload]
    assert_ok(not missing, f"{label} missing keys: {', '.join(missing)}")


def assert_no_duplicate_ids(route: str, html: str) -> None:
    parser = IdCollector()
    parser.feed(html)
    duplicates = sorted({item for item in parser.ids if parser.ids.count(item) > 1})
    assert_ok(not duplicates, f"{route} duplicate DOM ids: {', '.join(duplicates)}")


def main() -> int:
    app = create_app(run_startup_checks=False, start_runtime_services=False)
    app.testing = True
    client = app.test_client()

    page_routes = ["/", "/thermal-events", "/snapshots", "/system-diagnostics", "/help"]
    for route in page_routes:
        response = client.get(route)
        assert_ok(response.status_code == 200, f"{route} returned {response.status_code}")
        html = response.get_data(as_text=True)
        assert_no_duplicate_ids(route, html)
        assert_ok("dashboard_api.js" in html, f"{route} does not load the shared API client")

    state = client.get("/api/dashboard/state").get_json()
    assert_ok(isinstance(state, dict), "/api/dashboard/state did not return JSON")
    require_keys(
        state,
        [
            "health",
            "sources",
            "devices",
            "inference",
            "detections",
            "session",
            "snapshots",
            "events",
        ],
        "/api/dashboard/state",
    )

    summary = client.get("/api/status/summary").get_json()
    assert_ok(isinstance(summary, dict), "/api/status/summary did not return JSON")
    require_keys(summary, ["ok", "operator_state", "live", "mission", "dataset", "ai", "activity"], "/api/status/summary")

    session = client.get("/api/session/status").get_json()
    assert_ok(isinstance(session, dict), "/api/session/status did not return JSON")
    require_keys(session, ["running", "current", "latest", "recent", "count"], "/api/session/status")

    manifest = client.get("/api/session/manifest").get_json()
    assert_ok(isinstance(manifest, dict), "/api/session/manifest did not return JSON")
    require_keys(manifest, ["ok"], "/api/session/manifest")

    acquisition = client.get("/api/acquisition/status").get_json()
    assert_ok(isinstance(acquisition, dict), "/api/acquisition/status did not return JSON")
    require_keys(acquisition, ["ok", "running", "manifest_counts", "dataset_summary"], "/api/acquisition/status")

    sources = client.get("/api/sources/status").get_json()
    assert_ok(isinstance(sources, dict), "/api/sources/status did not return JSON")
    require_keys(sources, ["ok", "sources", "selected_source"], "/api/sources/status")
    for source in sources["sources"]:
        require_keys(source, ["id", "status", "selected", "availability", "capabilities"], f"source {source.get('id')}")
        require_keys(source["availability"], ["available", "selectable", "streaming"], f"source {source.get('id')} availability")

    inference = client.get("/api/inference/status").get_json()
    assert_ok(isinstance(inference, dict), "/api/inference/status did not return JSON")
    require_keys(inference, ["running", "backend", "model_path", "frame_provider"], "/api/inference/status")
    require_keys(inference, ["backend_status"], "/api/inference/status")
    require_keys(inference["backend_status"], ["name", "model_path", "loaded", "providers"], "inference backend")

    snapshots = client.get("/api/snapshots/recent").get_json()
    assert_ok(isinstance(snapshots, dict), "/api/snapshots/recent did not return JSON")
    require_keys(snapshots, ["count", "items", "feeds", "summary"], "/api/snapshots/recent")

    thermal = client.get("/thermal/status").get_json()
    assert_ok(isinstance(thermal, dict), "/thermal/status did not return JSON")
    require_keys(
        thermal,
        ["status", "device", "configured_device", "input_format", "video_size", "discovery_method"],
        "/thermal/status",
    )

    print("Dashboard smoke test: OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Dashboard smoke test: FAILED - {exc}", file=sys.stderr)
        raise

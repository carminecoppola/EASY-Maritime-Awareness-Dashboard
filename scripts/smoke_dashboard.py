#!/usr/bin/env python3
"""Fast dashboard smoke test for local development and Raspberry checks.

The goal is intentionally small: import the Flask app, render the main pages,
validate the most important API contracts, and catch duplicate DOM ids. It is
not a hardware benchmark and does not require real cameras.
"""

from __future__ import annotations

import json
import os
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
os.environ.setdefault("EASY_DASHBOARD_SKIP_GLOBAL_APP", "1")

from app import create_app
from device_manager import status_to_health
from easy_dashboard.runtime_status import (
    build_rgb_device_status,
    build_rgb_state_contract,
    build_thermal_device_status,
    build_thermal_state_contract,
    runtime_is_healthy,
)
from easy_dashboard.hardware import ThermalState
from runtime_support import error_from_payload, health_from_status, is_active_status, status_from_payload


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
    assert_ok(status_to_health("STREAMING") == "GOOD", "device health compatibility changed")
    assert_ok(health_from_status("INITIALIZING") == "DEGRADED", "initializing health mapping changed")
    assert_ok(status_from_payload({"ok": False}) == "ERROR", "payload status mapping changed")
    assert_ok(error_from_payload({"config_error": "invalid"}) == "invalid", "payload error mapping changed")
    assert_ok(is_active_status("STARTING") is True, "starting component must remain active")
    assert_ok(is_active_status("WAITING") is False, "waiting component activity contract changed")
    assert_ok(build_rgb_device_status(None, "rgb_left")["status"] == "NOT_PRESENT", "missing RGB mapping changed")
    assert_ok(build_thermal_device_status(None)["status"] == "NOT_PRESENT", "missing thermal mapping changed")
    rgb_streaming = build_rgb_state_contract({"camera_state": "DETECTED", "detected": True, "last_frame_ts": time.time()})
    thermal_ready = build_thermal_state_contract({"status": "READY", "mode": "real", "detected": True, "last_frame_ts": 0})
    assert_ok(rgb_streaming["availability"] == "STREAMING", "fresh RGB state must map to STREAMING")
    assert_ok(thermal_ready["availability"] == "READY", "idle on-demand thermal must map to READY")
    assert_ok(thermal_ready["operational"] is True and thermal_ready["streaming"] is False, "READY thermal must be usable without continuous streaming")
    assert_ok(runtime_is_healthy({"camera_state": "DETECTED", "detected": True}, {"status": "READY", "mode": "real", "detected": True}), "READY thermal must not fail service health")
    assert_ok(runtime_is_healthy({"camera_state": "DETECTED", "detected": True}, {"status": "ERROR", "mode": "real", "detected": True}) is False, "thermal ERROR must fail service health")

    inference_config = json.loads((PROJECT_ROOT / "runtime" / "config" / "inference_config.json").read_text(encoding="utf-8"))
    assert_ok([item["name"] for item in inference_config["classes"]] == ["boat", "ship", "buoy"], "inference classes must match ONNX metadata")

    runtime_js = (PROJECT_ROOT / "static" / "js" / "dashboard_runtime.js").read_text(encoding="utf-8")
    live_js = (PROJECT_ROOT / "static" / "js" / "dashboard_live.js").read_text(encoding="utf-8")
    detections_js = (PROJECT_ROOT / "static" / "js" / "dashboard_detections.js").read_text(encoding="utf-8")
    log_js = (PROJECT_ROOT / "static" / "js" / "dashboard_log.js").read_text(encoding="utf-8")
    assert_ok(runtime_js.count("applyDashboardPayload(payload);") == 1, "dashboard refresh must render each payload once")
    assert_ok("events_limit=9999" not in runtime_js, "dashboard polling must not request the complete event history")
    assert_ok("dashboardRefreshPromise" in runtime_js, "dashboard polling must prevent overlapping requests")
    assert_ok("function setupLivePage()" in live_js and "function setupLivePage()" not in runtime_js, "Live interactions must stay in the Live module")
    assert_ok("function setupDetectionsPage()" in detections_js and "function setupDetectionsPage()" not in runtime_js, "Analysis interactions must stay in the Analysis module")
    assert_ok('row.className = `event-card timeline-event-card is-${severityTone}`' in detections_js, "Analysis history must reuse the active-event card")
    assert_ok('class="event-card-meta timeline-event-meta"' in detections_js, "Analysis history metadata must reuse the event-card layout")
    assert_ok("function setupLogPage()" in log_js and "function setupLogPage()" not in runtime_js, "Archive interactions must stay in the Archive module")

    app = create_app(run_startup_checks=False, start_runtime_services=False)
    runtime = app.easy_dashboard_runtime
    assert_ok(runtime.thermal.discovery_method == "not_checked", "runtime construction must not trigger thermal detection")
    assert_ok(runtime.thermal._worker_started is False, "runtime construction must not start the thermal worker")
    app.testing = True
    client = app.test_client()

    page_routes = ["/", "/paper-preview", "/mission", "/thermal-events", "/snapshots", "/system-diagnostics", "/help"]
    stylesheet_order = [
        "foundations.css",
        "runtime-layout.css",
        "page-layouts.css",
        "operator-overrides.css",
    ]
    for route in page_routes:
        response = client.get(route)
        assert_ok(response.status_code == 200, f"{route} returned {response.status_code}")
        html = response.get_data(as_text=True)
        assert_no_duplicate_ids(route, html)
        stylesheet_positions = [html.find(name) for name in stylesheet_order]
        assert_ok(all(position >= 0 for position in stylesheet_positions), f"{route} does not load every CSS layer")
        assert_ok(stylesheet_positions == sorted(stylesheet_positions), f"{route} changes the CSS layer order")
        assert_ok("dashboard_api.js" in html, f"{route} does not load the shared API client")
        assert_ok("app-footer-nav" in html, f"{route} does not render the shared footer navigation")
        assert_ok("<title>EASY Maritime Awareness" in html, f"{route} does not use the branded browser title")
        if route == "/":
            assert_ok("live-grid" in html, "Live page must render the camera feeds")
            assert_ok("when the cameras are available" in html.lower(), "Live help text must not imply offline cameras are streaming")
            assert_ok("live-mission-command-bar" not in html, "Live page must not render mission controls")
            assert_ok("live-source-grid" not in html, "Live page must not render mission source controls")
            assert_ok("dataset-session-state-badge" not in html, "Live page must not render session dataset controls")
        if route == "/mission":
            assert_ok('data-page="mission"' in html, "Mission page must expose its page key")
            assert_ok('data-nav-key="mission"' in html and 'topnav-link is-active' in html, "Mission navigation must be active")
            assert_ok("live-mission-command-bar" in html, "Mission page must render mission controls")
            assert_ok("dataset-session-state-badge" in html, "Mission page must render dataset status")
            assert_ok("live-source-grid" in html, "Mission page must render source controls")
            assert_ok("live-source-selected-badge" in html, "Mission page must render selected source status")
            assert_ok("mission-history-list" in html, "Mission page must render session history")
        if route == "/paper-preview":
            assert_ok('data-presentation-mode="true"' in html, "Paper preview must identify its read-only mode")
            assert_ok("Paper preview" in html, "Paper preview must disclose recorded presentation content")
            assert_ok("/paper-assets/rgb-left" in html and "/paper-assets/rgb-right" in html, "Paper preview must render both recorded RGB samples")
            assert_ok("/video/rgb_left" not in html and "/video/rgb_right" not in html, "Paper preview must not open live RGB streams")
        if route == "/thermal-events":
            assert_ok("analysis-control-copy" in html, "Detection page must explain the primary AI action")
            assert_ok("analysis-events-column" in html, "Detection events must use the bounded event column")
            assert_ok('aria-current="page"' in html, "Primary navigation must expose the current page")
            assert_ok("analysis-session-reference" in html, "Analysis page must link to mission management")
            assert_ok("button-session-start" not in html, "Analysis page must not duplicate mission start controls")
            assert_ok("events-history-details" in html, "Analysis page must render recent events as a direct panel")
            assert_ok("button-session-stop" not in html, "Analysis page must not duplicate mission stop controls")
        if route == "/snapshots":
            assert_ok("archive-current-section" in html, "Archive must identify its active subsection")
        if route == "/system-diagnostics":
            assert_ok("system-technical-details" in html, "System diagnostics must be collapsed")

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
    for asset in ("rgb-left", "rgb-right"):
        response = client.get(f"/paper-assets/{asset}")
        assert_ok(response.status_code == 200, f"Paper asset {asset} is unavailable")
        assert_ok(response.content_type == "image/jpeg", f"Paper asset {asset} has the wrong media type")
    health = client.get("/health").get_json()
    assert_ok(isinstance(health, dict), "/health did not return JSON")
    require_keys(health, ["ok", "rgb", "thermal", "runtime_state"], "/health")
    require_keys(health["runtime_state"], ["rgb", "thermal"], "/health runtime_state")

    readiness = client.get("/health/ready").get_json()
    assert_ok(isinstance(readiness, dict), "/health/ready did not return JSON")
    require_keys(readiness, ["ok", "service", "orchestrator_status"], "/health/ready")

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

    routes = {rule.rule for rule in app.url_map.iter_rules()}
    assert_ok("/api/acquisition/capture-set" in routes, "coordinated capture route is not registered")
    assert_ok("/api/dataset/export" in routes, "dataset export route is not registered")
    assert_ok("/thermal/last-frame" in routes, "cached thermal preview route is not registered")
    thermal_seq_before = runtime.thermal.frame_seq
    cached_thermal = client.get("/thermal/last-frame")
    assert_ok(cached_thermal.status_code == 204, "empty thermal cache must return 204 without starting capture")
    assert_ok(runtime.thermal.frame_seq == thermal_seq_before, "cached thermal preview must not acquire a hardware frame")
    export_status = client.get("/api/dataset/export/status").get_json()
    require_keys(export_status, ["ok", "export_root", "last_export", "exports_count", "exports_size_bytes", "disk", "retention"], "/api/dataset/export/status")
    retention = client.get("/api/dataset/export/retention?keep_latest=5").get_json()
    require_keys(retention, ["ok", "plan"], "/api/dataset/export/retention")

    sources = client.get("/api/sources/status").get_json()
    assert_ok(isinstance(sources, dict), "/api/sources/status did not return JSON")
    require_keys(sources, ["ok", "sources", "selected_source"], "/api/sources/status")
    for source in sources["sources"]:
        require_keys(source, ["id", "status", "selected", "availability", "capabilities", "runtime_state"], f"source {source.get('id')}")
        require_keys(source["availability"], ["available", "selectable", "streaming"], f"source {source.get('id')} availability")
    source_capabilities = {source["id"]: source["capabilities"] for source in sources["sources"]}
    assert_ok(source_capabilities["rgb_left"]["inference"] is True, "RGB left must support live inference")
    assert_ok(source_capabilities["rgb_right"]["inference"] is True, "RGB right must support live inference")
    assert_ok(source_capabilities["thermal"]["inference"] is False, "thermal must not use the RGB model")

    thermal_selector = ThermalState.__new__(ThermalState)
    selected_thermal_node = thermal_selector._select_thermal_candidate(
        [
            {"path": "/dev/video0", "supports_y16": False, "supports_configured_size": True},
            {"path": "/dev/video1", "supports_y16": True, "supports_configured_size": True},
        ]
    )
    assert_ok(selected_thermal_node == "/dev/video1", "thermal discovery must prefer the Y16 node")

    inference = client.get("/api/inference/status").get_json()
    assert_ok(isinstance(inference, dict), "/api/inference/status did not return JSON")
    require_keys(inference, ["running", "backend", "model_path", "frame_provider"], "/api/inference/status")
    require_keys(inference, ["backend_status"], "/api/inference/status")
    require_keys(inference["backend_status"], ["name", "model_path", "loaded", "providers"], "inference backend")

    snapshots = client.get("/api/snapshots/recent").get_json()
    assert_ok(isinstance(snapshots, dict), "/api/snapshots/recent did not return JSON")
    require_keys(snapshots, ["count", "items", "feeds", "summary"], "/api/snapshots/recent")

    runtime_script = (PROJECT_ROOT / "static" / "js" / "dashboard_runtime.js").read_text(encoding="utf-8")
    assert_ok("DOMContentLoaded" in runtime_script, "dashboard runtime must not wait for endless media streams")
    assert_ok('addEventListener("load"' not in runtime_script, "dashboard runtime still waits for window.load")

    thermal = client.get("/thermal/status").get_json()
    assert_ok(isinstance(thermal, dict), "/thermal/status did not return JSON")
    require_keys(
        thermal,
        ["status", "device", "configured_device", "input_format", "video_size", "discovery_method", "streaming", "runtime_state"],
        "/thermal/status",
    )
    require_keys(thermal["runtime_state"], ["availability", "health", "capture_mode", "ready", "streaming", "operational"], "/thermal/status runtime_state")

    print("Dashboard smoke test: OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Dashboard smoke test: FAILED - {exc}", file=sys.stderr)
        raise

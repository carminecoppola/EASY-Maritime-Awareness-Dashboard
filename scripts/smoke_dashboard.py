#!/usr/bin/env python3
"""Fast dashboard smoke test for local development and Raspberry checks.

The goal is intentionally small: import the Flask app, validate the most
important API/media contracts, confirm the built React SPA is served for
client routes, and catch backend regressions. It is not a hardware benchmark
and does not require real cameras.
"""

from __future__ import annotations

import json
import os
import sys
import time
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


def assert_ok(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_keys(payload: dict, keys: Iterable[str], label: str) -> None:
    missing = [key for key in keys if key not in payload]
    assert_ok(not missing, f"{label} missing keys: {', '.join(missing)}")


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

    app = create_app(run_startup_checks=False, start_runtime_services=False)
    runtime = app.easy_dashboard_runtime
    assert_ok(runtime.thermal.discovery_method == "not_checked", "runtime construction must not trigger thermal detection")
    assert_ok(runtime.thermal._worker_started is False, "runtime construction must not start the thermal worker")
    app.testing = True
    client = app.test_client()

    # The SPA (frontend/dist) is served by the catch-all route for "/" and
    # any unmatched client-side path; a missing build degrades to 503 rather
    # than crashing, which is itself a meaningful signal to check for.
    frontend_dist = PROJECT_ROOT / "frontend" / "dist"
    if (frontend_dist / "index.html").is_file():
        for route in ("/", "/mission", "/thermal-events", "/snapshots", "/system-diagnostics", "/help", "/some/unknown/spa/route"):
            response = client.get(route)
            assert_ok(response.status_code == 200, f"{route} returned {response.status_code}")
            assert_ok("text/html" in (response.content_type or ""), f"{route} did not serve the SPA shell")
    else:
        print("NOTE: frontend/dist not built, skipping SPA-serving assertions (run `npm run build` in frontend/).")

    config_payload = client.get("/api/config").get_json()
    assert_ok(isinstance(config_payload, dict), "/api/config did not return JSON")
    require_keys(config_payload, ["auth_required"], "/api/config")

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
        sys.exit(main())
    except AssertionError as exc:
        print(f"Dashboard smoke test FAILED: {exc}")
        sys.exit(1)

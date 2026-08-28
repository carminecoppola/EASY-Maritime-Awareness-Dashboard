#!/usr/bin/env python3
from __future__ import annotations

import atexit
import logging
import os
import threading
import time
from typing import Any

from flask import Flask, jsonify, request

from easy_dashboard.config import load_config
from easy_dashboard.constants import EVENTS_LOG, PROJECT_ROOT, SNAPSHOTS_DIR
from easy_dashboard.hardware import RgbMasterSource, SystemProbe, ThermalState
from easy_dashboard.presentation import append_startup_notice, run_preflight_script
from easy_dashboard.routes import register_blueprints
from easy_dashboard.runtime import DashboardRuntime
from easy_dashboard.stores import EventStore, SnapshotStore
from system_orchestrator import SystemOrchestrator


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
LOGGER = logging.getLogger("easy-dashboard")


def build_runtime(*, run_startup_checks: bool = True, start_runtime_services: bool = True) -> DashboardRuntime:
    """Create hardware/store/runtime collaborators for the dashboard app."""
    config = load_config()
    events = EventStore(EVENTS_LOG, int(config["events"].get("max_events", 200)))
    snapshot_store = SnapshotStore(SNAPSHOTS_DIR)
    probe = SystemProbe()
    thermal = ThermalState(config, events)
    rgb = RgbMasterSource(config, events, probe)
    # RGB (CSI/libcamera) and thermal (USB/UVC) use independent V4L2 paths; a
    # concurrent capture test (3/3 successful runs, RGB never interrupted)
    # showed pausing RGB during thermal capture is not required, so the
    # coordinator is left unregistered. pause_for_thermal/resume_after_thermal
    # stay available on RgbMasterSource if a future PureThermal regression
    # needs it back.
    orchestrator = SystemOrchestrator(
        runtime_root=PROJECT_ROOT / "runtime",
        replay_root=PROJECT_ROOT / "runtime" / "replay",
        events=events,
        logger=LOGGER,
        probe=probe,
        rgb=rgb,
        thermal=thermal,
    )

    if run_startup_checks:
        run_preflight_script()
        append_startup_notice(events, probe, config)
        thermal.detect_device()
        if thermal.detected:
            events.add(
                "THERMAL_FLIR",
                "DETECTED",
                f"PureThermal detected on {thermal.device}",
                "info",
                meta={
                    "device": thermal.device,
                    "configured_device": thermal.configured_device,
                    "input_format": thermal.input_format,
                    "video_size": thermal.video_size,
                    "discovery_method": thermal.discovery_method,
                },
            )
        else:
            events.add(
                "THERMAL_FLIR",
                "NOT_DETECTED",
                thermal.error or "PureThermal device not detected",
                "warning",
                meta={
                    "configured_device": thermal.configured_device,
                    "device_candidates": thermal.device_candidates,
                    "discovery_method": thermal.discovery_method,
                },
            )

    if start_runtime_services:
        orchestrator.start()

    runtime = DashboardRuntime(
        config=config,
        events=events,
        snapshot_store=snapshot_store,
        probe=probe,
        thermal=thermal,
        rgb=rgb,
        orchestrator=orchestrator,
        logger=LOGGER,
    )

    if start_runtime_services:
        threading.Thread(target=_rgb_keepalive, args=(orchestrator,), daemon=True, name="rgb-keepalive").start()
        events.add("UC512_MULTIPLEXER", "STREAM_AUTOSTART", "RGB stream started on application boot", "info")

    atexit.register(thermal.stop)
    atexit.register(orchestrator.stop)
    return runtime


def _bootstrap_runtime(runtime: DashboardRuntime, *, run_startup_checks: bool, start_runtime_services: bool) -> None:
    """Finish expensive startup work without blocking Flask from binding the port."""
    bootstrap_started = time.monotonic()
    LOGGER.info(
        "BOOTSTRAP begin startup_checks=%s runtime_services=%s thermal_mode=%s thermal_configured_device=%s",
        run_startup_checks,
        start_runtime_services,
        runtime.thermal.mode,
        runtime.thermal.configured_device,
    )
    try:
        if run_startup_checks:
            phase_started = time.monotonic()
            LOGGER.info("BOOTSTRAP preflight begin")
            run_preflight_script()
            append_startup_notice(runtime.events, runtime.probe, runtime.config)
            LOGGER.info("BOOTSTRAP preflight complete elapsed=%.3fs", time.monotonic() - phase_started)

            phase_started = time.monotonic()
            LOGGER.info("BOOTSTRAP thermal detection begin")
            thermal_detected = runtime.thermal.detect_device()
            LOGGER.info(
                "BOOTSTRAP thermal detection complete elapsed=%.3fs detected=%s status=%s device=%s method=%s candidates=%s error=%r",
                time.monotonic() - phase_started,
                thermal_detected,
                runtime.thermal.status,
                runtime.thermal.device,
                runtime.thermal.discovery_method,
                [
                    {
                        "path": candidate.get("path"),
                        "formats": candidate.get("formats"),
                        "sizes": candidate.get("sizes"),
                        "selected": candidate.get("selected"),
                    }
                    for candidate in runtime.thermal.device_candidates
                ],
                runtime.thermal.error,
            )
            if runtime.thermal.detected:
                runtime.events.add(
                    "THERMAL_FLIR",
                    "DETECTED",
                    f"PureThermal detected on {runtime.thermal.device}",
                    "info",
                    meta={
                        "device": runtime.thermal.device,
                        "configured_device": runtime.thermal.configured_device,
                        "input_format": runtime.thermal.input_format,
                        "video_size": runtime.thermal.video_size,
                        "discovery_method": runtime.thermal.discovery_method,
                    },
                )
            else:
                runtime.events.add(
                    "THERMAL_FLIR",
                    "NOT_DETECTED",
                    runtime.thermal.error or "PureThermal device not detected",
                    "warning",
                    meta={
                        "configured_device": runtime.thermal.configured_device,
                        "device_candidates": runtime.thermal.device_candidates,
                        "discovery_method": runtime.thermal.discovery_method,
                    },
                )

        if start_runtime_services:
            if runtime.thermal.enabled and runtime.thermal.mode == "real" and not runtime.thermal.detected:
                LOGGER.info("BOOTSTRAP thermal detection required before runtime services")
                runtime.thermal.detect_device()

            thermal_wait_result = "on_demand"

            LOGGER.info(
                "BOOTSTRAP RGB/orchestrator phase begin thermal_mode=%s thermal_detected=%s elapsed=%.3fs",
                thermal_wait_result,
                runtime.thermal.detected,
                time.monotonic() - bootstrap_started,
            )
            rgb_phase_started = time.monotonic()
            rgb_detected = runtime.rgb.refresh_detection()
            LOGGER.info("BOOTSTRAP RGB detection complete elapsed=%.3fs detected=%s", time.monotonic() - rgb_phase_started, rgb_detected)
            LOGGER.info("BOOTSTRAP orchestrator start begin")
            runtime.orchestrator.start()
            LOGGER.info(
                "BOOTSTRAP orchestrator start complete thermal_status=%s thermal_worker=%s thermal_frame_seq=%s",
                runtime.thermal.status,
                runtime.thermal._worker_started,
                runtime.thermal.frame_seq,
            )
            threading.Thread(target=_rgb_keepalive, args=(runtime.orchestrator,), daemon=True, name="rgb-keepalive").start()
            LOGGER.info("BOOTSTRAP RGB keepalive started thread=rgb-keepalive")
            runtime.events.add("UC512_MULTIPLEXER", "STREAM_AUTOSTART", "RGB stream started on application boot", "info")
    except Exception:
        LOGGER.exception("Background startup bootstrap failed")
    finally:
        LOGGER.info(
            "BOOTSTRAP end elapsed=%.3fs thermal_detected=%s thermal_status=%s thermal_device=%s thermal_frame_seq=%s thermal_error=%r",
            time.monotonic() - bootstrap_started,
            runtime.thermal.detected,
            runtime.thermal.status,
            runtime.thermal.device,
            runtime.thermal.frame_seq,
            runtime.thermal.error,
        )


def _rgb_keepalive(orchestrator: SystemOrchestrator) -> None:
    while True:
        time.sleep(5.0)
        orchestrator.ensure_running()


def create_app(
    *,
    run_startup_checks: bool = True,
    start_runtime_services: bool = True,
    bootstrap_async: bool = True,
) -> Flask:
    """Build the Flask app and register page/API blueprints."""
    runtime = build_runtime(run_startup_checks=False, start_runtime_services=False)
    app = Flask(__name__)
    register_blueprints(app, runtime)
    app.easy_dashboard_runtime = runtime  # type: ignore[attr-defined]

    # Lightweight shared-secret check for state-changing requests: unset by
    # default (LAN-only trust model unchanged), opt-in via config.yaml's
    # security.shared_token or the EASY_DASHBOARD_TOKEN env var for a demo on
    # a network with untrusted peers. Not a full auth system: the operator
    # pastes the token once into the SPA's Settings panel (stored in
    # localStorage), so it only stops requests that never went through that
    # step.
    shared_token = os.environ.get("EASY_DASHBOARD_TOKEN") or str(
        (load_config().get("security") or {}).get("shared_token") or ""
    )
    app.config["EASY_AUTH_REQUIRED"] = bool(shared_token)

    @app.before_request
    def _require_shared_token() -> Any:
        if not shared_token or request.method in ("GET", "HEAD", "OPTIONS"):
            return None
        if request.headers.get("X-EASY-Token") != shared_token:
            return jsonify({"ok": False, "error": "Missing or invalid X-EASY-Token header"}), 401
        return None

    if bootstrap_async and (run_startup_checks or start_runtime_services):
        threading.Thread(
            target=_bootstrap_runtime,
            args=(runtime,),
            kwargs={
                "run_startup_checks": run_startup_checks,
                "start_runtime_services": start_runtime_services,
            },
            daemon=True,
            name="dashboard-bootstrap",
        ).start()
    elif run_startup_checks or start_runtime_services:
        _bootstrap_runtime(
            runtime,
            run_startup_checks=run_startup_checks,
            start_runtime_services=start_runtime_services,
        )

    @app.teardown_appcontext
    def _shutdown(_exc: BaseException | None) -> None:
        pass

    return app


app = None if os.environ.get("EASY_DASHBOARD_SKIP_GLOBAL_APP") == "1" else create_app()


if __name__ == "__main__":
    cfg = load_config()
    host = str(cfg["app"].get("host", "0.0.0.0"))
    port = int(cfg["app"].get("port", 5000))
    probe = SystemProbe()
    LOGGER.info("Starting EASY dashboard on %s:%s", host, port)
    LOGGER.info("Open in Mac browser via tunnel: http://127.0.0.1:%s", port)
    LOGGER.info("Open on Raspberry LAN: http://%s:%s", probe.ip_address(), port)
    assert app is not None
    app.run(host=host, port=port, threaded=True, debug=bool(cfg["app"].get("debug", False)))

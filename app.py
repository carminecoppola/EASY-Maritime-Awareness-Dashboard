#!/usr/bin/env python3
from __future__ import annotations

import atexit
import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

from flask import Flask, jsonify, redirect, request, send_file

from easy_dashboard.config import load_config
from easy_dashboard.constants import EVENTS_LOG, PROJECT_ROOT, SNAPSHOTS_DIR, SNAPSHOT_FEED_MAP
from easy_dashboard.hardware import RgbMasterSource, SystemProbe, ThermalState
from easy_dashboard.presentation import (
    append_startup_notice,
    build_camera_inventory,
    build_operations_payload,
    build_system_payload,
    dashboard_context,
    run_preflight_script,
)
from easy_dashboard.stores import EventStore, SnapshotStore
from easy_dashboard.utils import utc_now_iso
from inference_worker import find_first_image
from system_orchestrator import SystemOrchestrator


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
LOGGER = logging.getLogger("easy-dashboard")


def create_app() -> Flask:
    """Build the Flask app and wire runtime services into dashboard routes."""
    config = load_config()
    app = Flask(__name__)

    def asset_version() -> str:
        return str(int(time.time()))

    events = EventStore(EVENTS_LOG, int(config["events"].get("max_events", 200)))
    snapshot_store = SnapshotStore(SNAPSHOTS_DIR)
    probe = SystemProbe()
    thermal = ThermalState(config, events)
    rgb = RgbMasterSource(config, events, probe)
    orchestrator = SystemOrchestrator(
        runtime_root=PROJECT_ROOT / "runtime",
        replay_root=PROJECT_ROOT / "runtime" / "replay",
        events=events,
        logger=LOGGER,
        probe=probe,
        rgb=rgb,
        thermal=thermal,
    )
    device_manager = orchestrator.device_manager
    source_manager = orchestrator.source_manager
    session_manager = orchestrator.session_manager
    event_manager = orchestrator.event_manager
    detection_manager = orchestrator.detection_manager
    inference = orchestrator.inference

    run_preflight_script()
    append_startup_notice(events, probe, config)
    thermal.detected = "PureThermal" in probe.lsusb() or Path(thermal.device).exists()
    if thermal.detected:
        events.add("THERMAL_FLIR", "DETECTED", "Thermal sensor or PureThermal device detected", "info")
    else:
        events.add("THERMAL_FLIR", "NOT_DETECTED", "Thermal sensor not detected; using mock mode", "warning")
    orchestrator.start()

    @app.context_processor
    def inject_asset_version() -> Dict[str, str]:
        return {"asset_version": asset_version()}

    def _rgb_keepalive() -> None:
        while True:
            time.sleep(5.0)
            orchestrator.ensure_running()

    threading.Thread(target=_rgb_keepalive, daemon=True, name="rgb-keepalive").start()
    events.add("UC512_MULTIPLEXER", "STREAM_AUTOSTART", "RGB stream started on application boot", "info")

    def _events_payload(limit: int = 50) -> Dict[str, Any]:
        all_events = events.list(9999)
        severity_counts: Dict[str, int] = {}
        source_counts: Dict[str, int] = {}
        for event in all_events:
            severity = str(event.get("severity", "info")).lower()
            severity_counts[severity] = severity_counts.get(severity, 0) + 1
            source = str(event.get("source", "unknown"))
            source_counts[source] = source_counts.get(source, 0) + 1
        return {
            "events": events.list(limit),
            "count": len(all_events),
            "summary": {"severity": severity_counts, "sources": source_counts},
        }

    def _inference_status_payload() -> Dict[str, Any]:
        status_payload = inference.status()
        detection_state = detection_manager.get_current_detections()
        status_payload["count"] = detection_state.get("count", status_payload.get("count", 0))
        status_payload["last_detections"] = detection_state.get("detections", status_payload.get("last_detections", []))
        status_payload["last_image"] = detection_state.get("last_image") or status_payload.get("last_image")
        status_payload["last_run_ts"] = detection_state.get("last_run_ts") or status_payload.get("last_run_ts")
        status_payload["last_inference_ms"] = detection_state.get("last_inference_ms") or status_payload.get("last_inference_ms")
        status_payload["fps"] = detection_state.get("fps") or status_payload.get("fps")
        status_payload["detection_manager"] = {
            "current_detections_path": detection_state.get("current_detections_path"),
            "history_path": detection_state.get("history_path"),
            "session_id": detection_state.get("session_id"),
        }
        status_payload["frame_provider"] = inference.frame_provider_status()
        return status_payload

    def _health_payload() -> Dict[str, Any]:
        camera_inventory = build_camera_inventory(rgb, thermal)
        system_payload = build_system_payload(probe)
        rgb_state = rgb.latest_state()
        thermal_state = thermal.status_payload()
        inference_state = inference.status()
        sources_state = source_manager.get_status()
        detection_state = detection_manager.get_current_detections()
        session_state = session_manager.status()
        device_state = device_manager.get_status()
        operations_inference_state = dict(inference_state)
        operations_inference_state.update(
            {
                "count": detection_state.get("count", 0),
                "last_detections": detection_state.get("detections", []),
                "last_image": detection_state.get("last_image") or inference_state.get("last_image"),
                "last_run_ts": detection_state.get("last_run_ts") or inference_state.get("last_run_ts"),
                "last_inference_ms": detection_state.get("last_inference_ms") or inference_state.get("last_inference_ms"),
                "fps": detection_state.get("fps") or inference_state.get("fps"),
                "source": detection_state.get("source") or inference_state.get("source"),
                "source_label": detection_state.get("source_label") or inference_state.get("source_label"),
            }
        )
        operations_payload = build_operations_payload(camera_inventory, rgb_state, thermal_state, operations_inference_state)
        ok = rgb_state["camera_state"] in {"DETECTED", "BUSY"} and thermal_state["status"] in {"MOCK", "REAL", "STARTING", "NOT_DETECTED", "DISABLED"}
        return {
            "ok": ok,
            "service": "easy-dashboard",
            "timestamp": utc_now_iso(),
            "system": system_payload,
            "system_orchestrator": orchestrator.health(),
            "system_components": orchestrator.components(),
            "cameras": camera_inventory,
            "sources": sources_state,
            "rgb": rgb_state,
            "thermal": thermal_state,
            "inference": inference_state,
            "detection_manager": detection_state,
            "session": session_state,
            "devices": device_state,
            "operations": operations_payload,
            "events_count": len(events.list(9999)),
        }

    def _dashboard_state_payload() -> Dict[str, Any]:
        health_payload = _health_payload()
        snapshots_limit = int(request.args.get("snapshots_limit", 12))
        events_limit = int(request.args.get("events_limit", 9999))
        snapshots_summary = snapshot_store.summary()
        return {
            "ok": health_payload.get("ok", False),
            "timestamp": health_payload.get("timestamp"),
            "health": health_payload,
            "events": _events_payload(limit=events_limit),
            "snapshots": {
                "count": snapshots_summary["count"],
                "items": snapshot_store.list_recent(snapshots_limit),
                "feeds": SNAPSHOT_FEED_MAP,
                "summary": snapshots_summary,
            },
            "sources": health_payload.get("sources") or source_manager.get_status(),
            "devices": health_payload.get("devices") or device_manager.get_status(),
            "inference": _inference_status_payload(),
            "detections": detection_manager.get_current_detections(),
            "session": session_manager.status(),
            "events_current": event_manager.get_current_events(),
            "events_history": event_manager.get_history(),
            "frame_provider": inference.frame_provider_status(),
            "system_status": orchestrator.health(),
            "system_components": orchestrator.components(),
        }

    @app.route("/")
    def index() -> str:
        return dashboard_context(
            "live",
            "Vista operativa",
            "Flussi video e stato della missione",
            template_name="index.html",
            hostname=probe.hostname(),
            ip_address=probe.ip_address(),
            asset_version=asset_version(),
            thermal_device=thermal.device,
            thermal_mode=config["thermal"].get("mode", "mock"),
        )

    @app.route("/mission")
    def mission_page() -> str:
        return redirect("/")

    @app.route("/sensors")
    def sensors_page() -> str:
        return redirect("/")

    @app.route("/thermal-events")
    def thermal_events_page() -> str:
        return dashboard_context(
            "detections",
            "Rilevazioni",
            "Eventi rilevati e analisi AI",
            template_name="thermal_events.html",
            hostname=probe.hostname(),
            ip_address=probe.ip_address(),
            asset_version=asset_version(),
            thermal_device=thermal.device,
            thermal_mode=config["thermal"].get("mode", "mock"),
        )

    @app.route("/system-diagnostics")
    def system_diagnostics_page() -> str:
        return dashboard_context(
            "system",
            "Sistema",
            "Stato hardware e dispositivi",
            template_name="system_diagnostics.html",
            hostname=probe.hostname(),
            ip_address=probe.ip_address(),
            asset_version=asset_version(),
            thermal_device=thermal.device,
            thermal_mode=config["thermal"].get("mode", "mock"),
        )

    @app.route("/health")
    def health():
        return jsonify(_health_payload())

    @app.route("/api/dashboard/state", methods=["GET"])
    def api_dashboard_state():
        return jsonify(_dashboard_state_payload())

    @app.route("/system")
    def system():
        return jsonify(build_system_payload(probe))

    @app.route("/cameras")
    def cameras():
        return jsonify(build_camera_inventory(rgb, thermal))

    @app.route("/api/sources", methods=["GET"])
    def api_sources():
        return jsonify(source_manager.get_status())

    @app.route("/api/sources/status", methods=["GET"])
    def api_sources_status():
        return jsonify(source_manager.get_status())

    @app.route("/api/sources/<source_id>", methods=["GET"])
    def api_source_detail(source_id: str):
        source = source_manager.get_source(source_id)
        if not source:
            return jsonify({"ok": False, "error": "Source not found", "id": source_id}), 404
        return jsonify({"ok": True, "source": source})

    @app.route("/api/sources/refresh", methods=["POST"])
    def api_sources_refresh():
        payload = request.get_json(force=True, silent=True) or {}
        source_id = payload.get("source_id") or payload.get("id")
        if source_id:
            return jsonify(source_manager.refresh_status(str(source_id)))
        return jsonify(source_manager.refresh_status())

    @app.route("/api/sources/select", methods=["POST"])
    def api_sources_select():
        payload = request.get_json(force=True, silent=True) or {}
        source_id = str(payload.get("source_id") or payload.get("id") or "").strip()
        if not source_id:
            return jsonify({"ok": False, "error": "source_id is required"}), 400
        result = source_manager.select_source(source_id)
        if result.get("ok") is False:
            return jsonify(result), 404
        return jsonify(result)

    @app.route("/api/devices", methods=["GET"])
    def api_devices():
        return jsonify(device_manager.get_status())

    @app.route("/api/devices/status", methods=["GET"])
    def api_devices_status():
        return jsonify(device_manager.get_status())

    @app.route("/api/devices/<device_id>", methods=["GET"])
    def api_device_detail(device_id: str):
        device = device_manager.get_device(device_id)
        if not device:
            return jsonify({"ok": False, "error": "Device not found", "id": device_id}), 404
        return jsonify({"ok": True, "device": device})

    @app.route("/api/devices/refresh", methods=["POST"])
    def api_devices_refresh():
        payload = request.get_json(force=True, silent=True) or {}
        device_id = payload.get("device_id") or payload.get("id")
        if device_id:
            return jsonify(device_manager.refresh(str(device_id)))
        return jsonify(device_manager.refresh())

    @app.route("/api/system/status", methods=["GET"])
    def api_system_status():
        return jsonify(orchestrator.health())

    @app.route("/api/system/components", methods=["GET"])
    def api_system_components():
        return jsonify(orchestrator.components())

    @app.route("/api/system/restart", methods=["POST"])
    def api_system_restart():
        return jsonify(orchestrator.restart())

    @app.route("/events")
    def events_endpoint():
        limit = int(request.args.get("limit", 50))
        return jsonify(_events_payload(limit))

    @app.route("/video/rgb_left")
    def video_rgb_left():
        return rgb.stream_response("rgb_left", "left")

    @app.route("/video/rgb_right")
    def video_rgb_right():
        return rgb.stream_response("rgb_right", "right")

    @app.route("/video/rgb_left/start", methods=["POST"])
    def start_rgb_left():
        rgb.set_enabled("rgb_left", True)
        return jsonify({"ok": True, "feed": "rgb_left", "enabled": True, "state": rgb.latest_state()})

    @app.route("/video/rgb_left/stop", methods=["POST"])
    def stop_rgb_left():
        rgb.set_enabled("rgb_left", False)
        return jsonify({"ok": True, "feed": "rgb_left", "enabled": False, "state": rgb.latest_state()})

    @app.route("/video/rgb_right/start", methods=["POST"])
    def start_rgb_right():
        rgb.set_enabled("rgb_right", True)
        return jsonify({"ok": True, "feed": "rgb_right", "enabled": True, "state": rgb.latest_state()})

    @app.route("/video/rgb_right/stop", methods=["POST"])
    def stop_rgb_right():
        rgb.set_enabled("rgb_right", False)
        return jsonify({"ok": True, "feed": "rgb_right", "enabled": False, "state": rgb.latest_state()})

    def _snapshot_error(feed: str, filename: str, error_message: str, snapshot_info: Dict[str, Any], status_code: int = 503):
        return jsonify({"ok": False, "feed": feed, "filename": filename, "url": snapshot_info["url"], "download_url": snapshot_info["download_url"], "error": error_message, "snapshot": snapshot_info}), status_code

    def _snapshot_success(feed: str, snapshot_info: Dict[str, Any], status_code: int = 200):
        return jsonify({"ok": True, "feed": feed, "filename": snapshot_info["filename"], "url": snapshot_info["url"], "download_url": snapshot_info["download_url"], "snapshot": snapshot_info}), status_code

    def _capture_snapshot(feed: str, capture_fn, meta: Dict[str, Any]):
        try:
            frame, ok = capture_fn()
            meta = dict(meta)
            meta["capture_ok"] = ok
            snapshot_info = snapshot_store.save(feed, frame, meta=meta)
            return frame, ok, snapshot_info, meta
        except Exception as exc:
            LOGGER.exception("Failed to save snapshot for %s", feed)
            events.add(meta.get("source", feed.upper()), "SNAPSHOT_ERROR", f"Snapshot failed for {feed}: {exc}", "error", meta=meta)
            return None, False, None, meta

    @app.route("/api/snapshots/recent")
    def api_snapshots_recent():
        limit = int(request.args.get("limit", 24))
        summary = snapshot_store.summary()
        return jsonify({"count": summary["count"], "items": snapshot_store.list_recent(limit), "feeds": SNAPSHOT_FEED_MAP, "summary": summary})

    @app.route("/snapshots")
    def snapshots_gallery():
        return dashboard_context(
            "log",
            "Foto e attività",
            "Acquisizioni salvate, cronologia ed errori",
            template_name="snapshots.html",
            hostname=probe.hostname(),
            ip_address=probe.ip_address(),
            asset_version=asset_version(),
            thermal_device=thermal.device,
            thermal_mode=config["thermal"].get("mode", "mock"),
        )

    @app.route("/snapshots/<feed>/<path:filename>")
    def serve_snapshot(feed: str, filename: str):
        if feed not in SNAPSHOT_FEED_MAP:
            return jsonify({"ok": False, "error": "Unknown snapshot feed"}), 404
        try:
            path = snapshot_store.get_path(feed, filename)
        except Exception:
            return jsonify({"ok": False, "error": "Invalid snapshot path"}), 404
        if not path.exists():
            return jsonify({"ok": False, "error": "Snapshot not found"}), 404
        return send_file(path, mimetype="image/jpeg", as_attachment=request.args.get("download") == "1", conditional=True)

    @app.route("/snapshot/rgb_left", methods=["GET", "POST"])
    def snapshot_rgb_left():
        meta = {
            "feed": "rgb_left",
            "source": "RGB_CAM_LEFT",
            "snapshot_type": "rgb",
            "camera_state": rgb.camera_state(),
            "camera_message": rgb.camera_message(),
            "width": rgb.width,
            "height": rgb.height,
        }
        frame, ok, snapshot_info, meta = _capture_snapshot("rgb_left", lambda: rgb.capture_snapshot("left"), meta)
        if snapshot_info is None:
            return _snapshot_error("rgb_left", "rgb_left_snapshot.jpg", meta.get("camera_message", "Snapshot failed"), {"url": "#", "download_url": "#"}, 503)
        events.add("RGB_CAM_LEFT", "SNAPSHOT_SAVED", f"Saved {snapshot_info['filename']}", "info", meta=meta)
        if not ok:
            return _snapshot_error("rgb_left", snapshot_info["filename"], "RGB left offline", snapshot_info, 503)
        return _snapshot_success("rgb_left", snapshot_info)

    @app.route("/snapshot/rgb_right", methods=["GET", "POST"])
    def snapshot_rgb_right():
        meta = {
            "feed": "rgb_right",
            "source": "RGB_CAM_RIGHT",
            "snapshot_type": "rgb",
            "camera_state": rgb.camera_state(),
            "camera_message": rgb.camera_message(),
            "width": rgb.width,
            "height": rgb.height,
        }
        frame, ok, snapshot_info, meta = _capture_snapshot("rgb_right", lambda: rgb.capture_snapshot("right"), meta)
        if snapshot_info is None:
            return _snapshot_error("rgb_right", "rgb_right_snapshot.jpg", meta.get("camera_message", "Snapshot failed"), {"url": "#", "download_url": "#"}, 503)
        events.add("RGB_CAM_RIGHT", "SNAPSHOT_SAVED", f"Saved {snapshot_info['filename']}", "info", meta=meta)
        if not ok:
            return _snapshot_error("rgb_right", snapshot_info["filename"], "RGB right offline", snapshot_info, 503)
        return _snapshot_success("rgb_right", snapshot_info)

    @app.route("/thermal/status")
    def thermal_status():
        return jsonify(thermal.status_payload())

    @app.route("/thermal/frame")
    def thermal_frame():
        frame, stats = thermal.frame()
        return app.response_class(frame, mimetype="image/jpeg", headers={"X-EASY-THERMAL-STATUS": stats.get("status", "unknown")})

    @app.route("/thermal/snapshot", methods=["GET", "POST"])
    @app.route("/snapshot/thermal", methods=["GET", "POST"])
    def thermal_snapshot():
        frame, stats = thermal.snapshot()
        meta = dict(stats)
        meta.update({"feed": "thermal", "snapshot_type": "thermal"})
        try:
            snapshot_info = snapshot_store.save("thermal", frame, meta=meta)
        except Exception as exc:
            LOGGER.exception("Failed to save thermal snapshot")
            events.add("THERMAL_FLIR", "SNAPSHOT_ERROR", f"Snapshot failed: {exc}", "error", meta=meta)
            return _snapshot_error("thermal", "thermal_snapshot.jpg", "Unable to save thermal snapshot", {"url": "#", "download_url": "#"}, 503)
        events.add("THERMAL_FLIR", "SNAPSHOT_SAVED", f"Saved {snapshot_info['filename']}", "info", meta=meta)
        if snapshot_info["meta"].get("status") in {"NOT_DETECTED", "DISABLED"}:
            return _snapshot_error("thermal", snapshot_info["filename"], "Thermal feed unavailable", snapshot_info, 503)
        return _snapshot_success("thermal", snapshot_info)

    @app.route("/api/stream-state", methods=["GET"])
    def stream_state():
        return jsonify({"rgb_left": {"enabled": rgb.enabled_feeds["rgb_left"], "state": rgb.latest_state()}, "rgb_right": {"enabled": rgb.enabled_feeds["rgb_right"], "state": rgb.latest_state()}})

    @app.route("/api/stream-state", methods=["POST"])
    def set_stream_state():
        payload = request.get_json(force=True, silent=True) or {}
        for feed_name in ("rgb_left", "rgb_right"):
            if feed_name in payload:
                rgb.set_enabled(feed_name, bool(payload[feed_name]))
        return jsonify({"ok": True, "rgb_left": rgb.enabled_feeds["rgb_left"], "rgb_right": rgb.enabled_feeds["rgb_right"]})

    def _inference_json(payload: Dict[str, Any], status_code: int = 200):
        return jsonify(payload), status_code

    def _parse_json_payload() -> Dict[str, Any]:
        return request.get_json(force=True, silent=True) or {}

    @app.route("/api/inference/status", methods=["GET"])
    def api_inference_status():
        return jsonify(_inference_status_payload())

    @app.route("/api/frame-provider/status", methods=["GET"])
    def api_frame_provider_status():
        return jsonify(inference.frame_provider_status())

    @app.route("/api/frame-provider/configure", methods=["POST"])
    def api_frame_provider_configure():
        payload = _parse_json_payload()
        result = inference.configure_frame_provider(
            source_type=payload.get("source_type"),
            source_path=payload.get("source_path"),
            source_name=payload.get("source_name"),
            loop=payload.get("loop"),
            save_temp_frames=payload.get("save_temp_frames"),
        )
        return jsonify(result), 200 if result.get("ok") else 400

    @app.route("/api/frame-provider/reset", methods=["POST"])
    def api_frame_provider_reset():
        return jsonify(inference.reset_frame_provider())

    @app.route("/api/frame-provider/next-frame", methods=["POST"])
    def api_frame_provider_next_frame():
        try:
            return jsonify(inference.next_frame())
        except Exception as exc:
            return _inference_json({"ok": False, "error": str(exc), "provider": inference.frame_provider_status()}, 400)

    @app.route("/api/inference/start", methods=["POST"])
    def api_inference_start():
        payload = _parse_json_payload()
        mode = str(payload.get("mode", "replay"))
        interval_seconds = payload.get("interval_seconds")
        try:
            interval_seconds = None if interval_seconds is None else float(interval_seconds)
        except Exception:
            return _inference_json({"ok": False, "error": "Invalid interval_seconds value"}, 400)
        result = inference.start(mode=mode, interval_seconds=interval_seconds)
        return _inference_json(result, 200 if result.get("ok") else 503)

    @app.route("/api/inference/stop", methods=["POST"])
    def api_inference_stop():
        return jsonify(inference.stop())

    @app.route("/api/inference/run-on-image", methods=["POST"])
    def api_inference_run_on_image():
        payload = _parse_json_payload()
        image_path = payload.get("image_path") or payload.get("path") or request.args.get("image_path") or request.args.get("path")
        if image_path is None:
            try:
                image_path = str(find_first_image(inference.replay_dir))
            except Exception:
                return _inference_json({"ok": False, "error": f"No replay images found in {inference.replay_dir}"}, 404)
        result = inference.run_on_image(image_path)
        return _inference_json(result, 200 if result.get("ok") else 400)

    @app.route("/api/inference/run-on-next-frame", methods=["POST"])
    def api_inference_run_on_next_frame():
        try:
            result = inference.run_on_next_frame()
        except Exception as exc:
            return _inference_json({"ok": False, "error": str(exc), "provider": inference.frame_provider_status()}, 400)
        return _inference_json(result, 200 if result.get("ok") else 400)

    @app.route("/api/detections/current", methods=["GET"])
    def api_detections_current():
        return jsonify(detection_manager.get_current_detections())

    @app.route("/api/detection/current", methods=["GET"])
    def api_detection_current():
        return jsonify(detection_manager.get_current_detections())

    @app.route("/api/detection/history", methods=["GET"])
    def api_detection_history():
        return jsonify(detection_manager.get_history())

    @app.route("/api/detection/<detection_id>", methods=["GET"])
    def api_detection_detail(detection_id: str):
        detection = detection_manager.get_detection(detection_id)
        if not detection:
            return jsonify({"ok": False, "error": "Detection not found", "id": detection_id}), 404
        return jsonify({"ok": True, "detection": detection})

    @app.route("/api/detection/clear", methods=["DELETE", "POST"])
    def api_detection_clear():
        return jsonify(detection_manager.clear())

    @app.route("/api/events/current", methods=["GET"])
    def api_events_current():
        return jsonify(event_manager.get_current_events())

    @app.route("/api/events/history", methods=["GET"])
    def api_events_history():
        return jsonify(event_manager.get_history())

    @app.route("/api/events/<event_id>", methods=["GET"])
    def api_event_detail(event_id: str):
        event_payload = event_manager.get_event(event_id)
        if not event_payload:
            return jsonify({"ok": False, "error": "Event not found", "id": event_id}), 404
        return jsonify({"ok": True, "event": event_payload})

    @app.route("/api/events/clear", methods=["DELETE", "POST"])
    def api_events_clear():
        return jsonify(event_manager.clear())

    @app.route("/api/session/start", methods=["POST"])
    def api_session_start():
        payload = _parse_json_payload()
        result = session_manager.start_session(
            mode=str(payload.get("mode") or "replay"),
            operator=str(payload.get("operator") or "operator"),
            model_name=Path(str(inference.model_path)).name,
            model_type=str(inference.backend or "onnx"),
            notes=str(payload.get("notes") or ""),
        )
        return jsonify(result), 200 if result.get("ok") else 400

    @app.route("/api/session/stop", methods=["POST"])
    def api_session_stop():
        current = session_manager.get_current_session()
        session_id = str(current.get("session_id") or "") if current else ""
        result = session_manager.stop_session()
        if session_id:
            try:
                event_manager.resolve_session_events(session_id, notes="Session stopped")
            except Exception:
                pass
        return jsonify(result)

    @app.route("/api/session/status", methods=["GET"])
    def api_session_status():
        return jsonify(session_manager.status())

    @app.route("/api/session/current", methods=["GET"])
    def api_session_current():
        current = session_manager.get_current_session()
        return jsonify({"ok": True, "running": bool(current), "session": current})

    @app.route("/api/session/list", methods=["GET"])
    def api_session_list():
        return jsonify(session_manager.list_sessions())

    @app.route("/api/inference/preview", methods=["GET"])
    def api_inference_preview():
        preview_path = inference.current_preview_path
        if not preview_path.exists():
            return jsonify({"ok": False, "error": "Detection preview not available yet"}), 404
        response = send_file(preview_path, mimetype="image/jpeg", as_attachment=False, conditional=True)
        response.headers["Cache-Control"] = "no-store, max-age=0"
        return response

    @app.teardown_appcontext
    def _shutdown(_exc: Optional[BaseException]) -> None:
        pass

    atexit.register(thermal.stop)
    atexit.register(orchestrator.stop)
    return app


app = create_app()


if __name__ == "__main__":
    cfg = load_config()
    host = str(cfg["app"].get("host", "0.0.0.0"))
    port = int(cfg["app"].get("port", 5000))
    probe = SystemProbe()
    LOGGER.info("Starting EASY dashboard on %s:%s", host, port)
    LOGGER.info("Open in Mac browser via tunnel: http://127.0.0.1:%s", port)
    LOGGER.info("Open on Raspberry LAN: http://%s:%s", probe.ip_address(), port)
    app.run(host=host, port=port, threaded=True, debug=bool(cfg["app"].get("debug", False)))

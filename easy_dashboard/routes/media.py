from __future__ import annotations

import uuid
from typing import Any, Dict

from flask import Blueprint, current_app, jsonify, request, send_file

from easy_dashboard.constants import SNAPSHOT_FEED_MAP
from easy_dashboard.routes import get_runtime


media_bp = Blueprint("media", __name__)


def _snapshot_error(feed: str, filename: str, error_message: str, snapshot_info: Dict[str, Any], status_code: int = 503):
    return (
        jsonify(
            {
                "ok": False,
                "feed": feed,
                "filename": filename,
                "url": snapshot_info["url"],
                "download_url": snapshot_info["download_url"],
                "error": error_message,
                "snapshot": snapshot_info,
            }
        ),
        status_code,
    )


def _snapshot_success(feed: str, snapshot_info: Dict[str, Any], status_code: int = 200):
    return (
        jsonify(
            {
                "ok": True,
                "feed": feed,
                "filename": snapshot_info["filename"],
                "url": snapshot_info["url"],
                "download_url": snapshot_info["download_url"],
                "snapshot": snapshot_info,
            }
        ),
        status_code,
    )


@media_bp.route("/video/rgb_left")
def video_rgb_left():
    return get_runtime().rgb.stream_response("rgb_left", "left")


@media_bp.route("/video/rgb_right")
def video_rgb_right():
    return get_runtime().rgb.stream_response("rgb_right", "right")


@media_bp.route("/video/rgb_left/start", methods=["POST"])
def start_rgb_left():
    runtime = get_runtime()
    runtime.rgb.set_enabled("rgb_left", True)
    return jsonify({"ok": True, "feed": "rgb_left", "enabled": True, "state": runtime.rgb.latest_state()})


@media_bp.route("/video/rgb_left/stop", methods=["POST"])
def stop_rgb_left():
    runtime = get_runtime()
    runtime.rgb.set_enabled("rgb_left", False)
    return jsonify({"ok": True, "feed": "rgb_left", "enabled": False, "state": runtime.rgb.latest_state()})


@media_bp.route("/video/rgb_right/start", methods=["POST"])
def start_rgb_right():
    runtime = get_runtime()
    runtime.rgb.set_enabled("rgb_right", True)
    return jsonify({"ok": True, "feed": "rgb_right", "enabled": True, "state": runtime.rgb.latest_state()})


@media_bp.route("/video/rgb_right/stop", methods=["POST"])
def stop_rgb_right():
    runtime = get_runtime()
    runtime.rgb.set_enabled("rgb_right", False)
    return jsonify({"ok": True, "feed": "rgb_right", "enabled": False, "state": runtime.rgb.latest_state()})


@media_bp.route("/api/focus/rgb_left")
def focus_rgb_left():
    return jsonify(get_runtime().rgb.focus_score("left"))


@media_bp.route("/api/focus/rgb_right")
def focus_rgb_right():
    return jsonify(get_runtime().rgb.focus_score("right"))


@media_bp.route("/api/snapshots/recent")
def api_snapshots_recent():
    runtime = get_runtime()
    limit = int(request.args.get("limit", 24))
    summary = runtime.snapshot_store.summary()
    return jsonify(
        {
            "count": summary["count"],
            "items": runtime.snapshot_store.list_recent(limit),
            "feeds": SNAPSHOT_FEED_MAP,
            "summary": summary,
        }
    )


@media_bp.route("/snapshots/<feed>/<path:filename>")
def serve_snapshot(feed: str, filename: str):
    runtime = get_runtime()
    if feed not in SNAPSHOT_FEED_MAP:
        return jsonify({"ok": False, "error": "Unknown snapshot feed"}), 404
    try:
        path = runtime.snapshot_store.get_path(feed, filename)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid snapshot path"}), 404
    if not path.exists():
        return jsonify({"ok": False, "error": "Snapshot not found"}), 404
    return send_file(path, mimetype="image/jpeg", as_attachment=request.args.get("download") == "1", conditional=True)


@media_bp.route("/snapshot/rgb_left", methods=["GET", "POST"])
def snapshot_rgb_left():
    runtime = get_runtime()
    meta = {
        "feed": "rgb_left",
        "source": "RGB_CAM_LEFT",
        "snapshot_type": "rgb",
        "camera_state": runtime.rgb.camera_state(),
        "camera_message": runtime.rgb.camera_message(),
        "width": runtime.rgb.width,
        "height": runtime.rgb.height,
    }
    _frame, ok, snapshot_info, meta = runtime.capture_snapshot("rgb_left", lambda: runtime.rgb.capture_snapshot("left"), meta)
    if snapshot_info is None:
        return _snapshot_error("rgb_left", "rgb_left_snapshot.jpg", meta.get("camera_message", "Snapshot failed"), {"url": "#", "download_url": "#"}, 503)
    runtime.events.add("RGB_CAM_LEFT", "SNAPSHOT_SAVED", f"Saved {snapshot_info['filename']}", "info", meta=meta)
    if not ok:
        return _snapshot_error("rgb_left", snapshot_info["filename"], "RGB left offline", snapshot_info, 503)
    return _snapshot_success("rgb_left", snapshot_info)


@media_bp.route("/snapshot/rgb_right", methods=["GET", "POST"])
def snapshot_rgb_right():
    runtime = get_runtime()
    meta = {
        "feed": "rgb_right",
        "source": "RGB_CAM_RIGHT",
        "snapshot_type": "rgb",
        "camera_state": runtime.rgb.camera_state(),
        "camera_message": runtime.rgb.camera_message(),
        "width": runtime.rgb.width,
        "height": runtime.rgb.height,
    }
    _frame, ok, snapshot_info, meta = runtime.capture_snapshot("rgb_right", lambda: runtime.rgb.capture_snapshot("right"), meta)
    if snapshot_info is None:
        return _snapshot_error("rgb_right", "rgb_right_snapshot.jpg", meta.get("camera_message", "Snapshot failed"), {"url": "#", "download_url": "#"}, 503)
    runtime.events.add("RGB_CAM_RIGHT", "SNAPSHOT_SAVED", f"Saved {snapshot_info['filename']}", "info", meta=meta)
    if not ok:
        return _snapshot_error("rgb_right", snapshot_info["filename"], "RGB right offline", snapshot_info, 503)
    return _snapshot_success("rgb_right", snapshot_info)


@media_bp.route("/thermal/status")
def thermal_status():
    return jsonify(get_runtime().thermal.status_payload())


@media_bp.route("/thermal/refresh", methods=["POST"])
def thermal_refresh():
    thermal = get_runtime().thermal
    detected = thermal.refresh_device(force=True)
    payload = thermal.status_payload()
    return jsonify({"ok": True, "detected": detected, "status": payload["status"]})


@media_bp.route("/thermal/frame")
def thermal_frame():
    frame, stats = get_runtime().thermal.frame()
    return current_app.response_class(
        frame,
        mimetype="image/jpeg",
        headers={"X-EASY-THERMAL-STATUS": stats.get("status", "unknown")},
    )


@media_bp.route("/thermal/last-frame")
def thermal_last_frame():
    frame, stats = get_runtime().thermal.last_frame()
    if frame is None:
        return current_app.response_class(status=204)
    return current_app.response_class(
        frame,
        mimetype="image/jpeg",
        headers={
            "Cache-Control": "no-store",
            "X-EASY-THERMAL-STATUS": stats.get("status", "cached"),
        },
    )


@media_bp.route("/thermal/snapshot", methods=["GET", "POST"])
@media_bp.route("/snapshot/thermal", methods=["GET", "POST"])
def thermal_snapshot():
    runtime = get_runtime()
    frame, stats = runtime.thermal.snapshot()
    meta = dict(stats)
    meta.update({"feed": "thermal", "snapshot_type": "thermal"})
    try:
        snapshot_info = runtime.snapshot_store.save("thermal", frame, meta=meta)
    except Exception as exc:
        runtime.logger.exception("Failed to save thermal snapshot")
        runtime.events.add("THERMAL_FLIR", "SNAPSHOT_ERROR", f"Snapshot failed: {exc}", "error", meta=meta)
        return _snapshot_error("thermal", "thermal_snapshot.jpg", "Unable to save thermal snapshot", {"url": "#", "download_url": "#"}, 503)
    try:
        runtime.acquisition_manager.record_snapshot(feed="thermal", snapshot=snapshot_info, meta=meta)
    except Exception:
        runtime.logger.exception("Failed to index thermal snapshot in session manifest")
    runtime.events.add("THERMAL_FLIR", "SNAPSHOT_SAVED", f"Saved {snapshot_info['filename']}", "info", meta=meta)
    if snapshot_info["meta"].get("status") in {"NOT_DETECTED", "DISABLED"}:
        return _snapshot_error("thermal", snapshot_info["filename"], "Thermal feed unavailable", snapshot_info, 503)
    return _snapshot_success("thermal", snapshot_info)


@media_bp.route("/api/acquisition/capture-set", methods=["POST"])
def capture_acquisition_set():
    """Capture RGB left/right and thermal as one dataset sample."""
    runtime = get_runtime()
    current = runtime.session_manager.get_current_session()
    if not current:
        return jsonify({"ok": False, "error": "Start a mission before capturing a synchronized sensor set"}), 409

    capture_set_id = f"capture-{uuid.uuid4().hex[:12]}"
    captures: Dict[str, Any] = {}
    for feed, side, source in (
        ("rgb_left", "left", "RGB_CAM_LEFT"),
        ("rgb_right", "right", "RGB_CAM_RIGHT"),
    ):
        meta = {
            "feed": feed,
            "source": source,
            "snapshot_type": "rgb",
            "capture_set_id": capture_set_id,
            "camera_state": runtime.rgb.camera_state(),
            "width": runtime.rgb.width,
            "height": runtime.rgb.height,
        }
        _frame, ok, snapshot_info, _meta = runtime.capture_snapshot(
            feed,
            lambda side=side: runtime.rgb.capture_snapshot(side),
            meta,
        )
        captures[feed] = {
            "ok": bool(ok and snapshot_info),
            "snapshot": snapshot_info,
            "error": None if ok else f"{feed} is unavailable",
        }

    try:
        thermal_frame, thermal_stats = runtime.thermal.snapshot()
        thermal_meta = dict(thermal_stats)
        thermal_meta.update({"feed": "thermal", "snapshot_type": "thermal", "capture_set_id": capture_set_id})
        thermal_info = runtime.snapshot_store.save("thermal", thermal_frame, meta=thermal_meta)
        runtime.acquisition_manager.record_snapshot(feed="thermal", snapshot=thermal_info, meta=thermal_meta)
        thermal_ok = thermal_info["meta"].get("status") not in {"NOT_DETECTED", "DISABLED"}
        captures["thermal"] = {
            "ok": thermal_ok,
            "snapshot": thermal_info,
            "error": None if thermal_ok else "Thermal sensor unavailable",
        }
    except Exception as exc:
        runtime.logger.exception("Failed to save coordinated thermal snapshot")
        captures["thermal"] = {"ok": False, "snapshot": None, "error": str(exc)}

    successful = sum(1 for item in captures.values() if item.get("ok"))
    manifest = runtime.session_manager.read_manifest(str(current.get("session_id") or ""))
    return jsonify(
        {
            "ok": successful > 0,
            "complete": successful == len(captures),
            "capture_set_id": capture_set_id,
            "sample_id": f"{current.get('session_id')}:capture:{capture_set_id}",
            "successful_feeds": successful,
            "total_feeds": len(captures),
            "captures": captures,
            "manifest_counts": manifest.get("counts", {}),
        }
    ), (200 if successful > 0 else 503)


@media_bp.route("/api/stream-state", methods=["GET"])
def stream_state():
    rgb = get_runtime().rgb
    return jsonify(
        {
            "rgb_left": {"enabled": rgb.enabled_feeds["rgb_left"], "state": rgb.latest_state()},
            "rgb_right": {"enabled": rgb.enabled_feeds["rgb_right"], "state": rgb.latest_state()},
        }
    )


@media_bp.route("/api/stream-state", methods=["POST"])
def set_stream_state():
    rgb = get_runtime().rgb
    payload = request.get_json(force=True, silent=True) or {}
    for feed_name in ("rgb_left", "rgb_right"):
        if feed_name in payload:
            rgb.set_enabled(feed_name, bool(payload[feed_name]))
    return jsonify({"ok": True, "rgb_left": rgb.enabled_feeds["rgb_left"], "rgb_right": rgb.enabled_feeds["rgb_right"]})

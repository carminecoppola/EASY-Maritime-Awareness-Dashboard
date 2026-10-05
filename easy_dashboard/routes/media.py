# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Live video, snapshots, thermal frames and paired acquisition.

    /video/rgb_*           MJPEG streams of the two RGB views (and start/stop)
    /api/focus/rgb_*       focus-assist score
    /snapshot/*            POST captures and stores one snapshot (GET answers 405)
    /snapshots/<feed>/...  serve stored snapshots; /api/snapshots/recent lists them
    /thermal/*             thermal status, frame, cached frame, refresh, snapshot
    /api/acquisition/capture-set   one stereo RGB frame plus one thermal frame

A snapshot is saved only when it comes from a real frame: placeholder images
(camera offline or starting) are reported as errors and never archived.
"""

from __future__ import annotations

import uuid
import time
from typing import Any, Dict

from flask import Blueprint, current_app, jsonify, request, send_file

from easy_dashboard.constants import SNAPSHOT_FEED_MAP
from easy_dashboard.routes import get_runtime


media_bp = Blueprint("media", __name__)


def _snapshot_error(feed: str, filename: str, error_message: str, snapshot_info: Dict[str, Any], status_code: int = 503):
    """JSON error response for a failed snapshot."""
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
    """JSON success response describing a stored snapshot."""
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
    """MJPEG stream of the left RGB view."""
    return get_runtime().rgb.stream_response("rgb_left", "left")


@media_bp.route("/video/rgb_right")
def video_rgb_right():
    """MJPEG stream of the right RGB view."""
    return get_runtime().rgb.stream_response("rgb_right", "right")


@media_bp.route("/video/rgb_left/start", methods=["POST"])
def start_rgb_left():
    """Enable the left RGB view."""
    runtime = get_runtime()
    runtime.rgb.set_enabled("rgb_left", True)
    return jsonify({"ok": True, "feed": "rgb_left", "enabled": True, "state": runtime.rgb.latest_state()})


@media_bp.route("/video/rgb_left/stop", methods=["POST"])
def stop_rgb_left():
    """Pause the left RGB view."""
    runtime = get_runtime()
    runtime.rgb.set_enabled("rgb_left", False)
    return jsonify({"ok": True, "feed": "rgb_left", "enabled": False, "state": runtime.rgb.latest_state()})


@media_bp.route("/video/rgb_right/start", methods=["POST"])
def start_rgb_right():
    """Enable the right RGB view."""
    runtime = get_runtime()
    runtime.rgb.set_enabled("rgb_right", True)
    return jsonify({"ok": True, "feed": "rgb_right", "enabled": True, "state": runtime.rgb.latest_state()})


@media_bp.route("/video/rgb_right/stop", methods=["POST"])
def stop_rgb_right():
    """Pause the right RGB view."""
    runtime = get_runtime()
    runtime.rgb.set_enabled("rgb_right", False)
    return jsonify({"ok": True, "feed": "rgb_right", "enabled": False, "state": runtime.rgb.latest_state()})


@media_bp.route("/api/focus/rgb_left")
def focus_rgb_left():
    """Sharpness score of the left view, to help focus the lens by hand."""
    return jsonify(get_runtime().rgb.focus_score("left"))


@media_bp.route("/api/focus/rgb_right")
def focus_rgb_right():
    """Sharpness score of the right view, to help focus the lens by hand."""
    return jsonify(get_runtime().rgb.focus_score("right"))


@media_bp.route("/api/snapshots/recent")
def api_snapshots_recent():
    """One page of stored snapshots (``limit`` 1-999, ``offset``) with per-feed totals."""
    runtime = get_runtime()
    try:
        limit = int(request.args.get("limit", 24))
        limit = max(1, min(limit, 999))  # Clamp between 1 and 999
    except (TypeError, ValueError):
        limit = 24
    try:
        offset = max(0, int(request.args.get("offset", 0)))
        offset = min(offset, 2**63 - 1)
    except (TypeError, ValueError):
        offset = 0
    summary = runtime.snapshot_store.summary()
    return jsonify(
        {
            "count": summary["count"],
            "items": runtime.snapshot_store.list_recent(limit, offset),
            "offset": offset,
            "limit": limit,
            "feeds": SNAPSHOT_FEED_MAP,
            "summary": summary,
        }
    )


@media_bp.route("/snapshots/<feed>/<path:filename>")
def serve_snapshot(feed: str, filename: str):
    """Serve a stored JPEG (or download it with ``?download=1``)."""
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


@media_bp.route("/snapshot/rgb_left", methods=["GET"])
@media_bp.route("/snapshot/rgb_right", methods=["GET"])
@media_bp.route("/snapshot/thermal", methods=["GET"])
@media_bp.route("/thermal/snapshot", methods=["GET"])
def snapshot_requires_post():
    # Explicit routes also prevent the SPA catch-all from returning HTML/200.
    """Answer 405 on GET so the SPA catch-all never returns HTML for a capture URL."""
    return jsonify({"ok": False, "error": "Use POST to capture a snapshot"}), 405, {"Allow": "POST, OPTIONS"}


@media_bp.route("/snapshot/rgb_left", methods=["POST"])
def snapshot_rgb_left():
    """Capture and store a left RGB snapshot (503 if the camera is offline)."""
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


@media_bp.route("/snapshot/rgb_right", methods=["POST"])
def snapshot_rgb_right():
    """Capture and store a right RGB snapshot (503 if the camera is offline)."""
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
    """Thermal status payload."""
    return jsonify(get_runtime().thermal.status_payload())


@media_bp.route("/thermal/refresh", methods=["POST"])
def thermal_refresh():
    """Force a new PureThermal discovery."""
    thermal = get_runtime().thermal
    detected = thermal.refresh_device(force=True)
    payload = thermal.status_payload()
    return jsonify({"ok": True, "detected": detected, "status": payload["status"]})


@media_bp.route("/thermal/frame")
def thermal_frame():
    """Current thermal JPEG (a status placeholder when unavailable)."""
    frame, stats = get_runtime().thermal.frame()
    return current_app.response_class(
        frame,
        mimetype="image/jpeg",
        headers={"X-EASY-THERMAL-STATUS": stats.get("status", "unknown")},
    )


@media_bp.route("/thermal/last-frame")
def thermal_last_frame():
    """Cached thermal preview without touching the device (204 when none)."""
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


@media_bp.route("/thermal/snapshot", methods=["POST"])
@media_bp.route("/snapshot/thermal", methods=["POST"])
def thermal_snapshot():
    """Capture and store a thermal snapshot.

    Only real or simulated frames are saved: ``ThermalState.frame`` returns a
    placeholder JPEG for DISABLED, NOT_DETECTED, ERROR and STARTING, and saving it
    would leave it in the archive as if it were a real capture.
    """
    runtime = get_runtime()
    frame, stats = runtime.thermal.snapshot()
    meta = dict(stats)
    meta.update({"feed": "thermal", "snapshot_type": "thermal"})
    # See capture_acquisition_set()'s thermal branch for why this checks an
    # explicit allowlist before saving rather than after: ThermalState.frame()
    # returns a placeholder JPEG for several status values (DISABLED,
    # NOT_DETECTED, ERROR, STARTING), and this route used to save it
    # unconditionally then only check {"NOT_DETECTED", "DISABLED"} afterwards
    # — an ERROR/STARTING placeholder ("THERMAL STARTING — Waiting for
    # thermal stream") got permanently saved into the archive as if it were
    # a real capture, only ever visible as an unexplained black/text image
    # in the Snapshots gallery.
    if stats.get("status") not in {"REAL", "MOCK"}:
        runtime.events.add("THERMAL_FLIR", "SNAPSHOT_ERROR", "Thermal feed unavailable", "error", meta=meta)
        return _snapshot_error("thermal", "thermal_snapshot.jpg", "Thermal feed unavailable", {"url": "#", "download_url": "#"}, 503)
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
    return _snapshot_success("thermal", snapshot_info)


@media_bp.route("/api/acquisition/capture-set", methods=["POST"])
def capture_acquisition_set():
    """Capture one atomic stereo frame and one paired thermal frame.

    Requires a running mission. Both RGB views come from the same master frame;
    the thermal frame follows it and the wall-clock skew between them is recorded
    (the pairing is *measured*, not hardware-synchronised). Placeholder frames are
    never saved.
    """
    runtime = get_runtime()
    current = runtime.session_manager.get_current_session()
    if not current:
        return jsonify({"ok": False, "error": "Start a mission before capturing a paired sensor set"}), 409

    capture_set_id = f"capture-{uuid.uuid4().hex[:12]}"
    captures: Dict[str, Any] = {}
    stereo = runtime.rgb.capture_stereo_frame()
    for feed, source, rgb_frame in (
        ("rgb_left", "RGB_CAM_LEFT", stereo.left_jpeg if stereo else b""),
        ("rgb_right", "RGB_CAM_RIGHT", stereo.right_jpeg if stereo else b""),
    ):
        meta = {
            "feed": feed,
            "source": source,
            "snapshot_type": "rgb",
            "capture_set_id": capture_set_id,
            "camera_state": runtime.rgb.camera_state(),
            "width": runtime.rgb.width,
            "height": runtime.rgb.height,
            "rgb_master_seq": stereo.sequence if stereo else None,
            "received_wall_ts": stereo.received_wall_ts if stereo else None,
            "received_monotonic_ns": stereo.received_monotonic_ns if stereo else None,
            "pairing_status": "pending_thermal" if stereo else "missing_rgb",
            "hardware_synchronized": False,
        }
        _frame, ok, snapshot_info, _meta = runtime.capture_snapshot(
            feed,
            lambda frame=rgb_frame, available=stereo is not None: (frame, available),
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
        thermal_wall_ts = float(thermal_stats.get("snapshot_ts") or thermal_stats.get("last_frame_ts") or time.time())
        skew_ms = round((thermal_wall_ts - stereo.received_wall_ts) * 1000.0, 3) if stereo else None
        pairing_status = "paired_unmeasured" if stereo else "missing_rgb"
        thermal_meta.update({
            "feed": "thermal",
            "snapshot_type": "thermal",
            "capture_set_id": capture_set_id,
            "rgb_master_seq": stereo.sequence if stereo else None,
            "thermal_frame_seq": thermal_stats.get("frame_seq"),
            "rgb_received_wall_ts": stereo.received_wall_ts if stereo else None,
            "thermal_received_wall_ts": thermal_wall_ts,
            "observed_wall_skew_ms": skew_ms,
            "pairing_status": pairing_status,
            "synchronization_method": "sequential_capture_wall_clock",
            "hardware_synchronized": False,
        })
        # ThermalState.frame() falls back to a placeholder JPEG ("THERMAL
        # DISABLED"/"THERMAL OFFLINE"/"THERMAL STARTING") for several status
        # values, not just NOT_DETECTED/DISABLED — the same class of bug as
        # the RGB snapshot path (runtime.capture_snapshot): saving it
        # unconditionally left placeholder images permanently visible in the
        # snapshot gallery as if they were real thermal captures. Checking
        # an explicit allowlist of "this is a real frame" statuses (REAL from
        # a genuine capture, MOCK from the deliberate mock-mode simulator) is
        # more robust than excluding known-bad values one at a time.
        thermal_ok = thermal_stats.get("status") in {"REAL", "MOCK"}
        if thermal_ok:
            thermal_info = runtime.snapshot_store.save("thermal", thermal_frame, meta=thermal_meta)
            runtime.acquisition_manager.record_snapshot(feed="thermal", snapshot=thermal_info, meta=thermal_meta)
        else:
            thermal_info = None
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
            "pairing": {
                "status": pairing_status if 'pairing_status' in locals() else "missing_thermal",
                "observed_wall_skew_ms": skew_ms if 'skew_ms' in locals() else None,
                "hardware_synchronized": False,
            },
        }
    ), (200 if successful > 0 else 503)


@media_bp.route("/api/stream-state", methods=["GET"])
def stream_state():
    """Enabled flag and state of each RGB view."""
    rgb = get_runtime().rgb
    return jsonify(
        {
            "rgb_left": {"enabled": rgb.enabled_feeds["rgb_left"], "state": rgb.latest_state()},
            "rgb_right": {"enabled": rgb.enabled_feeds["rgb_right"], "state": rgb.latest_state()},
        }
    )


@media_bp.route("/api/stream-state", methods=["POST"])
def set_stream_state():
    """Enable or pause the RGB views."""
    rgb = get_runtime().rgb
    payload = request.get_json(force=True, silent=True) or {}
    for feed_name in ("rgb_left", "rgb_right"):
        if feed_name in payload:
            rgb.set_enabled(feed_name, bool(payload[feed_name]))
    return jsonify({"ok": True, "rgb_left": rgb.enabled_feeds["rgb_left"], "rgb_right": rgb.enabled_feeds["rgb_right"]})

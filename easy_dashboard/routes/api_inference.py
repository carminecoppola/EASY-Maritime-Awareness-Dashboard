# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Inference, detection, event, mission (session) and dataset endpoints.

    /api/inference/*       start/stop the worker, run on an image or the next frame, preview
    /api/frame-provider/*  configure and step the frame source
    /api/detection(s)/*    current detections, history, detail, clear
    /api/events/*          mission events (current, history, detail, clear)
    /api/session/*         start/stop a mission, status, manifest, list
    /api/acquisition/*     acquisition summary of the running mission
    /api/dataset/*         validate, export, retention and download of datasets
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from flask import Blueprint, jsonify, request, send_file

from easy_dashboard.routes import get_runtime
from easy_dashboard.inference_worker import find_first_image


api_inference_bp = Blueprint("api_inference", __name__)


def _inference_json(payload: Dict[str, Any], status_code: int = 200):
    """JSON response with an explicit status code."""
    return jsonify(payload), status_code


def _parse_json_payload() -> Dict[str, Any]:
    """JSON body as a dictionary (empty when missing or invalid)."""
    return request.get_json(force=True, silent=True) or {}


@api_inference_bp.route("/api/inference/status", methods=["GET"])
def api_inference_status():
    """Worker status merged with the current detections and the frame provider."""
    return jsonify(get_runtime().inference_status_payload())


@api_inference_bp.route("/api/frame-provider/status", methods=["GET"])
def api_frame_provider_status():
    """Frame provider status."""
    return jsonify(get_runtime().inference.frame_provider_status())


@api_inference_bp.route("/api/frame-provider/configure", methods=["POST"])
def api_frame_provider_configure():
    """Change the frame source (type, path, name, loop, temporary frames)."""
    inference = get_runtime().inference
    payload = _parse_json_payload()
    result = inference.configure_frame_provider(
        source_type=payload.get("source_type"),
        source_path=payload.get("source_path"),
        source_name=payload.get("source_name"),
        loop=payload.get("loop"),
        save_temp_frames=payload.get("save_temp_frames"),
    )
    return jsonify(result), 200 if result.get("ok") else 400


@api_inference_bp.route("/api/frame-provider/reset", methods=["POST"])
def api_frame_provider_reset():
    """Rewind the frame provider."""
    return jsonify(get_runtime().inference.reset_frame_provider())


@api_inference_bp.route("/api/frame-provider/next-frame", methods=["POST"])
def api_frame_provider_next_frame():
    """Fetch the next frame without running inference."""
    inference = get_runtime().inference
    try:
        return jsonify(inference.next_frame())
    except Exception as exc:
        return _inference_json({"ok": False, "error": str(exc), "provider": inference.frame_provider_status()}, 400)


@api_inference_bp.route("/api/inference/start", methods=["POST"])
def api_inference_start():
    """Start the background inference loop (``mode``, ``interval_seconds``); 503 if it cannot start."""
    inference = get_runtime().inference
    payload = _parse_json_payload()
    mode = str(payload.get("mode", "replay"))
    interval_seconds = payload.get("interval_seconds")
    try:
        interval_seconds = None if interval_seconds is None else float(interval_seconds)
    except Exception:
        return _inference_json({"ok": False, "error": "Invalid interval_seconds value"}, 400)
    result = inference.start(mode=mode, interval_seconds=interval_seconds)
    return _inference_json(result, 200 if result.get("ok") else 503)


@api_inference_bp.route("/api/inference/stop", methods=["POST"])
def api_inference_stop():
    """Stop the background inference loop."""
    return jsonify(get_runtime().inference.stop())


@api_inference_bp.route("/api/inference/run-on-image", methods=["POST"])
def api_inference_run_on_image():
    """Run one inference on an image path inside the allowed folders (default: first replay image)."""
    inference = get_runtime().inference
    payload = _parse_json_payload()
    image_path = payload.get("image_path") or payload.get("path") or request.args.get("image_path") or request.args.get("path")
    if image_path is None:
        try:
            image_path = str(find_first_image(inference.replay_dir))
        except Exception:
            return _inference_json({"ok": False, "error": f"No replay images found in {inference.replay_dir}"}, 404)
    result = inference.run_on_image(image_path)
    return _inference_json(result, 200 if result.get("ok") else 400)


@api_inference_bp.route("/api/inference/run-on-next-frame", methods=["POST"])
def api_inference_run_on_next_frame():
    """Run one inference on the next frame of the selected source."""
    inference = get_runtime().inference
    try:
        result = inference.run_on_next_frame()
    except Exception as exc:
        return _inference_json({"ok": False, "error": str(exc), "provider": inference.frame_provider_status()}, 400)
    return _inference_json(result, 200 if result.get("ok") else 400)


@api_inference_bp.route("/api/detections/current", methods=["GET"])
@api_inference_bp.route("/api/detection/current", methods=["GET"])
def api_detection_current():
    """Detections of the latest inference."""
    return jsonify(get_runtime().detection_manager.get_current_detections())


@api_inference_bp.route("/api/detection/history", methods=["GET"])
def api_detection_history():
    """Every detection recorded so far."""
    return jsonify(get_runtime().detection_manager.get_history())


@api_inference_bp.route("/api/detection/<detection_id>", methods=["GET"])
def api_detection_detail(detection_id: str):
    """One detection by id (404 if unknown)."""
    detection = get_runtime().detection_manager.get_detection(detection_id)
    if not detection:
        return jsonify({"ok": False, "error": "Detection not found", "id": detection_id}), 404
    return jsonify({"ok": True, "detection": detection})


@api_inference_bp.route("/api/detection/clear", methods=["DELETE", "POST"])
def api_detection_clear():
    """Forget all detections."""
    return jsonify(get_runtime().detection_manager.clear())


@api_inference_bp.route("/api/events/current", methods=["GET"])
def api_events_current():
    """Open mission events."""
    return jsonify(get_runtime().event_manager.get_current_events())


@api_inference_bp.route("/api/events/history", methods=["GET"])
def api_events_history():
    """All mission events."""
    return jsonify(get_runtime().event_manager.get_history())


@api_inference_bp.route("/api/events/<event_id>", methods=["GET"])
def api_event_detail(event_id: str):
    """One event by id (404 if unknown)."""
    event_payload = get_runtime().event_manager.get_event(event_id)
    if not event_payload:
        return jsonify({"ok": False, "error": "Event not found", "id": event_id}), 404
    return jsonify({"ok": True, "event": event_payload})


@api_inference_bp.route("/api/events/clear", methods=["DELETE", "POST"])
def api_events_clear():
    """Forget all mission events."""
    return jsonify(get_runtime().event_manager.clear())


@api_inference_bp.route("/api/session/start", methods=["POST"])
def api_session_start():
    """Start a mission, recording the model in use in its metadata."""
    runtime = get_runtime()
    payload = _parse_json_payload()
    result = runtime.session_manager.start_session(
        mode=str(payload.get("mode") or "replay"),
        operator=str(payload.get("operator") or "operator"),
        model_name=Path(str(runtime.inference.model_path)).name,
        model_type=str(runtime.inference.backend or "onnx"),
        notes=str(payload.get("notes") or ""),
    )
    return jsonify(result), 200 if result.get("ok") else 400


@api_inference_bp.route("/api/session/stop", methods=["POST"])
def api_session_stop():
    """Stop the mission, close its events and clear the live detection overlay."""
    runtime = get_runtime()
    current = runtime.session_manager.get_current_session()
    session_id = str(current.get("session_id") or "") if current else ""
    result = runtime.session_manager.stop_session()
    if session_id:
        try:
            runtime.event_manager.resolve_session_events(session_id, notes="Session stopped")
        except Exception:
            pass
    try:
        # Without this, the "current" detections of the last inference would stay
        # visible as an overlay on the live feed after the session that produced
        # them (often a replay) has ended, suggesting the system is detecting
        # real objects that are not there.
        runtime.detection_manager.clear()
    except Exception:
        pass
    return jsonify(result)


@api_inference_bp.route("/api/session/status", methods=["GET"])
def api_session_status():
    """Mission status (running, current, latest, recent)."""
    return jsonify(get_runtime().session_manager.status())


@api_inference_bp.route("/api/session/manifest", methods=["GET"])
def api_session_manifest():
    """Manifest of a mission (default: running or latest)."""
    runtime = get_runtime()
    session_id = request.args.get("session_id")
    return jsonify(runtime.session_manager.read_manifest(session_id))


@api_inference_bp.route("/api/acquisition/status", methods=["GET"])
def api_acquisition_status():
    """Acquisition summary: manifest counts and dataset summary."""
    return jsonify(get_runtime().acquisition_manager.status())


@api_inference_bp.route("/api/dataset/validate", methods=["GET"])
def api_dataset_validate():
    """Check which samples of a mission can be exported."""
    return jsonify(get_runtime().dataset_exporter.validate(request.args.get("session_id")))


@api_inference_bp.route("/api/dataset/export", methods=["POST"])
def api_dataset_export():
    """Export the valid samples of a mission as a dataset archive."""
    payload = _parse_json_payload()
    try:
        validation_percent = int(payload.get("validation_percent", 20))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "validation_percent must be an integer"}), 400
    result = get_runtime().dataset_exporter.export(
        payload.get("session_id"),
        validation_percent=validation_percent,
    )
    return jsonify(result), 200 if result.get("ok") else 400


@api_inference_bp.route("/api/dataset/export/status", methods=["GET"])
def api_dataset_export_status():
    """Export folder, last export, disk usage and retention plan."""
    return jsonify(get_runtime().dataset_exporter.status())


@api_inference_bp.route("/api/dataset/export/retention", methods=["GET", "POST"])
def api_dataset_export_retention():
    """GET shows the retention plan; POST with ``confirm=true`` applies it (keeps the latest ``keep_latest`` exports)."""
    payload = _parse_json_payload() if request.method == "POST" else {}
    raw_keep = payload.get("keep_latest", request.args.get("keep_latest", 5))
    try:
        keep_latest = int(raw_keep)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "keep_latest must be an integer"}), 400
    exporter = get_runtime().dataset_exporter
    if request.method == "GET":
        return jsonify({"ok": True, "plan": exporter.retention_plan(keep_latest=keep_latest)})
    if payload.get("confirm") is not True:
        return jsonify({"ok": False, "error": "Set confirm=true to apply the retention policy", "plan": exporter.retention_plan(keep_latest=keep_latest)}), 400
    return jsonify(exporter.apply_retention(keep_latest=keep_latest))


@api_inference_bp.route("/api/dataset/export/download", methods=["GET"])
def api_dataset_export_download():
    """Download the latest export as a ZIP (404 if none)."""
    latest = get_runtime().dataset_exporter.status().get("last_export") or {}
    archive_path = Path(str(latest.get("archive_path") or ""))
    if not archive_path.is_file():
        return jsonify({"ok": False, "error": "No export is available"}), 404
    return send_file(archive_path, mimetype="application/zip", as_attachment=True, download_name=archive_path.name)


@api_inference_bp.route("/api/session/current", methods=["GET"])
def api_session_current():
    """The running mission, if any."""
    current = get_runtime().session_manager.get_current_session()
    return jsonify({"ok": True, "running": bool(current), "session": current})


@api_inference_bp.route("/api/session/list", methods=["GET"])
def api_session_list():
    """All missions, newest first."""
    return jsonify(get_runtime().session_manager.list_sessions())


@api_inference_bp.route("/api/inference/preview", methods=["GET"])
def api_inference_preview():
    """Annotated preview image of the latest inference (never cached)."""
    preview_path = get_runtime().inference.current_preview_path
    if not preview_path.exists():
        return jsonify({"ok": False, "error": "Detection preview not available yet"}), 404
    response = send_file(preview_path, mimetype="image/jpeg", as_attachment=False, conditional=True)
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return response

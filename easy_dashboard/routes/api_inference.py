from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from flask import Blueprint, jsonify, request, send_file

from easy_dashboard.routes import get_runtime
from inference_worker import find_first_image


api_inference_bp = Blueprint("api_inference", __name__)


def _inference_json(payload: Dict[str, Any], status_code: int = 200):
    return jsonify(payload), status_code


def _parse_json_payload() -> Dict[str, Any]:
    return request.get_json(force=True, silent=True) or {}


@api_inference_bp.route("/api/inference/status", methods=["GET"])
def api_inference_status():
    return jsonify(get_runtime().inference_status_payload())


@api_inference_bp.route("/api/frame-provider/status", methods=["GET"])
def api_frame_provider_status():
    return jsonify(get_runtime().inference.frame_provider_status())


@api_inference_bp.route("/api/frame-provider/configure", methods=["POST"])
def api_frame_provider_configure():
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
    return jsonify(get_runtime().inference.reset_frame_provider())


@api_inference_bp.route("/api/frame-provider/next-frame", methods=["POST"])
def api_frame_provider_next_frame():
    inference = get_runtime().inference
    try:
        return jsonify(inference.next_frame())
    except Exception as exc:
        return _inference_json({"ok": False, "error": str(exc), "provider": inference.frame_provider_status()}, 400)


@api_inference_bp.route("/api/inference/start", methods=["POST"])
def api_inference_start():
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
    return jsonify(get_runtime().inference.stop())


@api_inference_bp.route("/api/inference/run-on-image", methods=["POST"])
def api_inference_run_on_image():
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
    inference = get_runtime().inference
    try:
        result = inference.run_on_next_frame()
    except Exception as exc:
        return _inference_json({"ok": False, "error": str(exc), "provider": inference.frame_provider_status()}, 400)
    return _inference_json(result, 200 if result.get("ok") else 400)


@api_inference_bp.route("/api/detections/current", methods=["GET"])
@api_inference_bp.route("/api/detection/current", methods=["GET"])
def api_detection_current():
    return jsonify(get_runtime().detection_manager.get_current_detections())


@api_inference_bp.route("/api/detection/history", methods=["GET"])
def api_detection_history():
    return jsonify(get_runtime().detection_manager.get_history())


@api_inference_bp.route("/api/detection/<detection_id>", methods=["GET"])
def api_detection_detail(detection_id: str):
    detection = get_runtime().detection_manager.get_detection(detection_id)
    if not detection:
        return jsonify({"ok": False, "error": "Detection not found", "id": detection_id}), 404
    return jsonify({"ok": True, "detection": detection})


@api_inference_bp.route("/api/detection/clear", methods=["DELETE", "POST"])
def api_detection_clear():
    return jsonify(get_runtime().detection_manager.clear())


@api_inference_bp.route("/api/events/current", methods=["GET"])
def api_events_current():
    return jsonify(get_runtime().event_manager.get_current_events())


@api_inference_bp.route("/api/events/history", methods=["GET"])
def api_events_history():
    return jsonify(get_runtime().event_manager.get_history())


@api_inference_bp.route("/api/events/<event_id>", methods=["GET"])
def api_event_detail(event_id: str):
    event_payload = get_runtime().event_manager.get_event(event_id)
    if not event_payload:
        return jsonify({"ok": False, "error": "Event not found", "id": event_id}), 404
    return jsonify({"ok": True, "event": event_payload})


@api_inference_bp.route("/api/events/clear", methods=["DELETE", "POST"])
def api_events_clear():
    return jsonify(get_runtime().event_manager.clear())


@api_inference_bp.route("/api/session/start", methods=["POST"])
def api_session_start():
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
    runtime = get_runtime()
    current = runtime.session_manager.get_current_session()
    session_id = str(current.get("session_id") or "") if current else ""
    result = runtime.session_manager.stop_session()
    if session_id:
        try:
            runtime.event_manager.resolve_session_events(session_id, notes="Session stopped")
        except Exception:
            pass
    return jsonify(result)


@api_inference_bp.route("/api/session/status", methods=["GET"])
def api_session_status():
    return jsonify(get_runtime().session_manager.status())


@api_inference_bp.route("/api/session/current", methods=["GET"])
def api_session_current():
    current = get_runtime().session_manager.get_current_session()
    return jsonify({"ok": True, "running": bool(current), "session": current})


@api_inference_bp.route("/api/session/list", methods=["GET"])
def api_session_list():
    return jsonify(get_runtime().session_manager.list_sessions())


@api_inference_bp.route("/api/inference/preview", methods=["GET"])
def api_inference_preview():
    preview_path = get_runtime().inference.current_preview_path
    if not preview_path.exists():
        return jsonify({"ok": False, "error": "Detection preview not available yet"}), 404
    response = send_file(preview_path, mimetype="image/jpeg", as_attachment=False, conditional=True)
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return response


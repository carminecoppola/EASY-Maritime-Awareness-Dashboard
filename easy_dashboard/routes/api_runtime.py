from __future__ import annotations

from flask import Blueprint, jsonify, request

from easy_dashboard.presentation import build_camera_inventory, build_system_payload
from easy_dashboard.routes import get_runtime


api_runtime_bp = Blueprint("api_runtime", __name__)


@api_runtime_bp.route("/health")
def health():
    return jsonify(get_runtime().health_payload())


@api_runtime_bp.route("/health/ready")
def health_ready():
    payload = get_runtime().readiness_payload()
    ready = bool(payload.get("ok")) and payload.get("orchestrator_status") == "RUNNING"
    return jsonify(payload), 200 if ready else 503


@api_runtime_bp.route("/api/dashboard/state", methods=["GET"])
def api_dashboard_state():
    return jsonify(get_runtime().dashboard_state_payload())


@api_runtime_bp.route("/api/status/summary", methods=["GET"])
def api_status_summary():
    return jsonify(get_runtime().status_summary_payload())


@api_runtime_bp.route("/system")
def system():
    runtime = get_runtime()
    return jsonify(build_system_payload(runtime.probe))


@api_runtime_bp.route("/cameras")
def cameras():
    runtime = get_runtime()
    return jsonify(build_camera_inventory(runtime.rgb, runtime.thermal))


@api_runtime_bp.route("/events")
def events_endpoint():
    limit = int(request.args.get("limit", 50))
    return jsonify(get_runtime().events_payload(limit))


@api_runtime_bp.route("/api/sources", methods=["GET"])
@api_runtime_bp.route("/api/sources/status", methods=["GET"])
def api_sources_status():
    return jsonify(get_runtime().source_manager.get_status())


@api_runtime_bp.route("/api/sources/<source_id>", methods=["GET"])
def api_source_detail(source_id: str):
    source = get_runtime().source_manager.get_source(source_id)
    if not source:
        return jsonify({"ok": False, "error": "Source not found", "id": source_id}), 404
    return jsonify({"ok": True, "source": source})


@api_runtime_bp.route("/api/sources/refresh", methods=["POST"])
def api_sources_refresh():
    runtime = get_runtime()
    payload = request.get_json(force=True, silent=True) or {}
    source_id = payload.get("source_id") or payload.get("id")
    if source_id:
        return jsonify(runtime.source_manager.refresh_status(str(source_id)))
    return jsonify(runtime.source_manager.refresh_status())


@api_runtime_bp.route("/api/sources/select", methods=["POST"])
def api_sources_select():
    runtime = get_runtime()
    payload = request.get_json(force=True, silent=True) or {}
    source_id = str(payload.get("source_id") or payload.get("id") or "").strip()
    if not source_id:
        return jsonify({"ok": False, "error": "source_id is required"}), 400
    candidate = runtime.source_manager.get_source(source_id)
    if candidate and not bool((candidate.get("capabilities") or {}).get("inference")):
        return jsonify({"ok": False, "error": f"Source {candidate.get('name') or source_id} is not compatible with the RGB model"}), 409
    result = runtime.source_manager.select_source(source_id)
    if result.get("ok") is False:
        return jsonify(result), 404
    try:
        result["frame_provider"] = runtime.inference.sync_selected_source()
    except Exception as exc:
        return jsonify({**result, "ok": False, "error": str(exc)}), 409
    return jsonify(result)


@api_runtime_bp.route("/api/devices", methods=["GET"])
@api_runtime_bp.route("/api/devices/status", methods=["GET"])
def api_devices_status():
    return jsonify(get_runtime().device_manager.get_status())


@api_runtime_bp.route("/api/devices/<device_id>", methods=["GET"])
def api_device_detail(device_id: str):
    device = get_runtime().device_manager.get_device(device_id)
    if not device:
        return jsonify({"ok": False, "error": "Device not found", "id": device_id}), 404
    return jsonify({"ok": True, "device": device})


@api_runtime_bp.route("/api/devices/refresh", methods=["POST"])
def api_devices_refresh():
    runtime = get_runtime()
    payload = request.get_json(force=True, silent=True) or {}
    device_id = payload.get("device_id") or payload.get("id")
    if device_id:
        return jsonify(runtime.device_manager.refresh(str(device_id)))
    return jsonify(runtime.device_manager.refresh())


@api_runtime_bp.route("/api/system/status", methods=["GET"])
def api_system_status():
    return jsonify(get_runtime().orchestrator.health())


@api_runtime_bp.route("/api/system/components", methods=["GET"])
def api_system_components():
    return jsonify(get_runtime().orchestrator.components())


@api_runtime_bp.route("/api/system/restart", methods=["POST"])
def api_system_restart():
    return jsonify(get_runtime().orchestrator.restart())

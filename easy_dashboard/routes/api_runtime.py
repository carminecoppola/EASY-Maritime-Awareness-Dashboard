# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Runtime, health and device/source management endpoints.

``/health`` is the full diagnostic payload; ``/health/ready`` is the lightweight
probe used by the systemd service and the Mac launcher (HTTP 200 only when the
runtime is RUNNING and healthy, 503 otherwise).
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from easy_dashboard.presentation import build_camera_inventory, build_system_payload
from easy_dashboard.routes import get_runtime


api_runtime_bp = Blueprint("api_runtime", __name__)


@api_runtime_bp.route("/health")
def health():
    """Full diagnostic payload (system, components, sensors, inference, session)."""
    return jsonify(get_runtime().health_payload())


@api_runtime_bp.route("/health/ready")
def health_ready():
    """Readiness probe: 200 when the runtime is healthy and RUNNING, otherwise 503."""
    payload = get_runtime().readiness_payload()
    ready = bool(payload.get("ok")) and payload.get("orchestrator_status") == "RUNNING"
    return jsonify(payload), 200 if ready else 503


@api_runtime_bp.route("/api/dashboard/state", methods=["GET"])
def api_dashboard_state():
    """Everything the SPA polls, in one response."""
    return jsonify(get_runtime().dashboard_state_payload())


@api_runtime_bp.route("/api/status/summary", methods=["GET"])
def api_status_summary():
    """Compact operator-facing status."""
    return jsonify(get_runtime().status_summary_payload())


@api_runtime_bp.route("/system")
def system():
    """Host information (model, OS, CPU, memory, disk, uptime)."""
    runtime = get_runtime()
    return jsonify(build_system_payload(runtime.probe))


@api_runtime_bp.route("/cameras")
def cameras():
    """Camera hardware inventory."""
    runtime = get_runtime()
    return jsonify(build_camera_inventory(runtime.rgb, runtime.thermal))


@api_runtime_bp.route("/events")
def events_endpoint():
    """Recent events; ``limit`` is clamped to 1-200 (default 50)."""
    try:
        limit = int(request.args.get("limit", 50))
        limit = max(1, min(limit, 200))  # Clamp between 1 and 200
    except (TypeError, ValueError):
        limit = 50
    return jsonify(get_runtime().events_payload(limit))


@api_runtime_bp.route("/api/sources", methods=["GET"])
@api_runtime_bp.route("/api/sources/status", methods=["GET"])
def api_sources_status():
    """All frame sources and the selected one."""
    return jsonify(get_runtime().source_manager.get_status())


@api_runtime_bp.route("/api/sources/<source_id>", methods=["GET"])
def api_source_detail(source_id: str):
    """One source by id (404 if unknown)."""
    source = get_runtime().source_manager.get_source(source_id)
    if not source:
        return jsonify({"ok": False, "error": "Source not found", "id": source_id}), 404
    return jsonify({"ok": True, "source": source})


@api_runtime_bp.route("/api/sources/refresh", methods=["POST"])
def api_sources_refresh():
    """Refresh the status of one source (``source_id``) or of all of them."""
    runtime = get_runtime()
    payload = request.get_json(force=True, silent=True) or {}
    source_id = payload.get("source_id") or payload.get("id")
    if source_id:
        return jsonify(runtime.source_manager.refresh_status(str(source_id)))
    return jsonify(runtime.source_manager.refresh_status())


@api_runtime_bp.route("/api/sources/select", methods=["POST"])
def api_sources_select():
    """Select the active source.

    Sources the RGB model cannot read (thermal) are refused with 409; the frame
    provider is re-synchronised to the new selection.
    """
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
    """All devices and their status."""
    return jsonify(get_runtime().device_manager.get_status())


@api_runtime_bp.route("/api/devices/<device_id>", methods=["GET"])
def api_device_detail(device_id: str):
    """One device by id (404 if unknown)."""
    device = get_runtime().device_manager.get_device(device_id)
    if not device:
        return jsonify({"ok": False, "error": "Device not found", "id": device_id}), 404
    return jsonify({"ok": True, "device": device})


@api_runtime_bp.route("/api/devices/refresh", methods=["POST"])
def api_devices_refresh():
    """Refresh one device (``device_id``) or all of them."""
    runtime = get_runtime()
    payload = request.get_json(force=True, silent=True) or {}
    device_id = payload.get("device_id") or payload.get("id")
    if device_id:
        return jsonify(runtime.device_manager.refresh(str(device_id)))
    return jsonify(runtime.device_manager.refresh())


@api_runtime_bp.route("/api/system/status", methods=["GET"])
def api_system_status():
    """Overall orchestrator health."""
    return jsonify(get_runtime().orchestrator.health())


@api_runtime_bp.route("/api/system/components", methods=["GET"])
def api_system_components():
    """Status of every supervised component."""
    return jsonify(get_runtime().orchestrator.components())


@api_runtime_bp.route("/api/system/restart", methods=["POST"])
def api_system_restart():
    """Restart the runtime (stop then start). Admin with step-up when authentication is enforced."""
    return jsonify(get_runtime().orchestrator.restart())

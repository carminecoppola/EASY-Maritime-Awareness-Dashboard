from __future__ import annotations

import logging
import subprocess
import time
from typing import Any, Dict, Optional

import psutil
from flask import render_template

from .constants import NAV_ITEMS, PROJECT_ROOT
from .hardware import RgbMasterSource, SystemProbe, ThermalState
from .stores import EventStore
from .utils import get_boot_seconds, human_uptime, which


LOGGER = logging.getLogger("easy-dashboard")


def run_preflight_script() -> None:
    script = PROJECT_ROOT / "preflight_check.sh"
    if not script.exists():
        LOGGER.warning("Preflight script missing: %s", script)
        return
    try:
        subprocess.run(["bash", str(script)], cwd=PROJECT_ROOT, check=False)
    except Exception:
        LOGGER.exception("Failed to run preflight script")


def append_startup_notice(events: EventStore, probe: SystemProbe, config: Dict[str, Any]) -> None:
    events.add("SYSTEM", "STARTUP", f"EASY dashboard starting on {probe.hostname()} at {probe.ip_address()}", "info")
    events.add("SYSTEM", "CONFIG", f"RGB mode {config['rgb'].get('mode')} | thermal mode {config['thermal'].get('mode')}", "info")


def build_camera_inventory(rgb: RgbMasterSource, thermal: ThermalState) -> Dict[str, Any]:
    camera_entries = []
    for line in rgb.camera_list_output.splitlines():
        line = line.strip()
        if line and ":" in line and "Available cameras" not in line:
            camera_entries.append(line)
    rgb_state = rgb.latest_state()
    return {
        "uc512_multiplexer": {
            "logical_name": "UC512_MULTIPLEXER",
            "hardware_name": "Arducam CamArray UC-512",
            "state": rgb_state["camera_state"],
            "status": rgb_state["status"],
            "message": rgb_state["message"],
        },
        "rgb_cameras": [
            {
                "logical_name": "RGB_CAM_LEFT",
                "hardware_name": "Arducam UC-517 LEFT",
                "state": rgb_state["camera_state"],
                "fps": rgb_state["fps"],
                "last_acquisition_ts": rgb_state["last_frame_ts"],
                "error": rgb_state["error"],
                "enabled": rgb.enabled_feeds["rgb_left"],
                "message": rgb_state["message"],
            },
            {
                "logical_name": "RGB_CAM_RIGHT",
                "hardware_name": "Arducam UC-517 RIGHT",
                "state": rgb_state["camera_state"],
                "fps": rgb_state["fps"],
                "last_acquisition_ts": rgb_state["last_frame_ts"],
                "error": rgb_state["error"],
                "enabled": rgb.enabled_feeds["rgb_right"],
                "message": rgb_state["message"],
            },
        ],
        "thermal_camera": {
            "logical_name": "THERMAL_FLIR",
            "hardware_name": "FLIR/Lepton Thermal Sensor",
            "state": "DETECTED" if thermal.detected or thermal.mode == "mock" else "OFFLINE",
            "mode": thermal.mode,
            "status": thermal.status_payload(),
        },
        "camera_tools": SystemProbe().camera_tools(),
        "raw_libcamera_output": rgb.camera_list_output,
        "camera_entries": camera_entries,
    }


def build_operations_payload(
    camera_inventory: Dict[str, Any],
    rgb_state: Dict[str, Any],
    thermal_state: Dict[str, Any],
    inference_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    def _stream_status(state: Any, last_ts: Any, *, detected: bool, mode: str = "") -> str:
        state_value = str(state or "").upper()
        mode_value = str(mode or "").lower()
        if mode_value == "mock":
            return "ONLINE"
        if state_value in {"ERROR", "FAILED", "DISABLED", "OFFLINE"}:
            return "OFFLINE"
        if state_value == "NOT_DETECTED":
            return "NOT_DETECTED"
        if detected and last_ts:
            try:
                if time.time() - float(last_ts) <= 5.0:
                    return "ONLINE"
            except Exception:
                pass
            return "OFFLINE"
        return "NOT_DETECTED" if not detected else "OFFLINE"

    rgb_cameras = camera_inventory.get("rgb_cameras", [])
    rgb_left_status = _stream_status(
        rgb_cameras[0]["state"] if rgb_cameras else rgb_state.get("camera_state", "--"),
        rgb_cameras[0].get("last_acquisition_ts") if rgb_cameras else rgb_state.get("last_frame_ts"),
        detected=bool(rgb_cameras[0].get("enabled", True) if rgb_cameras else rgb_state.get("detected")),
    )
    rgb_right_status = _stream_status(
        rgb_cameras[1]["state"] if len(rgb_cameras) > 1 else rgb_state.get("camera_state", "--"),
        rgb_cameras[1].get("last_acquisition_ts") if len(rgb_cameras) > 1 else rgb_state.get("last_frame_ts"),
        detected=bool(rgb_cameras[1].get("enabled", True) if len(rgb_cameras) > 1 else rgb_state.get("detected")),
    )
    thermal_status = _stream_status(
        thermal_state.get("status", "--"),
        thermal_state.get("last_frame_ts"),
        detected=bool(thermal_state.get("detected")),
        mode=str(thermal_state.get("mode", "")).lower(),
    )
    detected_sensors = int(bool(rgb_state.get("detected"))) + int(bool(thermal_state.get("detected") or thermal_state.get("mode") == "mock"))
    online_sensors = int(rgb_left_status == "ONLINE") + int(rgb_right_status == "ONLINE") + int(thermal_status == "ONLINE")
    inference_state = inference_state or {}
    inference_ok = bool(inference_state.get("ok"))
    inference_running = bool(inference_state.get("running"))
    inference_count = int(inference_state.get("count") or 0)
    inference_error = str(inference_state.get("error") or inference_state.get("config_error") or "")
    last_detections = inference_state.get("last_detections")
    if not isinstance(last_detections, list):
        last_detections = []
    attention_level = "LOW"
    attention_reason = "AI inference ready in Replay/Demo mode." if inference_ok else "No active detections pipeline connected."
    attention_tone = "muted"
    if inference_count > 0:
        attention_level = "ELEVATED"
        attention_reason = f"AI detected {inference_count} object{'s' if inference_count != 1 else ''} in the latest replay image."
        attention_tone = "warn"
    if inference_error:
        attention_level = "WATCH"
        attention_reason = inference_error
        attention_tone = "error"
    if thermal_state.get("anomaly_active"):
        attention_level = "ELEVATED"
        attention_reason = "Thermal hotspot flagged by the FLIR pipeline."
        attention_tone = "warn"
    if rgb_state.get("status") in {"ERROR", "BUSY"}:
        attention_level = "WATCH"
        attention_reason = rgb_state.get("error") or "RGB acquisition needs attention."
        attention_tone = "error" if rgb_state.get("status") == "ERROR" else "warn"
    recording_supported = which("ffmpeg") is not None
    pipeline = {
        "fusion": {"state": "Preview not connected", "supported": False, "message": "Multimodal fusion preview. RGB + Thermal fusion will appear here."},
        "inference": {
            "state": "Running" if inference_running else "Ready" if inference_ok else "Error",
            "supported": inference_ok,
            "message": inference_error or (f"ONNX Runtime ready. Last run produced {inference_count} detection{'s' if inference_count != 1 else ''}." if inference_count else "ONNX Runtime ready in Replay/Demo mode."),
            "backend": inference_state.get("backend", "onnx"),
            "model_path": inference_state.get("model_path"),
            "last_image": inference_state.get("last_image"),
            "last_inference_ms": inference_state.get("last_inference_ms"),
            "fps": inference_state.get("fps"),
        },
        "recording": {"state": "Ready" if recording_supported else "Not available", "supported": recording_supported, "message": "Recording controls are available from Acquisition."},
        "snapshot": {"state": "Ready", "supported": True, "message": "Snapshot capture is already functional."},
    }
    sensor_health = {
        "online_count": online_sensors,
        "detected_count": detected_sensors,
        "total_count": 3,
        "rgb_left": {"state": rgb_left_status, "enabled": rgb_cameras[0]["enabled"] if rgb_cameras else True},
        "rgb_right": {"state": rgb_right_status, "enabled": rgb_cameras[1]["enabled"] if len(rgb_cameras) > 1 else True},
        "thermal": {"state": thermal_status, "mode": thermal_state.get("mode", "--"), "detected": thermal_state.get("detected", False)},
    }
    detections = []
    for detection in last_detections:
        detections.append(
            {
                "label": detection.get("class_name") or detection.get("label") or "Detection",
                "confidence": detection.get("confidence"),
                "bbox": detection.get("box_xyxy") or detection.get("bbox"),
                "source": "ai_inference",
                "source_label": detection.get("source_label") or inference_state.get("source_label"),
                "image_path": detection.get("image_path") or inference_state.get("last_image"),
                "state": "detected",
                "message": f"{detection.get('class_name') or 'object'} detected by ONNX Runtime",
            }
        )
    if not detections:
        detections = [{"label": "No detections yet", "confidence": None, "source": "ai_inference" if inference_ok else "placeholder", "state": "idle", "message": "Run Replay/Demo inference to populate detections." if inference_ok else "The AI detection pipeline is not connected."}]
    return {"attention": {"level": attention_level, "tone": attention_tone, "reason": attention_reason}, "detections": detections, "sensor_health": sensor_health, "pipeline": pipeline}


def build_system_payload(probe: SystemProbe) -> Dict[str, Any]:
    cpu_percent = psutil.cpu_percent(interval=0.1)
    return {
        "hostname": probe.hostname(),
        "ip_address": probe.ip_address(),
        "model": probe.model(),
        "os_release": probe.os_release(),
        "python_version": probe.python_version(),
        "cpu_temperature_c": probe.cpu_temperature(),
        "cpu_percent": cpu_percent,
        "ram": probe.memory(),
        "disk": probe.disk(),
        "uptime_seconds": get_boot_seconds(),
        "uptime_human": human_uptime(get_boot_seconds()),
        "vcgencmd_get_camera": probe.get_camera(),
    }


def dashboard_context(
    page_key: str,
    page_title: str,
    page_subtitle: str,
    *,
    template_name: str = "index.html",
    hostname: str,
    ip_address: str,
    asset_version: str,
    thermal_device: str,
    thermal_mode: str,
    **extra: Any,
) -> str:
    return render_template(
        template_name,
        page_key=page_key,
        page_title=page_title,
        page_subtitle=page_subtitle,
        nav_items=NAV_ITEMS,
        ip_address=ip_address,
        hostname=hostname,
        asset_version=asset_version,
        thermal_device=thermal_device,
        thermal_mode=thermal_mode,
        **extra,
    )

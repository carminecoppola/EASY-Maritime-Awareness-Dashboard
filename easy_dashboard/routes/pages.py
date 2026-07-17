from __future__ import annotations

from flask import Blueprint, abort, redirect, send_file

from easy_dashboard.constants import PROJECT_ROOT
from easy_dashboard.presentation import dashboard_context
from easy_dashboard.routes import get_runtime


pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def index() -> str:
    runtime = get_runtime()
    return dashboard_context(
        "live",
        "EASY Maritime Awareness",
        "Multimodal maritime monitoring dashboard",
        template_name="index.html",
        hostname=runtime.probe.hostname(),
        ip_address=runtime.probe.ip_address(),
        asset_version=runtime.asset_version(),
        thermal_device=runtime.thermal.device,
        thermal_mode=runtime.config["thermal"].get("mode", "mock"),
        presentation_mode=False,
    )


@pages_bp.route("/paper-preview")
def paper_preview() -> str:
    """Render a deterministic, read-only view for papers and presentations."""
    runtime = get_runtime()
    return dashboard_context(
        "live",
        "EASY Maritime Awareness",
        "Multimodal maritime monitoring · recorded presentation preview",
        template_name="index.html",
        hostname=runtime.probe.hostname(),
        ip_address=runtime.probe.ip_address(),
        asset_version=runtime.asset_version(),
        thermal_device=runtime.thermal.device,
        thermal_mode=runtime.config["thermal"].get("mode", "mock"),
        presentation_mode=True,
    )


@pages_bp.route("/paper-assets/<asset_name>")
def paper_asset(asset_name: str):
    """Serve only the two repository-owned RGB samples used by the preview."""
    assets = {
        "rgb-left": PROJECT_ROOT / "runtime" / "replay" / "test_inference" / "001_seaships__001253.jpg",
        "rgb-right": PROJECT_ROOT / "runtime" / "replay" / "test_inference" / "002_seaships__002958.jpg",
    }
    path = assets.get(asset_name)
    if path is None or not path.is_file():
        abort(404)
    return send_file(path, mimetype="image/jpeg", conditional=True)


@pages_bp.route("/mission")
def mission_page() -> str:
    runtime = get_runtime()
    return dashboard_context(
        "mission",
        "Mission",
        "Recording, captures and session dataset",
        template_name="mission.html",
        hostname=runtime.probe.hostname(),
        ip_address=runtime.probe.ip_address(),
        asset_version=runtime.asset_version(),
        thermal_device=runtime.thermal.device,
        thermal_mode=runtime.config["thermal"].get("mode", "mock"),
    )


@pages_bp.route("/sensors")
def sensors_page() -> str:
    return redirect("/")


@pages_bp.route("/thermal-events")
def thermal_events_page() -> str:
    runtime = get_runtime()
    return dashboard_context(
        "detections",
        "Detections",
        "Detected events and AI analysis",
        template_name="thermal_events.html",
        hostname=runtime.probe.hostname(),
        ip_address=runtime.probe.ip_address(),
        asset_version=runtime.asset_version(),
        thermal_device=runtime.thermal.device,
        thermal_mode=runtime.config["thermal"].get("mode", "mock"),
    )


@pages_bp.route("/snapshots")
def snapshots_gallery() -> str:
    runtime = get_runtime()
    return dashboard_context(
        "log",
        "Photos and activity",
        "Saved captures, history and errors",
        template_name="snapshots.html",
        hostname=runtime.probe.hostname(),
        ip_address=runtime.probe.ip_address(),
        asset_version=runtime.asset_version(),
        thermal_device=runtime.thermal.device,
        thermal_mode=runtime.config["thermal"].get("mode", "mock"),
    )


@pages_bp.route("/system-diagnostics")
def system_diagnostics_page() -> str:
    runtime = get_runtime()
    return dashboard_context(
        "system",
        "System",
        "Hardware and device status",
        template_name="system_diagnostics.html",
        hostname=runtime.probe.hostname(),
        ip_address=runtime.probe.ip_address(),
        asset_version=runtime.asset_version(),
        thermal_device=runtime.thermal.device,
        thermal_mode=runtime.config["thermal"].get("mode", "mock"),
    )


@pages_bp.route("/help")
def help_page() -> str:
    runtime = get_runtime()
    return dashboard_context(
        "help",
        "Operator guide",
        "Daily use, sessions and quick checks",
        template_name="help.html",
        hostname=runtime.probe.hostname(),
        ip_address=runtime.probe.ip_address(),
        asset_version=runtime.asset_version(),
        thermal_device=runtime.thermal.device,
        thermal_mode=runtime.config["thermal"].get("mode", "mock"),
    )

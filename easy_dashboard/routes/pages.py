from __future__ import annotations

from flask import Blueprint, redirect

from easy_dashboard.presentation import dashboard_context
from easy_dashboard.routes import get_runtime


pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def index() -> str:
    runtime = get_runtime()
    return dashboard_context(
        "live",
        "Live operations",
        "Video feeds and camera status",
        template_name="index.html",
        hostname=runtime.probe.hostname(),
        ip_address=runtime.probe.ip_address(),
        asset_version=runtime.asset_version(),
        thermal_device=runtime.thermal.device,
        thermal_mode=runtime.config["thermal"].get("mode", "mock"),
    )


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

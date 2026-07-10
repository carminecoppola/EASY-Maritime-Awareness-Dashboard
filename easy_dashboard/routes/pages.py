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
        "Vista operativa",
        "Flussi video e stato della missione",
        template_name="index.html",
        hostname=runtime.probe.hostname(),
        ip_address=runtime.probe.ip_address(),
        asset_version=runtime.asset_version(),
        thermal_device=runtime.thermal.device,
        thermal_mode=runtime.config["thermal"].get("mode", "mock"),
    )


@pages_bp.route("/mission")
def mission_page() -> str:
    return redirect("/")


@pages_bp.route("/sensors")
def sensors_page() -> str:
    return redirect("/")


@pages_bp.route("/thermal-events")
def thermal_events_page() -> str:
    runtime = get_runtime()
    return dashboard_context(
        "detections",
        "Rilevazioni",
        "Eventi rilevati e analisi AI",
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
        "Foto e attività",
        "Acquisizioni salvate, cronologia ed errori",
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
        "Sistema",
        "Stato hardware e dispositivi",
        template_name="system_diagnostics.html",
        hostname=runtime.probe.hostname(),
        ip_address=runtime.probe.ip_address(),
        asset_version=runtime.asset_version(),
        thermal_device=runtime.thermal.device,
        thermal_mode=runtime.config["thermal"].get("mode", "mock"),
    )


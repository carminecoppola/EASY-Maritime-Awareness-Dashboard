# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""HTTP routes of the dashboard, grouped in Flask blueprints.

    api_auth       login, setup, users, audit            (``/api/auth/*``)
    api_runtime    health, status, sources, devices      (``/health``, ``/api/*``)
    media          live video, thermal, snapshots        (``/video/*``, ``/snapshots/*``)
    api_inference  detection and mission APIs            (``/api/inference/*``, ``/api/session/*``)
    spa            the built React application and its fallback route
"""

from __future__ import annotations

from flask import Flask

from easy_dashboard.runtime import DashboardRuntime


def get_runtime() -> DashboardRuntime:
    """The ``DashboardRuntime`` of the running application."""
    from flask import current_app

    return current_app.config["dashboard_runtime"]


def register_blueprints(app: Flask, runtime: DashboardRuntime) -> None:
    """Attach the runtime to the app and register every blueprint (the SPA catch-all last)."""
    from easy_dashboard.routes.api_auth import api_auth_bp
    from easy_dashboard.routes.api_inference import api_inference_bp
    from easy_dashboard.routes.api_runtime import api_runtime_bp
    from easy_dashboard.routes.media import media_bp
    from easy_dashboard.routes.spa import spa_bp

    app.config["dashboard_runtime"] = runtime
    app.register_blueprint(api_auth_bp)
    app.register_blueprint(api_runtime_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(api_inference_bp)
    # Registered last: its catch-all route must never shadow the API/media
    # blueprints above it.
    app.register_blueprint(spa_bp)

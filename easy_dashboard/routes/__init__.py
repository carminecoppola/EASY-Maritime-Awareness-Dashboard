from __future__ import annotations

from flask import Flask

from easy_dashboard.runtime import DashboardRuntime


def get_runtime() -> DashboardRuntime:
    from flask import current_app

    return current_app.config["dashboard_runtime"]


def register_blueprints(app: Flask, runtime: DashboardRuntime) -> None:
    from easy_dashboard.routes.api_inference import api_inference_bp
    from easy_dashboard.routes.api_runtime import api_runtime_bp
    from easy_dashboard.routes.media import media_bp
    from easy_dashboard.routes.spa import spa_bp

    app.config["dashboard_runtime"] = runtime
    app.register_blueprint(api_runtime_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(api_inference_bp)
    # Registered last: its catch-all route must never shadow the API/media
    # blueprints above it.
    app.register_blueprint(spa_bp)

from __future__ import annotations

from flask import Blueprint, abort, current_app, jsonify, send_file, send_from_directory

from easy_dashboard.constants import PROJECT_ROOT

spa_bp = Blueprint("spa", __name__)

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

# Two repository-owned SeaShips samples used by the SPA's static
# /presentation view (no hardware, no polling) — same two files the old
# Jinja /paper-preview route served, just without the removed Jinja layer.
PAPER_ASSETS = {
    "rgb-left": PROJECT_ROOT / "runtime" / "replay" / "test_inference" / "001_seaships__001253.jpg",
    "rgb-right": PROJECT_ROOT / "runtime" / "replay" / "test_inference" / "002_seaships__002958.jpg",
}


@spa_bp.route("/api/config")
def api_config():
    """Non-secret bootstrap info for the SPA (no token value exposed here)."""
    return jsonify({"auth_required": bool(current_app.config.get("EASY_AUTH_REQUIRED"))})


@spa_bp.route("/paper-assets/<asset_name>")
def paper_asset(asset_name: str):
    """Serve only the two fixed, repository-owned RGB samples above."""
    path = PAPER_ASSETS.get(asset_name)
    if path is None or not path.is_file():
        abort(404)
    return send_file(path, mimetype="image/jpeg", conditional=True)


@spa_bp.route("/", defaults={"path": ""})
@spa_bp.route("/<path:path>")
def serve_spa(path: str):
    """Serve the built React SPA, falling back to index.html for client routes.

    Registered last so it never shadows the API/media blueprints above it.
    """
    candidate = FRONTEND_DIST / path if path else None
    if candidate is not None and candidate.is_file():
        return send_from_directory(FRONTEND_DIST, path)
    index_path = FRONTEND_DIST / "index.html"
    if not index_path.is_file():
        return (
            "Frontend build not found. Run `npm run build` inside frontend/.",
            503,
        )
    return send_from_directory(FRONTEND_DIST, "index.html")

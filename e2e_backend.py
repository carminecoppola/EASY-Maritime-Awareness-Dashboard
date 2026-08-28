"""Backend runner for Playwright e2e tests: replay mode, no real hardware.

Serves the same built frontend/dist as production (via the catch-all route)
so the e2e suite exercises the real serving path, not Vite's dev server.
"""

from __future__ import annotations

import os

os.environ.setdefault("EASY_DASHBOARD_SKIP_GLOBAL_APP", "1")

from app import create_app

app = create_app(run_startup_checks=False, start_runtime_services=False)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5051, threaded=True, debug=False)

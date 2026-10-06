# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Backend runner for Playwright e2e tests: replay mode, no real hardware.

Serves the same built frontend/dist as production (via the catch-all route)
so the e2e suite exercises the real serving path, not Vite's dev server.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("EASY_DASHBOARD_SKIP_GLOBAL_APP", "1")

from app import create_app

app = create_app(run_startup_checks=False, start_runtime_services=False)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5051, threaded=True, debug=False)

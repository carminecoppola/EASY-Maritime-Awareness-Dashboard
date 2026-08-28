from __future__ import annotations

import os
import unittest
from pathlib import Path

os.environ.setdefault("EASY_DASHBOARD_SKIP_GLOBAL_APP", "1")

from app import create_app

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


@unittest.skipUnless((FRONTEND_DIST / "index.html").is_file(), "frontend/dist not built (run `npm run build` in frontend/)")
class SpaServingTests(unittest.TestCase):
    """Covers the one backend change the SPA redesign required: serving the
    built React app instead of the removed Jinja templates. All hardware,
    inference, and API routes are exercised elsewhere (test_api_contracts.py)
    and are untouched by this change.
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls.app = create_app(run_startup_checks=False, start_runtime_services=False)
        cls.app.testing = True
        cls.client = cls.app.test_client()

    def test_root_serves_spa_shell(self) -> None:
        # send_from_directory returns a file-backed response: use it as a
        # context manager so the underlying handle is closed deterministically
        # (CI runs with PYTHONWARNINGS=error::ResourceWarning).
        with self.client.get("/") as response:
            self.assertEqual(response.status_code, 200)
            self.assertIn("text/html", response.content_type or "")

    def test_unknown_client_route_falls_back_to_spa_shell(self) -> None:
        for route in ("/mission", "/thermal-events", "/snapshots", "/system-diagnostics", "/help", "/does/not/exist"):
            with self.subTest(route=route):
                with self.client.get(route) as response:
                    self.assertEqual(response.status_code, 200)
                    self.assertIn("text/html", response.content_type or "")

    def test_built_asset_is_served_with_correct_path(self) -> None:
        assets_dir = FRONTEND_DIST / "assets"
        if not assets_dir.is_dir():
            self.skipTest("no assets/ directory in this build")
        asset_files = list(assets_dir.glob("*.js"))
        if not asset_files:
            self.skipTest("no built JS assets found")
        asset_name = asset_files[0].name
        with self.client.get(f"/assets/{asset_name}") as response:
            self.assertEqual(response.status_code, 200)

    def test_catch_all_never_shadows_api_or_media_routes(self) -> None:
        # These must be served by their own blueprints, not by the SPA
        # catch-all registered last.
        self.assertEqual(self.client.get("/health").status_code, 200)
        self.assertEqual(self.client.get("/api/dashboard/state").status_code, 200)
        self.assertEqual(self.client.get("/thermal/status").status_code, 200)
        # /system is a real diagnostics API (api_runtime.py), distinct from
        # the SPA's /system-diagnostics client route — it must stay JSON.
        system_response = self.client.get("/system")
        self.assertEqual(system_response.status_code, 200)
        self.assertIn("application/json", system_response.content_type or "")

    def test_config_endpoint_reports_auth_mode_without_leaking_token(self) -> None:
        payload = self.client.get("/api/config").get_json()
        self.assertIsInstance(payload, dict)
        self.assertIn("auth_required", payload)
        self.assertIsInstance(payload["auth_required"], bool)
        self.assertNotIn("token", payload)
        self.assertNotIn("shared_token", payload)


if __name__ == "__main__":
    unittest.main()

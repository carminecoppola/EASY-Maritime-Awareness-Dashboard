from __future__ import annotations

import json
import os
import unittest
from pathlib import Path

os.environ.setdefault("EASY_DASHBOARD_SKIP_GLOBAL_APP", "1")

from app import create_app


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class ApiContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.app = create_app(run_startup_checks=False, start_runtime_services=False)
        cls.app.testing = True
        cls.client = cls.app.test_client()

    def test_primary_pages_render(self) -> None:
        for route in ("/", "/paper-preview", "/mission", "/thermal-events", "/snapshots", "/system-diagnostics", "/help"):
            with self.subTest(route=route):
                self.assertEqual(self.client.get(route).status_code, 200)

    def test_health_exposes_additive_runtime_contract(self) -> None:
        payload = self.client.get("/health").get_json()
        self.assertIsInstance(payload, dict)
        self.assertIn("runtime_state", payload)
        self.assertEqual(set(payload["runtime_state"]), {"rgb", "thermal"})
        for sensor in ("rgb", "thermal"):
            state = payload["runtime_state"][sensor]
            self.assertIn(state["availability"], {"STREAMING", "READY", "INITIALIZING", "NOT_PRESENT", "ERROR"})
            self.assertIn("service_healthy", state)

    def test_lightweight_readiness_contract(self) -> None:
        response = self.client.get("/health/ready")
        payload = response.get_json()
        self.assertEqual(payload["service"], "easy-dashboard")
        self.assertIn("ok", payload)
        self.assertIn("orchestrator_status", payload)
        self.assertEqual(response.status_code, 200 if payload["ok"] and payload["orchestrator_status"] == "RUNNING" else 503)

    def test_thermal_status_does_not_capture_a_frame(self) -> None:
        runtime = self.app.easy_dashboard_runtime
        before = runtime.thermal.frame_seq
        response = self.client.get("/thermal/status")
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(runtime.thermal.frame_seq, before)
        self.assertEqual(payload["runtime_state"]["capture_mode"], "on_demand")

    def test_inference_configuration_matches_deployed_model_classes(self) -> None:
        config_path = PROJECT_ROOT / "runtime" / "config" / "inference_config.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        self.assertEqual([item["name"] for item in config["classes"]], ["boat", "ship", "buoy"])

    def test_core_api_payloads_remain_available(self) -> None:
        cases = {
            "/api/dashboard/state": {"health", "sources", "devices", "session"},
            "/api/status/summary": {"ok", "operator_state", "live", "mission"},
            "/api/session/status": {"running", "current", "latest", "recent"},
            "/api/acquisition/status": {"running", "manifest_counts", "dataset_summary"},
            "/api/sources/status": {"sources", "selected_source"},
        }
        for route, required in cases.items():
            with self.subTest(route=route):
                response = self.client.get(route)
                payload = response.get_json()
                self.assertEqual(response.status_code, 200)
                self.assertTrue(required <= set(payload))

    def test_shared_token_gates_state_changing_requests_when_configured(self) -> None:
        os.environ["EASY_DASHBOARD_TOKEN"] = "demo-secret"
        try:
            app = create_app(run_startup_checks=False, start_runtime_services=False)
            app.testing = True
            client = app.test_client()

            self.assertEqual(client.post("/api/session/stop").status_code, 401)
            self.assertNotEqual(
                client.post("/api/session/stop", headers={"X-EASY-Token": "demo-secret"}).status_code, 401
            )
            # GETs stay open even with a token configured; only state changes are gated.
            self.assertNotEqual(client.get("/api/session/status").status_code, 401)
        finally:
            del os.environ["EASY_DASHBOARD_TOKEN"]

    def test_no_token_configured_leaves_state_changes_open(self) -> None:
        # Default LAN-only trust model: unset token must not block anything.
        self.assertNotEqual(self.client.post("/api/session/stop").status_code, 401)


if __name__ == "__main__":
    unittest.main()

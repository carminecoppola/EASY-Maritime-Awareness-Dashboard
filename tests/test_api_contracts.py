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


if __name__ == "__main__":
    unittest.main()

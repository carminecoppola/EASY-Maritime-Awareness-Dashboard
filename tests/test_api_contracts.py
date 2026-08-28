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

    def test_focus_endpoints_expose_the_rgb_focus_score_contract(self) -> None:
        runtime = self.app.easy_dashboard_runtime
        original = runtime.rgb.focus_score
        try:
            runtime.rgb.focus_score = lambda side: {"ok": True, "side": side, "score": 42.5}
            for route, expected_side in (("/api/focus/rgb_left", "left"), ("/api/focus/rgb_right", "right")):
                with self.subTest(route=route):
                    payload = self.client.get(route).get_json()
                    self.assertTrue(payload["ok"])
                    self.assertEqual(payload["side"], expected_side)
                    self.assertEqual(payload["score"], 42.5)
        finally:
            runtime.rgb.focus_score = original

    def test_dashboard_state_reuses_health_payload_instead_of_recomputing(self) -> None:
        runtime = self.app.easy_dashboard_runtime
        original_detections = runtime.detection_manager.get_current_detections
        # system_orchestrator.health()/components() and acquisition_manager
        # each legitimately call session_manager.status() on their own; what
        # must not repeat is the expensive disk read/write behind it, which
        # status()'s short cache absorbs. Patch that, not the public method.
        original_session_uncached = runtime.session_manager._status_uncached
        detection_calls = []
        session_uncached_calls = []
        try:
            runtime.detection_manager.get_current_detections = lambda: (
                detection_calls.append(1) or original_detections()
            )
            runtime.session_manager._status_cache = None
            runtime.session_manager._status_uncached = lambda: (
                session_uncached_calls.append(1) or original_session_uncached()
            )

            self.client.get("/api/dashboard/state")

            self.assertEqual(len(detection_calls), 1, "detections should be computed once, not once per caller")
            self.assertEqual(
                len(session_uncached_calls), 1, "session status disk I/O should run once, not once per caller"
            )
        finally:
            runtime.detection_manager.get_current_detections = original_detections
            runtime.session_manager._status_uncached = original_session_uncached
            runtime.session_manager._status_cache = None

    def test_stopping_a_session_clears_stale_current_detections(self) -> None:
        # Regression: /api/session/stop resolved the session's events but
        # never cleared detection_manager's "current" detections, so boxes
        # from an old (often replay) session kept being drawn over the live
        # feed indefinitely — surviving even a service restart, since
        # current_detections.json is reloaded from disk on startup.
        runtime = self.app.easy_dashboard_runtime
        original_get_current_session = runtime.session_manager.get_current_session
        original_stop_session = runtime.session_manager.stop_session
        original_resolve_events = runtime.event_manager.resolve_session_events
        clear_calls = []
        original_clear = runtime.detection_manager.clear
        try:
            runtime.session_manager.get_current_session = lambda: {"session_id": "session_stub"}
            runtime.session_manager.stop_session = lambda: {"ok": True, "message": "Session stopped", "session": None}
            runtime.event_manager.resolve_session_events = lambda *a, **k: None
            runtime.detection_manager.clear = lambda: (clear_calls.append(1) or original_clear())

            response = self.client.post("/api/session/stop")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(clear_calls), 1, "stopping a session must clear stale current detections")
        finally:
            runtime.session_manager.get_current_session = original_get_current_session
            runtime.session_manager.stop_session = original_stop_session
            runtime.event_manager.resolve_session_events = original_resolve_events
            runtime.detection_manager.clear = original_clear


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from device_manager import DeviceManager
from easy_dashboard.runtime_status import (
    build_rgb_state_contract,
    build_thermal_state_contract,
    runtime_is_healthy,
)
from source_manager import SourceManager


class RuntimeStateContractTests(unittest.TestCase):
    def test_rgb_fresh_frame_is_streaming(self) -> None:
        with patch("easy_dashboard.runtime_status.time.time", return_value=100.0):
            state = build_rgb_state_contract(
                {
                    "status": "ONLINE",
                    "camera_state": "DETECTED",
                    "detected": True,
                    "last_frame_ts": 98.0,
                }
            )
        self.assertEqual(state["availability"], "STREAMING")
        self.assertTrue(state["streaming"])
        self.assertTrue(state["operational"])

    def test_rgb_runtime_error_wins_over_hardware_detection(self) -> None:
        state = build_rgb_state_contract(
            {
                "status": "ERROR",
                "camera_state": "DETECTED",
                "detected": True,
                "last_frame_ts": 0,
            }
        )
        self.assertEqual(state["availability"], "ERROR")
        self.assertFalse(state["service_healthy"])

    def test_thermal_ready_is_healthy_without_continuous_stream(self) -> None:
        state = build_thermal_state_contract(
            {
                "status": "READY",
                "mode": "real",
                "detected": True,
                "last_frame_ts": 0,
            }
        )
        self.assertEqual(state["availability"], "READY")
        self.assertEqual(state["capture_mode"], "on_demand")
        self.assertTrue(state["ready"])
        self.assertTrue(state["operational"])
        self.assertFalse(state["streaming"])
        self.assertTrue(state["service_healthy"])

    def test_health_accepts_ready_thermal_and_rejects_thermal_error(self) -> None:
        rgb = {"status": "ONLINE", "camera_state": "DETECTED", "detected": True, "last_frame_ts": time.time()}
        ready = {"status": "READY", "mode": "real", "detected": True}
        failed = {"status": "ERROR", "mode": "real", "detected": True}
        self.assertTrue(runtime_is_healthy(rgb, ready))
        self.assertFalse(runtime_is_healthy(rgb, failed))


class ManagerContractPropagationTests(unittest.TestCase):
    def test_device_and_source_managers_preserve_runtime_state(self) -> None:
        rgb_runtime = {
            "availability": "STREAMING",
            "health": "GOOD",
            "capture_mode": "continuous",
            "detected": True,
            "ready": True,
            "streaming": True,
            "operational": True,
            "service_healthy": True,
        }
        thermal_runtime = {
            "availability": "READY",
            "health": "GOOD",
            "capture_mode": "on_demand",
            "detected": True,
            "ready": True,
            "streaming": False,
            "operational": True,
            "service_healthy": True,
        }

        def rgb_provider() -> dict:
            return {"status": "STREAMING", "fps": 10.0, "runtime_state": rgb_runtime}

        def thermal_provider() -> dict:
            return {"status": "CONNECTED", "fps": 0.0, "runtime_state": thermal_runtime}

        with tempfile.TemporaryDirectory() as temporary_root:
            root = Path(temporary_root)
            replay = root / "replay"
            replay.mkdir()
            device_manager = DeviceManager(
                runtime_root=root,
                replay_root=replay,
                status_providers={
                    "rgb_left": rgb_provider,
                    "rgb_right": rgb_provider,
                    "thermal": thermal_provider,
                },
            )
            source_manager = SourceManager(
                runtime_root=root,
                replay_root=replay,
                device_manager=device_manager,
            )
            source_manager.refresh_status()

            thermal_device = device_manager.get_device_status("thermal") or {}
            thermal_source = source_manager.get_source("thermal") or {}
            self.assertEqual(thermal_device["runtime_state"]["availability"], "READY")
            self.assertEqual(thermal_source["runtime_state"]["capture_mode"], "on_demand")
            self.assertTrue(thermal_source["availability"]["available"])


if __name__ == "__main__":
    unittest.main()

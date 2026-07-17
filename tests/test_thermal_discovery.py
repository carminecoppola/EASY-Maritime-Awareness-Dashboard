from __future__ import annotations

import unittest

from easy_dashboard.hardware import ThermalState
from easy_dashboard.thermal_discovery import PureThermalDiscovery


class PureThermalDiscoveryTests(unittest.TestCase):
    def test_recognizes_supported_device_names(self) -> None:
        for name in (
            "PureThermal (fw:v1.3.0)",
            "FLIR Systems Lepton",
            "Pure Thermal UVC",
        ):
            with self.subTest(name=name):
                self.assertTrue(PureThermalDiscovery.name_looks_thermal(name))
        self.assertFalse(PureThermalDiscovery.name_looks_thermal("bcm2835-codec"))

    def test_selection_prefers_y16_and_configured_size(self) -> None:
        candidates = [
            {"path": "/dev/video0", "supports_y16": False, "supports_configured_size": True},
            {"path": "/dev/video1", "supports_y16": True, "supports_configured_size": True},
            {"path": "/dev/video2", "supports_y16": True, "supports_configured_size": False},
        ]
        self.assertEqual(PureThermalDiscovery.select_candidate(candidates), "/dev/video1")
        self.assertTrue(candidates[1]["selected"])

    def test_legacy_thermal_state_selector_remains_compatible(self) -> None:
        thermal = ThermalState.__new__(ThermalState)
        candidates = [
            {"path": "/dev/video3", "supports_y16": False, "supports_configured_size": False},
            {"path": "/dev/video0", "supports_y16": False, "supports_configured_size": False},
        ]
        self.assertEqual(thermal._select_thermal_candidate(candidates), "/dev/video0")


if __name__ == "__main__":
    unittest.main()

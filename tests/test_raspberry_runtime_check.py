from __future__ import annotations

import unittest

from scripts.check_raspberry_runtime import validate_rgb_payload


class RaspberryRuntimeCheckTests(unittest.TestCase):
    def test_accepts_two_live_rgb_feeds(self) -> None:
        state = {
            "detected": True,
            "has_frame": True,
            "process_running": True,
            "fps": 10.0,
            "runtime_state": {"availability": "STREAMING"},
        }
        result = validate_rgb_payload(
            {
                "rgb_left": {"enabled": True, "state": dict(state)},
                "rgb_right": {"enabled": True, "state": dict(state)},
            }
        )
        self.assertEqual(result["rgb_left"]["fps"], 10.0)
        self.assertEqual(result["rgb_right"]["availability"], "STREAMING")

    def test_rejects_detected_rgb_without_a_frame(self) -> None:
        state = {
            "detected": True,
            "has_frame": False,
            "process_running": True,
            "fps": 0.0,
            "runtime_state": {"availability": "READY"},
        }
        with self.assertRaisesRegex(RuntimeError, "not delivering frames"):
            validate_rgb_payload(
                {
                    "rgb_left": {"enabled": True, "state": dict(state)},
                    "rgb_right": {"enabled": True, "state": dict(state)},
                }
            )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from easy_dashboard.runtime_benchmark import (
    ProcessTreeSampler,
    extract_runtime_fields,
    latex_escape,
    numeric_summary,
    percentile,
)


class RuntimeBenchmarkTests(unittest.TestCase):
    def test_numeric_summary_uses_nearest_rank_p95(self) -> None:
        values = list(range(1, 21))
        summary = numeric_summary(values)
        self.assertEqual(summary["count"], 20)
        self.assertEqual(summary["median"], 10.5)
        self.assertEqual(summary["p95"], 19.0)
        self.assertEqual(percentile(values, 95), 19.0)

    def test_empty_numeric_summary_is_explicit(self) -> None:
        summary = numeric_summary([None])
        self.assertEqual(summary["count"], 0)
        self.assertIsNone(summary["mean"])

    def test_extracts_fps_and_component_list(self) -> None:
        state = {"fps": 10.0, "detected": True, "has_frame": True}
        result = extract_runtime_fields(
            {"rgb_left": {"state": dict(state)}, "rgb_right": {"state": dict(state)}},
            {"running": False, "backend": "onnx", "last_inference_ms": 123.4},
            {"status": "READY", "frame_seq": 2, "runtime_state": {"availability": "READY"}},
            {
                "components": [
                    {"name": "source_manager", "status": "RUNNING"},
                    {"id": "inference", "state": "IDLE"},
                ]
            },
        )
        self.assertEqual(result["rgb_left_fps"], 10.0)
        self.assertEqual(result["thermal_availability"], "READY")
        self.assertEqual(result["component_states"]["source_manager"], "RUNNING")
        self.assertEqual(result["component_states"]["inference"], "IDLE")

    def test_latex_escape_protects_identifiers(self) -> None:
        self.assertEqual(latex_escape("rgb_left & health"), r"rgb\_left \& health")

    def test_missing_process_is_not_reported_as_zero_usage(self) -> None:
        sampler = ProcessTreeSampler(99999999)
        sample = sampler.sample(1.0)
        self.assertEqual(sample["easy_process_count"], 0)
        self.assertIsNone(sample["easy_cpu_percent"])
        self.assertIsNone(sample["easy_rss_mb"])


if __name__ == "__main__":
    unittest.main()

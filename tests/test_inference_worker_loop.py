from __future__ import annotations

import threading
import unittest

from inference_worker import InferenceWorker


class InferenceLoopResilienceTests(unittest.TestCase):
    def _make_worker(self) -> InferenceWorker:
        worker = InferenceWorker(events=None, detection_manager=None, source_manager=None)
        worker.frame_provider.status = lambda: {"error": None, "total_frames": 1}
        worker._selected_source = lambda: {"type": "replay_folder", "name": "Replay Folder"}
        worker._selected_source_status = lambda: "ONLINE"
        worker._write_current_state = lambda: None
        return worker

    def test_transient_failure_does_not_stop_the_demo_loop(self) -> None:
        worker = self._make_worker()
        calls = []

        def flaky_run_on_next_frame():
            calls.append(1)
            if len(calls) <= 2:
                raise RuntimeError("transient decode error")
            worker._stop_event.set()
            return {"ok": True, "detections": [], "image_path": "frame.jpg", "updated_at": "now"}

        worker.run_on_next_frame = flaky_run_on_next_frame
        worker._interval_seconds = 0.01

        thread = threading.Thread(target=worker._demo_loop, daemon=True)
        thread.start()
        thread.join(timeout=5)

        self.assertFalse(thread.is_alive(), "loop should have stopped via the stop_event, not hung")
        self.assertGreaterEqual(len(calls), 3, "the loop must keep retrying after transient failures")
        self.assertEqual(worker._last_error, "")
        self.assertEqual(worker._consecutive_loop_failures, 0, "a successful frame must reset the failure counter")

    def test_loop_gives_up_after_too_many_consecutive_failures(self) -> None:
        worker = self._make_worker()
        worker._max_consecutive_loop_failures = 3
        worker._interval_seconds = 0.01
        calls = []

        def always_fails():
            calls.append(1)
            raise RuntimeError("persistent failure")

        worker.run_on_next_frame = always_fails

        thread = threading.Thread(target=worker._demo_loop, daemon=True)
        thread.start()
        thread.join(timeout=5)

        self.assertFalse(thread.is_alive(), "loop should give up on its own, not hang forever")
        self.assertEqual(len(calls), 3, "must stop after exactly max_consecutive_loop_failures attempts")
        self.assertIn("persistent failure", worker._last_error)


if __name__ == "__main__":
    unittest.main()

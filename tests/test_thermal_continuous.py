# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Tests for the continuous thermal worker: command line, exact frame reads, capture-mode fallback and the bounded raw ring."""

from __future__ import annotations

import os
import unittest

from easy_dashboard.thermal_hardware import ThermalState


def thermal_config(capture_mode: str = "continuous") -> dict:
    return {
        "thermal": {
            "enabled": True,
            "mode": "real",
            "capture_mode": capture_mode,
            "stream_fps": 9,
            "preview_fps": 5,
            "device": "/dev/video0",
            "input_format": "y16",
            "video_size": "160x120",
        }
    }


class _PipeProcess:
    def __init__(self, payload: bytes) -> None:
        read_fd, write_fd = os.pipe()
        os.write(write_fd, payload)
        os.close(write_fd)
        self.stdout = os.fdopen(read_fd, "rb", buffering=0)

    def poll(self):
        return None


class ThermalContinuousTests(unittest.TestCase):
    def test_continuous_command_is_unbounded_raw_stdout(self) -> None:
        thermal = ThermalState(thermal_config(), events=None)  # type: ignore[arg-type]

        command = thermal._continuous_stream_command()

        self.assertEqual(command[-1], "pipe:1")
        self.assertNotIn("-frames:v", command)
        self.assertEqual(command[command.index("-framerate") + 1], "9")
        self.assertEqual(command[command.index("-video_size") + 1], "160x120")

    def test_pipe_reader_returns_one_exact_frame_and_leaves_the_next(self) -> None:
        thermal = ThermalState(thermal_config(), events=None)  # type: ignore[arg-type]
        first = b"a" * 16
        second = b"b" * 16
        process = _PipeProcess(first + second)
        try:
            self.assertEqual(thermal._read_continuous_frame(process, 16, timeout=0.2), first)
            self.assertEqual(thermal._read_continuous_frame(process, 16, timeout=0.2), second)
        finally:
            process.stdout.close()

    def test_invalid_capture_mode_falls_back_to_on_demand(self) -> None:
        thermal = ThermalState(thermal_config("unsafe-mode"), events=None)  # type: ignore[arg-type]
        self.assertEqual(thermal.capture_mode, "on_demand")

    def test_raw_ring_is_bounded(self) -> None:
        thermal = ThermalState(thermal_config(), events=None)  # type: ignore[arg-type]
        for sequence in range(10):
            thermal._raw_frames.append((sequence, sequence, b"frame"))
        self.assertEqual([item[0] for item in thermal._raw_frames], [7, 8, 9])

if __name__ == "__main__":
    unittest.main()

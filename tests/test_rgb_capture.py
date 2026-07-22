from __future__ import annotations

import unittest

from easy_dashboard.rgb_capture import RgbCaptureCommands, RgbCaptureSettings, split_mjpeg_buffer
from easy_dashboard.hardware import RgbMasterSource


class RgbCaptureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.commands = RgbCaptureCommands(
            RgbCaptureSettings(camera_index=0, width=1280, height=480, fps=10, quality=85)
        )

    def test_stream_command_preserves_raspberry_parameters(self) -> None:
        command = self.commands.stream("libcamera-vid")
        self.assertEqual(command[0], "libcamera-vid")
        self.assertEqual(command[command.index("--width") + 1], "1280")
        self.assertEqual(command[command.index("--height") + 1], "480")
        self.assertEqual(command[command.index("--framerate") + 1], "10")
        self.assertEqual(command[-2:], ["-o", "-"])

    def test_crop_command_selects_requested_half(self) -> None:
        left = self.commands.crop("ffmpeg", "left")
        right = self.commands.crop("ffmpeg", "right")
        self.assertEqual(left[left.index("-vf") + 1], "crop=0:0:iw*0.5:ih")
        self.assertEqual(right[right.index("-vf") + 1], "crop=iw*0.5:0:iw*0.5:ih")

    def test_mjpeg_parser_returns_complete_frames_and_remainder(self) -> None:
        first = b"\xff\xd8first\xff\xd9"
        second = b"\xff\xd8second\xff\xd9"
        partial = b"\xff\xd8partial"
        frames, remainder = split_mjpeg_buffer(b"noise" + first + second + partial)
        self.assertEqual(frames, [first, second])
        self.assertEqual(remainder, partial)

    def test_valid_frame_clears_transient_recovery_error(self) -> None:
        source = RgbMasterSource(
            {"rgb": {"camera_index": 0, "width": 1280, "height": 480, "fps": 10, "quality": 85}},
            events=None,  # type: ignore[arg-type]
            probe=None,  # type: ignore[arg-type]
        )
        source.detected = True
        source._status = "BUSY"
        source._error = "ERROR: Device timeout detected, attempting a restart!!!"
        source._next_retry_ts = 123.0

        source._store_frame(b"jpeg-frame")

        self.assertEqual(source._status, "ONLINE")
        self.assertEqual(source._error, "")
        self.assertEqual(source._next_retry_ts, 0.0)
        self.assertEqual(source._frame, b"jpeg-frame")
        self.assertEqual(source.camera_state(), "DETECTED")


if __name__ == "__main__":
    unittest.main()

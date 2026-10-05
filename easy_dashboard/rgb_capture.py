# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""RGB process command lines and MJPEG framing rules.

The RGB feed comes from one ``libcamera-vid``/``rpicam-vid`` process that
encodes a side-by-side stereo image (1280x480) as an MJPEG byte stream. This
module builds that command, builds the FFmpeg command that crops one half
(left or right camera) out of a frame, and cuts the byte stream into JPEG
frames. It never starts a process itself.
"""

from __future__ import annotations

from dataclasses import dataclass


JPEG_START = b"\xff\xd8"
JPEG_END = b"\xff\xd9"


@dataclass(frozen=True)
class RgbCaptureSettings:
    """Camera index, frame size, frame rate and JPEG quality of the capture process."""
    camera_index: int
    width: int
    height: int
    fps: int
    quality: int


class RgbCaptureCommands:
    """Build commands without owning the long-lived camera process."""

    def __init__(self, settings: RgbCaptureSettings) -> None:
        """Keep the capture settings used to build the commands."""
        self.settings = settings

    def stream(self, executable: str) -> list[str]:
        """Command that streams MJPEG to stdout with no preview window and no time limit."""
        settings = self.settings
        return [
            executable,
            "--camera",
            str(settings.camera_index),
            "-t",
            "0",
            "--nopreview",
            "--codec",
            "mjpeg",
            "--width",
            str(settings.width),
            "--height",
            str(settings.height),
            "--framerate",
            str(settings.fps),
            "--quality",
            str(settings.quality),
            "--inline",
            "--flush",
            "-o",
            "-",
        ]

    @staticmethod
    def crop(executable: str, side: str) -> list[str]:
        """FFmpeg command that reads one MJPEG frame on stdin and outputs its left or right half."""
        crop = "0:0:iw*0.5:ih" if side == "left" else "iw*0.5:0:iw*0.5:ih"
        return [
            executable,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "mjpeg",
            "-i",
            "pipe:0",
            "-vf",
            f"crop={crop}",
            "-frames:v",
            "1",
            "-f",
            "mjpeg",
            "pipe:1",
        ]


def split_mjpeg_buffer(buffer: bytes, *, maximum_buffer: int = 1024 * 1024) -> tuple[list[bytes], bytes]:
    """Cut complete JPEG frames out of a byte buffer.

    Frames are delimited by the SOI (FFD8) and EOI (FFD9) markers. Returns the
    frames and the incomplete trailing bytes to prepend to the next read; a buffer
    that grows past ``maximum_buffer`` without a frame is trimmed to its tail.
    """
    frames: list[bytes] = []
    remainder = buffer
    while True:
        start = remainder.find(JPEG_START)
        end = remainder.find(JPEG_END, start + 2) if start >= 0 else -1
        if start < 0 or end < 0:
            if start > 0:
                remainder = remainder[start:]
            elif start < 0 and len(remainder) > maximum_buffer:
                remainder = remainder[-65536:]
            break
        frames.append(remainder[start : end + len(JPEG_END)])
        remainder = remainder[end + len(JPEG_END) :]
    return frames, remainder

from __future__ import annotations

"""RGB process commands and MJPEG framing rules."""

from dataclasses import dataclass


JPEG_START = b"\xff\xd8"
JPEG_END = b"\xff\xd9"


@dataclass(frozen=True)
class RgbCaptureSettings:
    camera_index: int
    width: int
    height: int
    fps: int
    quality: int


class RgbCaptureCommands:
    """Build commands without owning the long-lived camera process."""

    def __init__(self, settings: RgbCaptureSettings) -> None:
        self.settings = settings

    def stream(self, executable: str) -> list[str]:
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
    """Return complete JPEG frames and the incomplete trailing bytes."""
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

# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Read-only host and camera diagnostics.

``SystemProbe`` collects hardware and OS facts (model, memory, disk, CPU
temperature, camera tooling, USB and video devices) for the System page and the
pre-flight report. It never owns a runtime process and never touches the
cameras beyond listing them.
"""

from __future__ import annotations

import logging
import os
import signal
import subprocess
from pathlib import Path
from typing import Any, Optional

import psutil

from .constants import PROJECT_ROOT
from .utils import (
    get_boot_seconds,
    get_hostname,
    get_ip_address,
    human_uptime,
    read_cpu_temperature,
    read_text_file,
    run_command,
    safe_device_listing,
    which,
)


LOGGER = logging.getLogger("easy-dashboard")


def _module_available(name: str) -> bool:
    """True if a Python module can be imported."""
    try:
        __import__(name)
        return True
    except Exception:
        return False


class SystemProbe:
    """Collect system information without owning any runtime process."""

    def hostname(self) -> str:
        """Host name."""
        return get_hostname()

    def ip_address(self) -> str:
        """Primary IPv4 address."""
        return get_ip_address()

    def model(self) -> str:
        """Board model from the device tree (e.g. ``Raspberry Pi 4 Model B``), or ``unknown``."""
        model_file = Path("/proc/device-tree/model")
        if model_file.exists():
            raw = model_file.read_bytes().replace(b"\x00", b"").decode("utf-8", errors="ignore").strip()
            if raw:
                return raw
        return read_text_file(model_file) or "unknown"

    def os_release(self) -> str:
        # /etc/os-release carries HOME_URL, SUPPORT_URL, BUG_REPORT_URL and about a
        # dozen other keys: showing the whole file in a dashboard card is
        # unreadable. PRETTY_NAME is the label meant for user interfaces.
        """Human-readable OS name (``PRETTY_NAME``) from ``/etc/os-release``."""
        raw = read_text_file(Path("/etc/os-release"))
        for line in raw.splitlines():
            if line.startswith("PRETTY_NAME="):
                return line.split("=", 1)[1].strip().strip('"')
        return raw

    def os_release_full(self) -> str:
        """Complete content of ``/etc/os-release``."""
        return read_text_file(Path("/etc/os-release"))

    def python_version(self) -> str:
        """Output of ``python3 --version``."""
        completed = subprocess.run(["python3", "--version"], capture_output=True, text=True, check=False)
        return completed.stdout.strip() or "unknown"

    def cpu_temperature(self) -> Optional[float]:
        """CPU temperature in degrees Celsius, or None."""
        return read_cpu_temperature()

    def memory(self) -> dict[str, Any]:
        """Used, available and total RAM in MB plus the usage percentage."""
        memory = psutil.virtual_memory()
        return {
            "used_mb": round(memory.used / 1024 / 1024, 1),
            "available_mb": round(memory.available / 1024 / 1024, 1),
            "total_mb": round(memory.total / 1024 / 1024, 1),
            "percent": memory.percent,
        }

    def disk(self) -> dict[str, Any]:
        """Used, free and total space in GB of the volume holding the project."""
        usage = psutil.disk_usage(str(PROJECT_ROOT))
        return {
            "used_gb": round(usage.used / 1024 / 1024 / 1024, 2),
            "free_gb": round(usage.free / 1024 / 1024 / 1024, 2),
            "total_gb": round(usage.total / 1024 / 1024 / 1024, 2),
            "percent": usage.percent,
        }

    def camera_tools(self) -> dict[str, bool]:
        """Which camera tools (libcamera, rpicam, picamera2) are installed."""
        return {
            "libcamera_hello": which("libcamera-hello") is not None,
            "rpicam_hello": which("rpicam-hello") is not None,
            "libcamera_vid": which("libcamera-vid") is not None,
            "rpicam_vid": which("rpicam-vid") is not None,
            "picamera2": _module_available("picamera2"),
        }

    def camera_list(self) -> str:
        """List the cameras seen by libcamera/rpicam, with a 3 s limit and process-group kill so a hung tool cannot block the dashboard."""
        for command in (["libcamera-hello", "--list-cameras"], ["rpicam-hello", "--list-cameras"]):
            if not which(command[0]):
                continue
            process = None
            try:
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    start_new_session=True,
                )
                output, _ = process.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                if process is not None:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait(timeout=2)
                LOGGER.warning("Camera listing timed out command=%r", command)
                continue
            except OSError as exc:
                LOGGER.warning("Camera listing failed command=%r error=%s", command, exc)
                continue
            if output:
                return output
        return "No camera tooling available"

    def lsusb(self) -> str:
        """Output of ``lsusb``."""
        _, output = run_command(["lsusb"], timeout=10)
        return output

    def i2cdetect(self) -> str:
        """List I2C adapters without actively probing camera bus addresses."""
        _, output = run_command(["i2cdetect", "-l"], timeout=8)
        return output

    def video_devices(self) -> list[str]:
        """Paths of the ``/dev/video*`` nodes."""
        return safe_device_listing("/dev/video*")

    def get_camera(self) -> str:
        """Output of ``vcgencmd get_camera`` when available."""
        if which("vcgencmd") is None:
            return "vcgencmd not available"
        _, output = run_command(["vcgencmd", "get_camera"], timeout=8)
        return output

    def uname(self) -> str:
        """Output of ``uname -a``."""
        _, output = run_command(["uname", "-a"], timeout=8)
        return output

    def uptime(self) -> str:
        """Human-readable uptime."""
        _, output = run_command(["uptime", "-p"], timeout=8)
        return output or human_uptime(get_boot_seconds())

    def preflight_summary(self) -> dict[str, Any]:
        """Every fact above in one dictionary, used by the pre-flight report."""
        return {
            "hostname": self.hostname(),
            "ip_address": self.ip_address(),
            "model": self.model(),
            "os_release": self.os_release(),
            "python_version": self.python_version(),
            "cpu_temperature_c": self.cpu_temperature(),
            "memory": self.memory(),
            "disk": self.disk(),
            "camera_tools": self.camera_tools(),
            "camera_list": self.camera_list(),
            "lsusb": self.lsusb(),
            "i2cdetect": self.i2cdetect(),
            "video_devices": self.video_devices(),
            "vcgencmd_get_camera": self.get_camera(),
            "uname": self.uname(),
            "uptime": self.uptime(),
        }

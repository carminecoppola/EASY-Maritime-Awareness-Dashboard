# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Small system helpers shared by the dashboard modules (time, uptime, shell, host information)."""

from __future__ import annotations

import socket
import subprocess
import time
from pathlib import Path
from typing import Iterable, Optional

import psutil


def utc_now_iso() -> str:
    """Current UTC time as ``YYYY-MM-DDTHH:MM:SSZ``."""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def rome_now_iso() -> str:
    """Current time in the Europe/Rome zone (falls back to the local zone if tz data is missing)."""
    try:
        from zoneinfo import ZoneInfo
        from datetime import datetime

        return datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds")
    except Exception:
        from datetime import datetime, timezone

        return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def human_uptime(seconds: int | float | None) -> str:
    """Format a duration in seconds as ``Xd Xh Xm Xs`` (``--`` when unknown)."""
    if seconds is None:
        return "--"
    hours, rem = divmod(max(0, int(seconds)), 3600)
    minutes, secs = divmod(rem, 60)
    days, hours = divmod(hours, 24)
    if days:
        return f"{days}d {hours}h {minutes}m {secs}s"
    return f"{hours}h {minutes}m {secs}s"


def run_command(command: Iterable[str], timeout: int = 8) -> tuple[int, str]:
    """Run a command and return ``(exit_code, combined_output)``; never raises (errors become exit code 1)."""
    try:
        completed = subprocess.run(
            list(command),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        output = (completed.stdout or "") + (completed.stderr or "")
        return completed.returncode, output.strip()
    except Exception as exc:
        return 1, f"{type(exc).__name__}: {exc}"


def which(command: str) -> Optional[str]:
    """Locate an executable on the PATH."""
    from shutil import which as _which

    return _which(command)


def read_text_file(path: Path) -> str:
    """Return the stripped content of a text file, or an empty string if unreadable."""
    try:
        return path.read_text().strip()
    except Exception:
        return ""


def read_cpu_temperature() -> Optional[float]:
    """CPU temperature in degrees Celsius from the Linux thermal zone (None elsewhere)."""
    temp_path = Path("/sys/class/thermal/thermal_zone0/temp")
    try:
        raw = temp_path.read_text().strip()
        return round(int(raw) / 1000.0, 1)
    except Exception:
        return None


def get_hostname() -> str:
    """Host name, or ``unknown``."""
    try:
        return socket.gethostname()
    except Exception:
        return "unknown"


def get_ip_address() -> str:
    """Primary outgoing IPv4 address (found without sending traffic), or 127.0.0.1."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return str(sock.getsockname()[0])
    except OSError:
        return "127.0.0.1"


def get_boot_seconds() -> int:
    """Seconds since the system booted."""
    try:
        return int(time.time() - psutil.boot_time())
    except Exception:
        return 0


def safe_device_listing(pattern: str) -> list[str]:
    """Sorted paths matching a glob pattern, e.g. ``/dev/video*``."""
    import glob

    return sorted(glob.glob(pattern))

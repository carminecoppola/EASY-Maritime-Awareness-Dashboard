# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""PureThermal node discovery that never opens the fragile capture device.

The PureThermal (FLIR Lepton) firmware can stop producing frames if it is
probed right before a capture, so devices are identified only by their name in
``v4l2-ctl --list-devices`` or in ``/sys/class/video4linux``. Format and size
negotiation is deferred to the real, bounded capture.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .utils import read_text_file


class PureThermalDiscovery:
    """Find and rank V4L2 nodes that identify as PureThermal/FLIR/Lepton."""

    def __init__(self, video_size: str) -> None:
        """``video_size`` is the configured capture size, e.g. ``160x120``."""
        self.video_size = video_size

    @staticmethod
    def name_looks_thermal(name: str) -> bool:
        """True when a device name mentions PureThermal, FLIR or Lepton."""
        normalized = str(name or "").lower()
        return any(token in normalized for token in ("purethermal", "pure thermal", "flir", "lepton"))

    def is_purethermal_device(self, device_path: str) -> bool:
        """True when the sysfs name of ``/dev/videoN`` looks thermal."""
        name_path = Path("/sys/class/video4linux") / Path(device_path).name / "name"
        return self.name_looks_thermal(read_text_file(name_path))

    def inspect_candidate(self, device_path: str, name: str, source: str) -> dict[str, Any]:
        """Describe a node without a capability ioctl before real capture.

        PureThermal firmware v1.3.0 can stop producing frames when capability
        probing immediately precedes acquisition. Format negotiation therefore
        remains in the bounded FFmpeg transaction.
        """
        formats: list[str] = []
        sizes: list[str] = []
        normalized_formats = {item.lower() for item in formats}
        return {
            "path": device_path,
            "name": name,
            "source": source,
            "formats": formats,
            "sizes": sizes,
            "supports_y16": "y16 " in normalized_formats or "y16" in normalized_formats,
            "supports_configured_size": self.video_size.lower() in {item.lower() for item in sizes},
            "error": "capabilities deferred until capture",
        }

    def discover_with_v4l2_ctl(self) -> list[dict[str, Any]]:
        """Candidates found through ``v4l2-ctl --list-devices`` (empty if the tool is missing)."""
        if shutil.which("v4l2-ctl") is None:
            return []
        result = subprocess.run(
            ["v4l2-ctl", "--list-devices"],
            capture_output=True,
            text=True,
            timeout=4.0,
            check=False,
        )
        if result.returncode != 0:
            return []

        candidates: list[dict[str, Any]] = []
        current_name = ""
        for raw_line in result.stdout.splitlines():
            line = raw_line.rstrip()
            if not line:
                current_name = ""
                continue
            if not line.startswith(("\t", " ")):
                current_name = line
                continue
            device_path = line.strip()
            if device_path.startswith("/dev/video") and self.name_looks_thermal(current_name):
                candidates.append(self.inspect_candidate(device_path, current_name, "v4l2-ctl"))
        return candidates

    def discover_with_sysfs(self) -> list[dict[str, Any]]:
        """Candidates found by reading ``/sys/class/video4linux/*/name``."""
        candidates: list[dict[str, Any]] = []
        for video_node in sorted(Path("/sys/class/video4linux").glob("video*")):
            name = read_text_file(video_node / "name")
            if self.name_looks_thermal(name):
                candidates.append(self.inspect_candidate(f"/dev/{video_node.name}", name, "sysfs"))
        return candidates

    @staticmethod
    def select_candidate(candidates: list[dict[str, Any]]) -> str:
        """Choose the best node and flag it with ``selected``: Y16 support first, then the configured size, then the lowest node number."""

        def score(candidate: dict[str, Any]) -> tuple[int, int, int]:
            """Ranking key: Y16 support, configured size, then the lower node number."""
            path_match = re.search(r"(\d+)$", str(candidate.get("path", "")))
            node_number = int(path_match.group(1)) if path_match else 9999
            return (
                int(bool(candidate.get("supports_y16"))),
                int(bool(candidate.get("supports_configured_size"))),
                -node_number,
            )

        selected = max(candidates, key=score)
        for candidate in candidates:
            candidate["selected"] = candidate is selected
        return str(selected["path"])

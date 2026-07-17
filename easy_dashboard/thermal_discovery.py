from __future__ import annotations

"""PureThermal node discovery without opening the fragile capture device."""

import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .utils import read_text_file


class PureThermalDiscovery:
    """Find and rank V4L2 nodes that identify as PureThermal/FLIR/Lepton."""

    def __init__(self, video_size: str) -> None:
        self.video_size = video_size

    @staticmethod
    def name_looks_thermal(name: str) -> bool:
        normalized = str(name or "").lower()
        return any(token in normalized for token in ("purethermal", "pure thermal", "flir", "lepton"))

    def is_purethermal_device(self, device_path: str) -> bool:
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
        candidates: list[dict[str, Any]] = []
        for video_node in sorted(Path("/sys/class/video4linux").glob("video*")):
            name = read_text_file(video_node / "name")
            if self.name_looks_thermal(name):
                candidates.append(self.inspect_candidate(f"/dev/{video_node.name}", name, "sysfs"))
        return candidates

    @staticmethod
    def select_candidate(candidates: list[dict[str, Any]]) -> str:
        """Prefer radiometric Y16, configured size, then the lowest node id."""

        def score(candidate: dict[str, Any]) -> tuple[int, int, int]:
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

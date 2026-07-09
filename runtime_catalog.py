from __future__ import annotations

"""Shared runtime catalog used by device and source managers.

Both managers expose the same logical EASY endpoints: replay, RGB left,
RGB right and thermal. Keeping the canonical naming in one module avoids
drift between UI-facing source labels and runtime-facing device labels.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class RuntimeEndpointSpec:
    endpoint_id: str
    display_name: str
    device_type: str
    source_type: str
    driver: str
    serial_number: str
    device_status: str
    device_health: str
    source_enabled: bool = True
    device_configuration: dict[str, Any] = field(default_factory=dict)
    source_configuration: dict[str, Any] = field(default_factory=dict)


def build_runtime_endpoint_catalog(runtime_root: Path | str, replay_root: Path | str) -> list[RuntimeEndpointSpec]:
    runtime_root = Path(runtime_root)
    replay_root = Path(replay_root)
    return [
        RuntimeEndpointSpec(
            endpoint_id="replay",
            display_name="Replay Folder",
            device_type="replay",
            source_type="replay_folder",
            driver="folder-frame-provider",
            serial_number="replay-local",
            device_status="CONNECTED",
            device_health="GOOD",
            device_configuration={
                "replay_root": str(replay_root),
                "role": "replay",
                "always_available": True,
                "fps": 0.0,
            },
            source_configuration={
                "runtime_root": str(runtime_root),
                "replay_dir": str(replay_root),
                "role": "primary_replay",
                "supports_live": False,
            },
        ),
        RuntimeEndpointSpec(
            endpoint_id="rgb_left",
            display_name="RGB LEFT",
            device_type="rgb",
            source_type="camera_placeholder",
            driver="placeholder",
            serial_number="rgb-left-placeholder",
            device_status="NOT_PRESENT",
            device_health="OFFLINE",
            device_configuration={
                "side": "left",
                "transport": "libcamera",
                "present": False,
            },
            source_configuration={
                "transport": "libcamera",
                "provider": "RGB",
                "side": "left",
                "supports_live": True,
            },
        ),
        RuntimeEndpointSpec(
            endpoint_id="rgb_right",
            display_name="RGB RIGHT",
            device_type="rgb",
            source_type="camera_placeholder",
            driver="placeholder",
            serial_number="rgb-right-placeholder",
            device_status="NOT_PRESENT",
            device_health="OFFLINE",
            device_configuration={
                "side": "right",
                "transport": "libcamera",
                "present": False,
            },
            source_configuration={
                "transport": "libcamera",
                "provider": "RGB",
                "side": "right",
                "supports_live": True,
            },
        ),
        RuntimeEndpointSpec(
            endpoint_id="thermal",
            display_name="THERMAL",
            device_type="thermal",
            source_type="thermal_placeholder",
            driver="placeholder",
            serial_number="thermal-placeholder",
            device_status="NOT_PRESENT",
            device_health="OFFLINE",
            device_configuration={
                "transport": "flir",
                "present": False,
            },
            source_configuration={
                "transport": "flir",
                "provider": "THERMAL",
                "supports_live": True,
            },
        ),
    ]

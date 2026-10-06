# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Canonical catalog of the EASY endpoints shared by the device and source managers.

Both managers expose the same four logical endpoints: ``replay``, ``rgb_left``,
``rgb_right`` and ``thermal``. Defining their names, types and capabilities in
one place prevents drift between the UI-facing source labels and the
runtime-facing device labels.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class RuntimeEndpointSpec:
    """Static description of one endpoint, as seen both as a device and as a source.

    The ``device_*`` fields describe the physical or virtual hardware, the
    ``source_*`` fields describe how its frames are consumed by the pipeline.
    """
    endpoint_id: str
    display_name: str
    device_type: str
    source_type: str
    driver: str
    serial_number: str
    device_status: str
    device_health: str
    source_enabled: bool = True
    source_capabilities: dict[str, Any] = field(default_factory=dict)
    device_configuration: dict[str, Any] = field(default_factory=dict)
    source_configuration: dict[str, Any] = field(default_factory=dict)


def build_runtime_endpoint_catalog(runtime_root: Path | str, replay_root: Path | str) -> list[RuntimeEndpointSpec]:
    """Return the default catalog of endpoints.

    Camera and thermal entries start as NOT_PRESENT placeholders; the hardware
    managers replace them with live state once a real device is detected. The
    replay endpoint is always available and reads frames from ``replay_root``.
    """
    runtime_root = Path(runtime_root)
    replay_root = Path(replay_root)
    return [
        RuntimeEndpointSpec(
            endpoint_id="replay",
            display_name="Recorded Dataset",
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
            source_capabilities={
                "live": False,
                "capture": False,
                "inference": True,
                "dataset_role": "replay",
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
            source_capabilities={
                "live": True,
                "capture": True,
                "inference": True,
                "dataset_role": "rgb_left",
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
            source_capabilities={
                "live": True,
                "capture": True,
                "inference": True,
                "dataset_role": "rgb_right",
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
            source_capabilities={
                "live": True,
                "capture": True,
                "inference": False,
                "dataset_role": "thermal",
            },
        ),
    ]

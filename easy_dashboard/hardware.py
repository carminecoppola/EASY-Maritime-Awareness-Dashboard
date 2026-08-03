from __future__ import annotations

"""Backward-compatible re-export shim.

RgbMasterSource and ThermalState used to live together in this single file.
They now live in rgb_hardware.py and thermal_hardware.py respectively (split
apart once their RGB/thermal coordination was removed, see app.py), but every
existing `from easy_dashboard.hardware import ...` keeps working unchanged.
"""

from .rgb_hardware import RgbMasterSource
from .system_probe import SystemProbe
from .thermal_hardware import ThermalState

__all__ = ["RgbMasterSource", "SystemProbe", "ThermalState"]

# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Backward-compatible re-export of the hardware adapters.

``RgbMasterSource`` and ``ThermalState`` live in ``rgb_hardware.py`` and
``thermal_hardware.py``; ``SystemProbe`` lives in ``system_probe.py``. Importing
them from here keeps ``from easy_dashboard.hardware import ...`` working.
"""

from __future__ import annotations

from .rgb_hardware import RgbMasterSource
from .system_probe import SystemProbe
from .thermal_hardware import ThermalState

__all__ = ["RgbMasterSource", "SystemProbe", "ThermalState"]

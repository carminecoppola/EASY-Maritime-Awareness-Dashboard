# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Application package of the EASY dashboard.

It keeps the Flask entry point (``app.py``) small by giving each concern its
own module: configuration, persistent stores, media helpers, hardware adapters,
HTTP routes and the payload builders behind the UI.
"""

__version__ = "1.0.0"

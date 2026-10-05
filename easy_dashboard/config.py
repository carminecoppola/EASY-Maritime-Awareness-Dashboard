# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Dashboard configuration loader.

``config.yaml`` is parsed with a tiny built-in reader (nested ``key: value``
pairs, comments, booleans, numbers, ``null``) and deep-merged over
``constants.DEFAULT_CONFIG``, so a missing or partial file still yields a
complete configuration. No YAML library is needed on the Raspberry for this.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from .constants import CONFIG_PATH, DEFAULT_CONFIG


def _coerce_scalar(raw: str) -> Any:
    """Convert a YAML scalar string into bool, None, float, int or a de-quoted string."""
    value = raw.strip()
    lower = value.lower()
    if lower in {"true", "yes", "on"}:
        return True
    if lower in {"false", "no", "off"}:
        return False
    if lower in {"null", "none", "~"}:
        return None
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value.strip("\"'")


def load_simple_yaml(path: Path) -> Dict[str, Any]:
    """Parse the restricted YAML subset used by ``config.yaml`` (empty dict if the file is missing).

    Nesting is derived from indentation; lists and multi-line values are not supported.
    """
    if not path.exists():
        return {}
    root: Dict[str, Any] = {}
    stack: list[tuple[int, Dict[str, Any]]] = [(0, root)]
    for raw_line in path.read_text().splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        while len(stack) > 1 and indent < stack[-1][0]:
            stack.pop()
        current = stack[-1][1]
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not value:
            child: Dict[str, Any] = {}
            current[key] = child
            stack.append((indent + 2, child))
        else:
            current[key] = _coerce_scalar(value)
    return root


def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge ``override`` over ``base`` without modifying either."""
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_config() -> Dict[str, Any]:
    """Load ``config.yaml`` and merge it over the project defaults."""
    return deep_merge(DEFAULT_CONFIG, load_simple_yaml(CONFIG_PATH))

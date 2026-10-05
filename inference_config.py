# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Load and resolve the inference runtime configuration.

The configuration lives in ``runtime/config/inference_config.json`` (a YAML
file with the same schema is accepted as well). It names the ONNX model, the
detection thresholds, the class list and the output directories.

This module has no dependency on the runtime managers, so configuration
failures can be tested without creating camera, session or inference services.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = PROJECT_ROOT / "runtime"
DEFAULT_MODEL_PATH = "runtime/models/easy_v3_aboships_640.onnx"
DEFAULT_CONFIG_CANDIDATES = (
    RUNTIME_ROOT / "config" / "inference_config.json",
    RUNTIME_ROOT / "config" / "inference_config.yaml",
    RUNTIME_ROOT / "config" / "inference_config.yml",
)


def _load_json(path: Path) -> dict[str, Any]:
    """Parse a JSON configuration file."""
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _load_yaml(path: Path) -> dict[str, Any]:
    """Parse a YAML configuration file (requires the optional PyYAML package)."""
    try:
        import yaml  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            f"PyYAML is not installed, cannot parse {path.name}. "
            "Use inference_config.json or install PyYAML."
        ) from exc

    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def load_runtime_config(config_path: Path | None = None) -> dict[str, Any]:
    """Load the first available configuration file and tag it with ``_loaded_from``.

    When ``config_path`` is given only that file is considered; otherwise the
    default candidates under ``runtime/config/`` are tried in order.

    Raises:
        FileNotFoundError: no candidate exists.
        ValueError: the file does not contain a JSON/YAML object.
    """
    candidates = (config_path,) if config_path else DEFAULT_CONFIG_CANDIDATES
    for candidate in candidates:
        if not candidate or not candidate.exists():
            continue
        suffix = candidate.suffix.lower()
        if suffix == ".json":
            config = _load_json(candidate)
        elif suffix in {".yaml", ".yml"}:
            config = _load_yaml(candidate)
        else:
            continue
        if not isinstance(config, dict):
            raise ValueError(f"Inference config must contain an object: {candidate}")
        config["_loaded_from"] = str(candidate)
        return config
    raise FileNotFoundError("No inference config found under runtime/config/")


def resolve_runtime_path(relative_path: str) -> Path:
    """Resolve a configuration path: absolute paths are kept, relative ones are anchored at the project root."""
    path = Path(relative_path)
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()

from __future__ import annotations

"""Load and resolve inference runtime configuration.

This module has no runtime-manager dependencies, so configuration failures can
be tested without creating camera, session, or inference services.
"""

import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = PROJECT_ROOT / "runtime"
DEFAULT_CONFIG_CANDIDATES = (
    RUNTIME_ROOT / "config" / "inference_config.json",
    RUNTIME_ROOT / "config" / "inference_config.yaml",
    RUNTIME_ROOT / "config" / "inference_config.yml",
)


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _load_yaml(path: Path) -> dict[str, Any]:
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
    path = Path(relative_path)
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()

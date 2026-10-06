# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""ONNX Runtime backend used by the inference worker.

The worker owns orchestration, frame selection and persisted results. The
backend owns model loading and execution, which keeps Raspberry-specific
runtime tuning away from the acquisition loop.

The number of CPU threads can be set with the ``EASY_ONNX_THREADS``
environment variable (default: min(CPU count, 4)).
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

import numpy as np


class OnnxDetectionBackend:
    """Lazily created, CPU-only ONNX Runtime session for the embedded detector.

    The model is loaded on first use, under a lock, so concurrent requests never
    build two sessions.
    """

    name = "onnx"

    def __init__(self, model_path: Path | str) -> None:
        """Remember the model path and resolve the thread budget (never above the CPU count)."""
        self.model_path = Path(model_path)
        self._session: Any | None = None
        self._input_name = ""
        self._error = ""
        self._lock = threading.Lock()
        cpu_count = os.cpu_count() or 1
        try:
            configured_threads = int(os.environ.get("EASY_ONNX_THREADS", min(cpu_count, 4)))
        except ValueError:
            configured_threads = min(cpu_count, 4)
        self._threads = max(1, min(configured_threads, cpu_count))

    @property
    def loaded(self) -> bool:
        """True once the ONNX session has been created."""
        return self._session is not None

    @property
    def error(self) -> str:
        """Last load error, or an empty string."""
        return self._error

    def ensure_loaded(self) -> tuple[bool, str]:
        """Create the ONNX session if needed. Returns ``(ok, error_message)``."""
        if self._session is not None:
            return True, ""
        with self._lock:
            if self._session is not None:
                return True, ""
            try:
                import onnxruntime as ort  # type: ignore
            except ImportError:
                self._error = "onnxruntime is not installed"
                return False, self._error

            if not self.model_path.exists():
                self._error = f"Model not found: {self.model_path}"
                return False, self._error

            try:
                options = ort.SessionOptions()
                options.intra_op_num_threads = self._threads
                # # One operator at a time: on a 4-core Raspberry, intra-op parallelism is enough
                # # and keeps CPU and memory use predictable.
                options.inter_op_num_threads = 1
                options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                # # Idle worker threads sleep instead of spinning, which lowers CPU load and
                # # temperature when the detector is waiting for the next frame.
                options.add_session_config_entry("session.intra_op.allow_spinning", "0")
                self._session = ort.InferenceSession(
                    str(self.model_path),
                    sess_options=options,
                    providers=["CPUExecutionProvider"],
                )
                self._input_name = str(self._session.get_inputs()[0].name)
                self._error = ""
                return True, ""
            except Exception as exc:  # pragma: no cover - runtime specific
                self._session = None
                self._input_name = ""
                self._error = f"Failed to load ONNX model: {exc}"
                return False, self._error

    def run(self, tensor: np.ndarray) -> list[np.ndarray]:
        """Run the network on an NCHW float32 tensor and return all output arrays."""
        ok, error = self.ensure_loaded()
        if not ok or self._session is None:
            raise RuntimeError(error or "ONNX session unavailable")
        return list(self._session.run(None, {self._input_name: tensor}))

    def status(self) -> dict[str, Any]:
        """Describe the backend for the status API (model, providers, threads, load state)."""
        return {
            "name": self.name,
            "model_path": str(self.model_path),
            "loaded": self.loaded,
            "error": self.error,
            "providers": ["CPUExecutionProvider"],
            "cpu_threads": self._threads,
            "execution_mode": "sequential",
            "graph_optimization": "all",
        }

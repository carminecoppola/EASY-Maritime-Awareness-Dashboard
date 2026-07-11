from __future__ import annotations

"""Model-runtime backends used by the inference worker.

The worker owns orchestration, frame selection and persisted results. Backends
own model loading and execution details, which keeps Raspberry runtime
compatibility changes away from the acquisition loop.
"""

import os
import threading
from pathlib import Path
from typing import Any

import numpy as np


class OnnxDetectionBackend:
    """Lazy CPU-only ONNX Runtime session for the embedded detector."""

    name = "onnx"

    def __init__(self, model_path: Path | str) -> None:
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
        return self._session is not None

    @property
    def error(self) -> str:
        return self._error

    def ensure_loaded(self) -> tuple[bool, str]:
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
                options.inter_op_num_threads = 1
                options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
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
        ok, error = self.ensure_loaded()
        if not ok or self._session is None:
            raise RuntimeError(error or "ONNX session unavailable")
        return list(self._session.run(None, {self._input_name: tensor}))

    def status(self) -> dict[str, Any]:
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

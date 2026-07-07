from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from frame_provider import FrameObject, UnifiedFrameProvider


PROJECT_ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = PROJECT_ROOT / "runtime"
DEFAULT_CONFIG_CANDIDATES = [
    RUNTIME_ROOT / "config" / "inference_config.json",
    RUNTIME_ROOT / "config" / "inference_config.yaml",
    RUNTIME_ROOT / "config" / "inference_config.yml",
]
ALLOWED_CLASSES = {"boat", "ship", "buoy"}
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


@dataclass(frozen=True)
class Detection:
    class_id: int
    class_name: str
    confidence: float
    box_xyxy: Tuple[float, float, float, float]


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _load_yaml(path: Path) -> dict:
    try:
        import yaml  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            f"PyYAML is not installed, cannot parse {path.name}. "
            "Use inference_config.json or install PyYAML."
        ) from exc

    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def load_runtime_config(config_path: Path | None = None) -> dict:
    candidates = [config_path] if config_path else list(DEFAULT_CONFIG_CANDIDATES)
    for candidate in candidates:
        if not candidate or not candidate.exists():
            continue
        suffix = candidate.suffix.lower()
        if suffix == ".json":
            config = _load_json(candidate)
            config["_loaded_from"] = str(candidate)
            return config
        if suffix in {".yaml", ".yml"}:
            config = _load_yaml(candidate)
            config["_loaded_from"] = str(candidate)
            return config
    raise FileNotFoundError("No inference config found under runtime/config/")


def resolve_runtime_path(relative_path: str) -> Path:
    path = Path(relative_path)
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def find_first_image(replay_dir: Path) -> Path:
    if not replay_dir.exists():
        raise FileNotFoundError(f"Replay directory not found: {replay_dir}")
    for path in sorted(replay_dir.rglob("*")):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            return path
    raise FileNotFoundError(f"No image found in {replay_dir}")


def list_images(replay_dir: Path) -> List[Path]:
    if not replay_dir.exists():
        return []
    return [
        path
        for path in sorted(replay_dir.rglob("*"))
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    ]


def letterbox(
    image: np.ndarray,
    new_shape: int | Tuple[int, int],
    color: Tuple[int, int, int] = (114, 114, 114),
) -> Tuple[np.ndarray, float, Tuple[float, float]]:
    shape = image.shape[:2]
    if isinstance(new_shape, int):
        new_shape = (new_shape, new_shape)

    ratio = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
    new_unpad = (int(round(shape[1] * ratio)), int(round(shape[0] * ratio)))
    dw = (new_shape[1] - new_unpad[0]) / 2.0
    dh = (new_shape[0] - new_unpad[1]) / 2.0

    if shape[::-1] != new_unpad:
        resized = Image.fromarray(image).resize(new_unpad, Image.BILINEAR)
        image = np.asarray(resized)

    top = int(round(dh - 0.1))
    bottom = int(round(dh + 0.1))
    left = int(round(dw - 0.1))
    right = int(round(dw + 0.1))
    padded = np.full((new_shape[0], new_shape[1], 3), color, dtype=np.uint8)
    padded[top : top + image.shape[0], left : left + image.shape[1]] = image
    return padded, ratio, (dw, dh)


def preprocess_image(image_path: Path, input_size: int) -> Tuple[np.ndarray, np.ndarray, float, Tuple[float, float]]:
    image = Image.open(image_path).convert("RGB")
    rgb = np.asarray(image)
    return preprocess_array(rgb, input_size)


def preprocess_array(rgb: np.ndarray, input_size: int) -> Tuple[np.ndarray, np.ndarray, float, Tuple[float, float]]:
    letterboxed, ratio, pad = letterbox(rgb, input_size)
    tensor = letterboxed.astype(np.float32) / 255.0
    tensor = np.transpose(tensor, (2, 0, 1))[None, ...]
    return tensor, rgb, ratio, pad


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def box_iou(box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    if boxes.size == 0:
        return np.empty((0,), dtype=np.float32)
    x1 = np.maximum(box[0], boxes[:, 0])
    y1 = np.maximum(box[1], boxes[:, 1])
    x2 = np.minimum(box[2], boxes[:, 2])
    y2 = np.minimum(box[3], boxes[:, 3])
    inter_w = np.maximum(0.0, x2 - x1)
    inter_h = np.maximum(0.0, y2 - y1)
    inter = inter_w * inter_h
    area_box = np.maximum(0.0, box[2] - box[0]) * np.maximum(0.0, box[3] - box[1])
    area_boxes = np.maximum(0.0, boxes[:, 2] - boxes[:, 0]) * np.maximum(0.0, boxes[:, 3] - boxes[:, 1])
    union = area_box + area_boxes - inter
    return np.where(union > 0.0, inter / union, 0.0)


def nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> List[int]:
    if boxes.size == 0:
        return []
    order = scores.argsort()[::-1]
    keep: List[int] = []
    while order.size > 0:
        current = int(order[0])
        keep.append(current)
        if order.size == 1:
            break
        ious = box_iou(boxes[current], boxes[order[1:]])
        remaining = np.where(ious <= iou_threshold)[0]
        order = order[remaining + 1]
    return keep


def scale_boxes_to_image(
    boxes: np.ndarray,
    ratio: float,
    pad: Tuple[float, float],
    image_shape: Tuple[int, int],
) -> np.ndarray:
    boxes = boxes.copy()
    boxes[:, [0, 2]] -= pad[0]
    boxes[:, [1, 3]] -= pad[1]
    boxes[:, :4] /= ratio
    h, w = image_shape
    boxes[:, 0] = np.clip(boxes[:, 0], 0, w - 1)
    boxes[:, 1] = np.clip(boxes[:, 1], 0, h - 1)
    boxes[:, 2] = np.clip(boxes[:, 2], 0, w - 1)
    boxes[:, 3] = np.clip(boxes[:, 3], 0, h - 1)
    return boxes


def decode_yolo_output(
    outputs: Sequence[np.ndarray],
    conf_threshold: float,
    iou_threshold: float,
    class_names: Dict[int, str],
    allowed_class_names: Iterable[str],
    ratio: float,
    pad: Tuple[float, float],
    image_shape: Tuple[int, int],
    input_size: int,
) -> List[Detection]:
    raw = np.asarray(outputs[0])
    raw = np.squeeze(raw)
    if raw.ndim != 2:
        raise RuntimeError(f"Unexpected ONNX output shape: {raw.shape}")
    if raw.shape[0] < raw.shape[1] and raw.shape[0] <= 128:
        raw = raw.T
    if raw.shape[1] < 5:
        raise RuntimeError(f"Unexpected ONNX output format: {raw.shape}")

    boxes = raw[:, :4].astype(np.float32)
    class_scores = raw[:, 4:].astype(np.float32)
    if class_scores.size and (class_scores.min() < -0.1 or class_scores.max() > 1.1):
        class_scores = sigmoid(class_scores)

    if boxes.size and float(boxes.max()) <= 2.0:
        boxes *= float(input_size)

    allowed_ids = [class_id for class_id, name in class_names.items() if name in set(allowed_class_names)]
    detections: List[Detection] = []
    if not allowed_ids:
        return detections

    for class_id in allowed_ids:
        if class_id >= class_scores.shape[1]:
            continue
        class_conf = class_scores[:, class_id]
        mask = class_conf >= conf_threshold
        if not np.any(mask):
            continue
        candidate_boxes = boxes[mask]
        candidate_scores = class_conf[mask]
        candidate_boxes_xyxy = np.zeros_like(candidate_boxes)
        candidate_boxes_xyxy[:, 0] = candidate_boxes[:, 0] - candidate_boxes[:, 2] / 2.0
        candidate_boxes_xyxy[:, 1] = candidate_boxes[:, 1] - candidate_boxes[:, 3] / 2.0
        candidate_boxes_xyxy[:, 2] = candidate_boxes[:, 0] + candidate_boxes[:, 2] / 2.0
        candidate_boxes_xyxy[:, 3] = candidate_boxes[:, 1] + candidate_boxes[:, 3] / 2.0
        keep = nms(candidate_boxes_xyxy, candidate_scores, iou_threshold)
        selected_boxes = scale_boxes_to_image(candidate_boxes_xyxy[keep], ratio, pad, image_shape) if keep else []
        selected_scores = candidate_scores[keep] if keep else []
        for box, score in zip(selected_boxes, selected_scores):
            detections.append(
                Detection(
                    class_id=class_id,
                    class_name=class_names[class_id],
                    confidence=float(score),
                    box_xyxy=tuple(float(value) for value in box),
                )
            )

    detections.sort(key=lambda item: item.confidence, reverse=True)
    return detections


def draw_detections(image_path: Path, detections: Sequence[Detection], output_path: Path) -> None:
    image = Image.open(image_path).convert("RGB")
    draw_detections_on_image(image, detections, output_path)


def draw_detections_on_array(image_rgb: np.ndarray, detections: Sequence[Detection], output_path: Path) -> None:
    image = Image.fromarray(image_rgb.astype(np.uint8)).convert("RGB")
    draw_detections_on_image(image, detections, output_path)


def draw_detections_on_image(image: Image.Image, detections: Sequence[Detection], output_path: Path) -> None:
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 18)
    except Exception:  # pragma: no cover - platform dependent
        font = ImageFont.load_default()

    palette = {
        "boat": (255, 165, 0),
        "ship": (0, 200, 255),
        "buoy": (255, 80, 80),
    }

    for detection in detections:
        x1, y1, x2, y2 = detection.box_xyxy
        color = palette.get(detection.class_name, (255, 255, 255))
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        label = f"{detection.class_name} {detection.confidence:.2f}"
        bbox = draw.textbbox((0, 0), label, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        text_x = max(0, x1)
        text_y = max(0, y1 - text_h - 4)
        draw.rectangle([text_x, text_y, text_x + text_w + 8, text_y + text_h + 4], fill=color)
        draw.text((text_x + 4, text_y + 2), label, fill=(0, 0, 0), font=font)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, quality=95)


def _atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(path.name + ".tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    temp_path.replace(path)


class InferenceWorker:
    def __init__(self, events: Any | None = None, config_path: Path | None = None, detection_manager: Any | None = None) -> None:
        self.events = events
        self.detection_manager = detection_manager
        self.config_path = config_path
        self._config_error = ""
        try:
            self.config = load_runtime_config(config_path)
        except Exception as exc:
            self.config = {
                "runtime_root": "runtime",
                "model": {
                    "preferred_path": "runtime/models/easy_v1_best_rgb.onnx",
                    "fallback_path": "runtime/models/easy_v1_best_rgb.pt",
                    "type": "onnx",
                },
                "inference": {
                    "confidence_threshold": 0.25,
                    "iou_threshold": 0.45,
                    "input_size": 640,
                },
                "classes": [
                    {"id": 0, "name": "boat"},
                    {"id": 1, "name": "ship"},
                    {"id": 2, "name": "buoy"},
                ],
                "outputs": {
                    "sessions_dir": "runtime/sessions",
                    "replay_dir": "runtime/replay",
                    "logs_dir": "runtime/logs",
                },
            }
            self.config["_loaded_from"] = str(config_path or "")
            self._config_error = str(exc)
        self.runtime_root = resolve_runtime_path(self.config.get("runtime_root", "runtime"))
        self.sessions_dir = resolve_runtime_path(self.config.get("outputs", {}).get("sessions_dir", "runtime/sessions"))
        self.replay_dir = resolve_runtime_path(self.config.get("outputs", {}).get("replay_dir", "runtime/replay"))
        self.logs_dir = resolve_runtime_path(self.config.get("outputs", {}).get("logs_dir", "runtime/logs"))
        self.current_detections_path = self.sessions_dir / "current_detections.json"
        self.current_preview_path = self.sessions_dir / "current_detections.jpg"
        self.allowed_classes = set(ALLOWED_CLASSES)
        self.backend = str(self.config.get("model", {}).get("type", "onnx")).lower()
        self.model_path = self._resolve_model_path()
        self.fallback_model_path = resolve_runtime_path(str(self.config.get("model", {}).get("fallback_path", "runtime/models/easy_v1_best_rgb.pt")))
        self.input_size = int(self.config.get("inference", {}).get("input_size", 640))
        self.confidence_threshold = float(self.config.get("inference", {}).get("confidence_threshold", 0.25))
        self.iou_threshold = float(self.config.get("inference", {}).get("iou_threshold", 0.45))
        self.class_names = {int(item["id"]): str(item["name"]) for item in self.config.get("classes", [])}
        self._session: Any | None = None
        self._session_error = ""
        self._session_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._running = False
        self._mode = "replay"
        self._interval_seconds = 1.5
        self._last_image: str | None = None
        self._last_detections: List[Dict[str, Any]] = []
        self._last_frame: Dict[str, Any] | None = None
        self._last_inference_ms: float | None = None
        self._last_fps: float | None = None
        self._last_error = ""
        self._last_run_ts: str | None = None
        self._last_event_ts: float = 0.0
        self.frame_provider = UnifiedFrameProvider()
        self._available_images = len(list_images(self.replay_dir))
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self.replay_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self._load_previous_state()
        self._write_current_state()

    def _resolve_model_path(self) -> Path:
        model_info = self.config.get("model", {})
        return resolve_runtime_path(str(model_info.get("preferred_path", "runtime/models/easy_v1_best_rgb.onnx")))

    def _ensure_session(self) -> Tuple[bool, str]:
        if self._session is not None:
            return True, ""
        with self._session_lock:
            if self._session is not None:
                return True, ""
            try:
                import onnxruntime as ort  # type: ignore
            except ImportError as exc:
                self._session_error = "onnxruntime is not installed"
                return False, self._session_error

            if not self.model_path.exists():
                self._session_error = f"Model not found: {self.model_path}"
                return False, self._session_error

            try:
                self._session = ort.InferenceSession(str(self.model_path), providers=["CPUExecutionProvider"])
                self._session_error = ""
                return True, ""
            except Exception as exc:  # pragma: no cover - runtime specific
                self._session = None
                self._session_error = f"Failed to load ONNX model: {exc}"
                return False, self._session_error

    def _emit_event(self, event_type: str, description: str, severity: str = "info", meta: Optional[Dict[str, Any]] = None) -> None:
        if not self.events:
            return
        try:
            self.events.add("EASY_INFERENCE", event_type, description, severity, meta=meta)
        except Exception:  # pragma: no cover - defensive
            pass

    def _snapshot_payload(self) -> Dict[str, Any]:
        if self._mode in {"replay", "demo", "loop", "single", "once"}:
            source = "replay"
            source_label = "Replay / Demo"
        elif self._mode == "manual":
            source = "manual"
            source_label = "Manual image"
        else:
            source = self._mode
            source_label = self._mode.replace("_", " ").title() if self._mode else "Unknown"
        return {
            "running": self._running,
            "mode": self._mode,
            "source": source,
            "source_label": source_label,
            "backend": self.backend,
            "model_path": str(self.model_path),
            "config_path": str(self.config_path or self.config.get("_loaded_from", "")),
            "runtime_root": str(self.runtime_root),
            "replay_dir": str(self.replay_dir),
            "sessions_dir": str(self.sessions_dir),
            "logs_dir": str(self.logs_dir),
            "available_images": self._available_images,
            "interval_seconds": self._interval_seconds,
            "last_image": self._last_image,
            "last_frame": dict(self._last_frame) if self._last_frame else None,
            "last_inference_ms": self._last_inference_ms,
            "fps": self._last_fps,
            "last_run_ts": self._last_run_ts,
            "last_detections": list(self._last_detections),
            "count": len(self._last_detections),
            "error": self._last_error or self._session_error,
            "config_error": self._config_error,
            "session_loaded": self._session is not None,
            "fallback_model_path": str(self.fallback_model_path),
            "frame_provider": self.frame_provider.status(),
        }

    def _load_previous_state(self) -> None:
        if self.detection_manager is not None:
            return
        if not self.current_detections_path.exists():
            return
        try:
            payload = _load_json(self.current_detections_path)
        except Exception:
            return

        detections = payload.get("last_detections")
        if not isinstance(detections, list):
            detections = payload.get("detections")
        if isinstance(detections, list):
            self._last_detections = list(detections)

        last_image = payload.get("last_image") or payload.get("image_path")
        if last_image:
            self._last_image = str(last_image)
        if isinstance(payload.get("last_frame"), dict):
            self._last_frame = dict(payload.get("last_frame"))

        last_inference_ms = payload.get("last_inference_ms", payload.get("inference_time_ms"))
        try:
            self._last_inference_ms = None if last_inference_ms is None else float(last_inference_ms)
        except Exception:
            self._last_inference_ms = None

        self._last_fps = payload.get("fps")
        self._last_run_ts = payload.get("last_run_ts") or payload.get("updated_at")
        self._last_error = str(payload.get("error") or "")
        self._mode = str(payload.get("mode") or self._mode)
        try:
            self._interval_seconds = float(payload.get("interval_seconds") or self._interval_seconds)
        except Exception:
            pass

    def _write_current_state(self) -> None:
        if self.detection_manager is not None:
            return
        payload = self._snapshot_payload()
        payload["ok"] = True
        payload["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        _atomic_write_json(self.current_detections_path, payload)

    def status(self) -> Dict[str, Any]:
        with self._state_lock:
            payload = self._snapshot_payload()
            payload["ok"] = True
            payload["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            payload["current_detections_path"] = str(self.current_detections_path)
            payload["current_preview_path"] = str(self.current_preview_path)
            return payload

    def get_current_detections(self) -> Dict[str, Any]:
        if self.detection_manager is not None:
            return self.detection_manager.get_current_detections()
        if self.current_detections_path.exists():
            try:
                return _load_json(self.current_detections_path)
            except Exception:
                pass
        return self.status()

    def _source_payload(self) -> Tuple[str, str]:
        if self._mode in {"replay", "demo", "loop", "single", "once"}:
            return "replay", "Replay / Demo"
        if self._mode == "manual":
            return "manual", "Manual image"
        label = self._mode.replace("_", " ").title() if self._mode else "Unknown"
        return self._mode, label

    def _frame_source_payload(self, frame: FrameObject | None = None) -> Tuple[str, str]:
        if frame is not None:
            return frame.source_type, frame.source_name
        return self._source_payload()

    def _provider_mode(self) -> str:
        status = self.frame_provider.status()
        source_type = str(status.get("source_type") or "UNKNOWN").strip().lower()
        return source_type or "replay"

    def _normalize_image_path(self, image_path: str | Path) -> Path:
        path = Path(image_path)
        if not path.is_absolute():
            candidate = (PROJECT_ROOT / path).resolve()
            if candidate.exists():
                return candidate
            candidate = (self.replay_dir / path).resolve()
            if candidate.exists():
                return candidate
        return path

    def _temporary_frame_path(self, frame: FrameObject) -> Path:
        if frame.image_path:
            return Path(frame.image_path)
        temp_dir = self.sessions_dir / "frame_provider_cache"
        temp_dir.mkdir(parents=True, exist_ok=True)
        suffix = ".jpg"
        return temp_dir / f"{frame.frame_id}{suffix}"

    def _image_path_for_frame(self, frame: FrameObject) -> Path:
        if frame.image_path:
            return Path(frame.image_path)
        path = self._temporary_frame_path(frame)
        if frame.image is not None and not path.exists():
            Image.fromarray(frame.image.astype(np.uint8)).save(path, quality=92)
        return path

    def _execute_inference(self, image_path: Path, *, save_artifacts: bool = True, frame: FrameObject | None = None) -> Dict[str, Any]:
        ok, error = self._ensure_session()
        if not ok or self._session is None:
            return {
                "ok": False,
                "error": error or self._session_error or "ONNX session unavailable",
                "image_path": str(image_path),
                "detections": [],
            }
        if not image_path.exists():
            if frame is None or frame.image is None:
                return {
                    "ok": False,
                    "error": f"Input image not found: {image_path}",
                    "image_path": str(image_path),
                    "detections": [],
                }

        start = time.perf_counter()
        if frame is not None and frame.image is not None:
            tensor, original_rgb, ratio, pad = preprocess_array(frame.image, self.input_size)
        else:
            tensor, original_rgb, ratio, pad = preprocess_image(image_path, self.input_size)
        input_name = self._session.get_inputs()[0].name
        outputs = self._session.run(None, {input_name: tensor})
        detections = decode_yolo_output(
            outputs=outputs,
            conf_threshold=self.confidence_threshold,
            iou_threshold=self.iou_threshold,
            class_names=self.class_names,
            allowed_class_names=self.allowed_classes,
            ratio=ratio,
            pad=pad,
            image_shape=original_rgb.shape[:2],
            input_size=self.input_size,
        )
        elapsed_ms = round((time.perf_counter() - start) * 1000.0, 2)
        fps = round(1000.0 / elapsed_ms, 2) if elapsed_ms > 0 else None
        detections_payload = [
            {
                "id": f"det-{uuid.uuid4().hex[:12]}",
                "class_id": detection.class_id,
                "class_name": detection.class_name,
                "confidence": round(detection.confidence, 6),
                "box_xyxy": [round(value, 2) for value in detection.box_xyxy],
                "frame_id": frame.frame_id if frame else None,
                "source_type": frame.source_type if frame else None,
                "source_name": frame.source_name if frame else None,
                "session_id": frame.session_id if frame else None,
            }
            for detection in detections
        ]
        source, source_label = self._frame_source_payload(frame)
        payload = {
            "ok": True,
            "backend": self.backend,
            "model_path": str(self.model_path),
            "image_path": str(image_path),
            "source": source,
            "source_label": source_label,
            "count": len(detections_payload),
            "detections": detections_payload,
            "inference_time_ms": elapsed_ms,
            "fps": fps,
            "allowed_classes": sorted(self.allowed_classes),
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "output_preview_path": str(self.current_preview_path),
            "output_json_path": str(self.current_detections_path),
            "frame": frame.to_dict() if frame else None,
            "frame_id": frame.frame_id if frame else None,
            "session_id": frame.session_id if frame else None,
        }

        if save_artifacts:
            if frame is not None and frame.image is not None:
                draw_detections_on_array(frame.image, detections, self.current_preview_path)
            else:
                draw_detections(image_path, detections, self.current_preview_path)
            if self.detection_manager is not None:
                self.detection_manager.record_inference_result(payload, mode=self._mode)
            else:
                _atomic_write_json(self.current_detections_path, payload)

        if detections and self.detection_manager is None:
            summary = ", ".join(f"{item['class_name']}:{item['confidence']:.2f}" for item in detections_payload[:5])
            self._emit_event(
                "DETECTED",
                f"AI detections on {image_path.name}: {summary}",
                "info",
                meta={
                    "image_path": str(image_path),
                    "count": len(detections_payload),
                    "detections": detections_payload,
                    "inference_time_ms": elapsed_ms,
                },
            )

        return payload

    def run_on_image(self, image_path: str | Path | None = None) -> Dict[str, Any]:
        if image_path is None:
            try:
                image_path = find_first_image(self.replay_dir)
            except Exception as exc:
                result = {"ok": False, "error": str(exc), "detections": []}
                self._last_error = str(exc)
                self._write_current_state()
                return result
        normalized = self._normalize_image_path(image_path)
        result = self._execute_inference(normalized, save_artifacts=True)
        with self._state_lock:
            if result.get("ok"):
                self._last_image = str(normalized)
                self._last_frame = dict(result.get("frame") or {}) if result.get("frame") else None
                self._last_detections = list(result.get("detections", []))
                self._last_inference_ms = float(result.get("inference_time_ms") or 0.0)
                self._last_fps = result.get("fps")
                self._last_run_ts = str(result.get("updated_at"))
                self._last_error = ""
            else:
                self._last_error = str(result.get("error", "Unknown error"))
            self._available_images = len(list_images(self.replay_dir))
            self._write_current_state()
        if not result.get("ok"):
            self._emit_event(
                "INFERENCE_ERROR",
                f"AI inference failed for {normalized.name}: {result.get('error')}",
                "error",
                meta={"image_path": str(normalized), "error": result.get("error")},
            )
        return result

    def run_on_frame(self, frame: FrameObject) -> Dict[str, Any]:
        image_path = self._image_path_for_frame(frame)
        result = self._execute_inference(image_path, save_artifacts=True, frame=frame)
        with self._state_lock:
            if result.get("ok"):
                self._last_frame = frame.to_dict()
                self._last_image = str(image_path)
                self._last_detections = list(result.get("detections", []))
                self._last_inference_ms = float(result.get("inference_time_ms") or 0.0)
                self._last_fps = result.get("fps")
                self._last_run_ts = str(result.get("updated_at"))
                self._last_error = ""
            else:
                self._last_error = str(result.get("error", "Unknown error"))
            self._write_current_state()
        if not result.get("ok"):
            self._emit_event(
                "INFERENCE_ERROR",
                f"AI inference failed for frame {frame.frame_id}: {result.get('error')}",
                "error",
                meta={"frame": frame.to_dict(), "error": result.get("error")},
            )
        return result

    def next_frame(self) -> Dict[str, Any]:
        frame = self._next_frame_object()
        return {"ok": True, "frame": frame.to_dict(), "provider": self.frame_provider.status()}

    def _next_frame_object(self) -> FrameObject:
        session_id = None
        if self.detection_manager is not None and getattr(self.detection_manager, "session_manager", None) is not None:
            try:
                session = self.detection_manager.session_manager.ensure_session(mode=self._provider_mode(), operator="auto")
                session_id = str(session.get("session_id") or "")
            except Exception:
                session_id = None
        return self.frame_provider.next_frame(session_id=session_id)

    def configure_frame_provider(
        self,
        *,
        source_type: str | None,
        source_path: str | Path | None = None,
        source_name: str | None = None,
        loop: bool | None = None,
        save_temp_frames: bool | None = None,
    ) -> Dict[str, Any]:
        return self.frame_provider.configure(
            source_type=source_type,
            source_path=source_path,
            source_name=source_name,
            loop=loop,
            save_temp_frames=save_temp_frames,
        )

    def reset_frame_provider(self) -> Dict[str, Any]:
        return self.frame_provider.reset()

    def frame_provider_status(self) -> Dict[str, Any]:
        return self.frame_provider.status()

    def run_on_next_frame(self) -> Dict[str, Any]:
        frame = self._next_frame_object()
        return self.run_on_frame(frame)

    def _demo_loop(self) -> None:
        while not self._stop_event.is_set():
            provider_status = self.frame_provider.status()
            self._available_images = int(provider_status.get("total_frames") or 0)
            try:
                result = self.run_on_next_frame()
            except Exception as exc:
                with self._state_lock:
                    self._last_error = str(exc)
                    self._running = False
                    self._write_current_state()
                self._emit_event(
                    "INFERENCE_ERROR",
                    str(exc),
                    "warning",
                    meta={"provider": provider_status},
                )
                return
            with self._state_lock:
                provider_status = self.frame_provider.status()
                self._available_images = int(provider_status.get("total_frames") or self._available_images)
                if result.get("ok"):
                    self._last_frame = dict(result.get("frame") or {}) if result.get("frame") else self._last_frame
                    self._last_image = str(result.get("image_path") or self._last_image or "")
                    self._last_detections = list(result.get("detections", []))
                    self._last_inference_ms = float(result.get("inference_time_ms") or 0.0)
                    self._last_fps = result.get("fps")
                    self._last_run_ts = str(result.get("updated_at"))
                    self._last_error = ""
                else:
                    self._last_error = str(result.get("error", "Unknown error"))
                self._write_current_state()
            if self._stop_event.is_set():
                break
            if self._mode in {"single", "once"}:
                break
            time.sleep(max(0.2, self._interval_seconds))
            if self._mode in {"single", "once"}:
                break

        with self._state_lock:
            self._running = False
            self._write_current_state()

    def start(self, mode: str = "replay", interval_seconds: float | None = None) -> Dict[str, Any]:
        normalized_mode = str(mode or "replay").strip().lower()
        if normalized_mode not in {"replay", "demo", "loop", "single", "once"}:
            normalized_mode = "replay"
        if interval_seconds is None:
            interval_seconds = self._interval_seconds
        try:
            interval_seconds = max(0.2, float(interval_seconds))
        except Exception:
            interval_seconds = self._interval_seconds

        ok, error = self._ensure_session()
        if not ok:
            with self._state_lock:
                self._last_error = error
                self._running = False
                self._write_current_state()
                payload = self._snapshot_payload()
            payload.update({"ok": False, "error": error, "running": False})
            payload["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            return payload

        provider_status = self.frame_provider.status()
        total_frames = int(provider_status.get("total_frames") or 0)
        self._available_images = total_frames
        if provider_status.get("error"):
            error = str(provider_status.get("error"))
            with self._state_lock:
                self._last_error = error
                self._running = False
                self._write_current_state()
                payload = self._snapshot_payload()
            payload.update({"ok": False, "error": error, "running": False})
            payload["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            return payload
        if normalized_mode in {"replay", "demo", "loop", "single", "once"} and total_frames == 0 and provider_status.get("source_type") in {"REPLAY_FOLDER", "DATASET"}:
            error = f"No replay images found in {provider_status.get('source_path') or self.replay_dir}"
            with self._state_lock:
                self._last_error = error
                self._running = False
                self._write_current_state()
                payload = self._snapshot_payload()
            payload.update({"ok": False, "error": error, "running": False})
            payload["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            return payload

        with self._state_lock:
            if self._running and self._thread and self._thread.is_alive():
                self._mode = normalized_mode
                self._interval_seconds = interval_seconds
                return {"ok": True, "message": "Inference worker already running", **self.status()}
            self._mode = normalized_mode
            self._interval_seconds = interval_seconds
            self._stop_event.clear()
            self._running = True
            self._last_error = ""
            self._available_images = total_frames
            self._write_current_state()

        self._emit_event(
            "INFERENCE_START",
            f"Replay inference started in {normalized_mode} mode",
            "info",
            meta={"mode": normalized_mode, "interval_seconds": interval_seconds},
        )
        self._thread = threading.Thread(target=self._demo_loop, daemon=True, name="easy-inference-worker")
        self._thread.start()
        return {"ok": True, "message": "Inference worker started", **self.status()}

    def stop(self) -> Dict[str, Any]:
        self._stop_event.set()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=2.0)
        with self._state_lock:
            self._running = False
            self._write_current_state()
        self._emit_event(
            "INFERENCE_STOP",
            "Replay inference worker stopped",
            "info",
        )
        return {"ok": True, "message": "Inference worker stopped", **self.status()}

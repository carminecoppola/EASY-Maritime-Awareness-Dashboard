#!/usr/bin/env python3
"""Standalone ONNX inference smoke test for EASY-v1."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_CANDIDATES = [
    ROOT / "runtime" / "config" / "inference_config.json",
    ROOT / "runtime" / "config" / "inference_config.yaml",
]
ALLOWED_CLASSES = {"boat", "ship", "buoy"}
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


@dataclass(frozen=True)
class Detection:
    class_id: int
    class_name: str
    confidence: float
    box_xyxy: Tuple[float, float, float, float]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a standalone ONNX inference smoke test.")
    parser.add_argument(
        "image",
        nargs="?",
        type=Path,
        default=None,
        help="Optional positional input image. If omitted, the first image in runtime/replay/ is used.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Optional config path. Defaults to runtime/config/inference_config.json or .yaml.",
    )
    parser.add_argument(
        "--image",
        dest="image_flag",
        type=Path,
        default=None,
        help="Optional input image. If omitted, the positional image or the first image in runtime/replay/ is used.",
    )
    return parser.parse_args()


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_yaml_with_pyyaml(path: Path) -> dict:
    try:
        import yaml  # type: ignore
    except ImportError as exc:  # pragma: no cover - runtime-specific
        raise RuntimeError(
            f"PyYAML is not installed, cannot parse {path.name}. "
            "Either install PyYAML or use inference_config.json."
        ) from exc

    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def load_config(path: Path | None) -> dict:
    candidates = [path] if path else list(DEFAULT_CONFIG_CANDIDATES)
    for candidate in candidates:
        if not candidate:
            continue
        if not candidate.exists():
            continue
        if candidate.suffix.lower() == ".json":
            return load_json(candidate)
        if candidate.suffix.lower() in {".yaml", ".yml"}:
            try:
                return load_yaml_with_pyyaml(candidate)
            except RuntimeError:
                json_peer = candidate.with_suffix(".json")
                if json_peer.exists():
                    return load_json(json_peer)
                raise
    raise FileNotFoundError(
        "No inference config found. Expected runtime/config/inference_config.json or .yaml."
    )


def resolve_runtime_path(relative_path: str) -> Path:
    candidate = (ROOT / relative_path).resolve()
    if candidate.exists():
        return candidate
    return candidate


def find_input_image(explicit_image: Path | None, replay_dir: Path) -> Path:
    if explicit_image is not None:
        if not explicit_image.exists():
            raise FileNotFoundError(f"Input image not found: {explicit_image}")
        return explicit_image

    if not replay_dir.exists():
        raise FileNotFoundError(f"Replay directory not found: {replay_dir}")

    for path in sorted(replay_dir.rglob("*")):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            return path

    raise FileNotFoundError(f"No image found in {replay_dir}")


def letterbox(
    image: np.ndarray,
    new_shape: int | Tuple[int, int],
    color: Tuple[int, int, int] = (114, 114, 114),
) -> Tuple[np.ndarray, float, Tuple[float, float]]:
    shape = image.shape[:2]  # h, w
    if isinstance(new_shape, int):
        new_shape = (new_shape, new_shape)

    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
    new_unpad = (int(round(shape[1] * r)), int(round(shape[0] * r)))
    dw = new_shape[1] - new_unpad[0]
    dh = new_shape[0] - new_unpad[1]
    dw /= 2
    dh /= 2

    if shape[::-1] != new_unpad:
        resized = Image.fromarray(image).resize(new_unpad, Image.BILINEAR)
        image = np.asarray(resized)

    top = int(round(dh - 0.1))
    bottom = int(round(dh + 0.1))
    left = int(round(dw - 0.1))
    right = int(round(dw + 0.1))
    padded = np.full((new_shape[0], new_shape[1], 3), color, dtype=np.uint8)
    padded[top : top + image.shape[0], left : left + image.shape[1]] = image
    return padded, r, (dw, dh)


def preprocess_image(image_path: Path, input_size: int) -> Tuple[np.ndarray, np.ndarray, float, Tuple[float, float]]:
    image = Image.open(image_path).convert("RGB")
    rgb = np.asarray(image)
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

    allowed_class_ids = [class_id for class_id, name in class_names.items() if name in set(allowed_class_names)]
    detections: List[Detection] = []
    if not allowed_class_ids:
        return detections

    for class_id in allowed_class_ids:
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
        if not keep:
            continue
        selected_boxes = scale_boxes_to_image(candidate_boxes_xyxy[keep], ratio, pad, image_shape)
        selected_scores = candidate_scores[keep]
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


def load_onnxruntime():
    try:
        import onnxruntime as ort  # type: ignore
    except ImportError as exc:  # pragma: no cover - runtime-specific
        raise RuntimeError(
            "onnxruntime is not installed. Install it on the Raspberry to run this test."
        ) from exc
    return ort


def draw_detections(image_path: Path, detections: Sequence[Detection], output_path: Path) -> None:
    image = Image.open(image_path).convert("RGB")
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


def detections_to_json(
    image_path: Path,
    config: dict,
    detections: Sequence[Detection],
    output_image: Path,
) -> dict:
    return {
        "input_image": str(image_path),
        "model_path": str(resolve_runtime_path(config["model"]["preferred_path"])),
        "model_type": config["model"]["type"],
        "confidence_threshold": config["inference"]["confidence_threshold"],
        "iou_threshold": config["inference"]["iou_threshold"],
        "input_size": config["inference"]["input_size"],
        "allowed_classes": sorted(ALLOWED_CLASSES),
        "output_image": str(output_image),
        "detections": [
            {
                "class_id": detection.class_id,
                "class_name": detection.class_name,
                "confidence": detection.confidence,
                "box_xyxy": list(detection.box_xyxy),
            }
            for detection in detections
        ],
    }


def main() -> int:
    args = parse_args()
    config = load_config(args.config)

    replay_dir = resolve_runtime_path(config["outputs"]["replay_dir"])
    sessions_dir = resolve_runtime_path(config["outputs"]["sessions_dir"])
    sessions_dir.mkdir(parents=True, exist_ok=True)
    output_image = sessions_dir / "test_onnx_output.jpg"
    output_json = sessions_dir / "test_onnx_detections.json"

    image_path = find_input_image(args.image_flag or args.image, replay_dir)
    model_path = resolve_runtime_path(config["model"]["preferred_path"])
    if not model_path.exists():
        fallback = resolve_runtime_path(config["model"]["fallback_path"])
        if fallback.exists():
            model_path = fallback
        else:
            raise FileNotFoundError(f"Model not found: {model_path} or {fallback}")

    ort = load_onnxruntime()
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    input_size = int(config["inference"]["input_size"])
    conf_threshold = float(config["inference"]["confidence_threshold"])
    iou_threshold = float(config["inference"]["iou_threshold"])
    class_names = {int(item["id"]): item["name"] for item in config["classes"]}

    tensor, original_rgb, ratio, pad = preprocess_image(image_path, input_size)
    outputs = session.run(None, {input_name: tensor})
    detections = decode_yolo_output(
        outputs=outputs,
        conf_threshold=conf_threshold,
        iou_threshold=iou_threshold,
        class_names=class_names,
        allowed_class_names=ALLOWED_CLASSES,
        ratio=ratio,
        pad=pad,
        image_shape=original_rgb.shape[:2],
        input_size=input_size,
    )

    print(f"Input image: {image_path}")
    print(f"Model: {model_path}")
    print(f"Detections: {len(detections)}")
    for index, detection in enumerate(detections, start=1):
        x1, y1, x2, y2 = detection.box_xyxy
        print(
            f"{index:02d}. {detection.class_name} "
            f"conf={detection.confidence:.3f} "
            f"box=({x1:.1f}, {y1:.1f}, {x2:.1f}, {y2:.1f})"
        )

    draw_detections(image_path, detections, output_image)
    output_payload = detections_to_json(image_path, config, detections, output_image)
    with output_json.open("w", encoding="utf-8") as handle:
        json.dump(output_payload, handle, indent=2)
        handle.write("\n")

    print(f"Annotated image saved to: {output_image}")
    print(f"Detections JSON saved to: {output_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

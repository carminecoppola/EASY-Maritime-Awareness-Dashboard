# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Image pre- and post-processing for the YOLO ONNX detector.

Pipeline:
    1. ``preprocess_*`` letterboxes the RGB image to a square ``input_size``
       (keeping the aspect ratio) and builds a normalised NCHW float tensor.
    2. The ONNX backend runs the network (see ``inference_backend.py``).
    3. ``decode_yolo_output`` filters by confidence, applies per-class
       non-maximum suppression and maps boxes back to original pixels.
    4. ``draw_detections*`` renders the annotated preview image.

Only NumPy and Pillow are used so the module runs on the Raspberry without
OpenCV or Ultralytics.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont


@dataclass(frozen=True)
class Detection:
    """One detected object. ``box_xyxy`` is (x1, y1, x2, y2) in original-image pixels."""
    class_id: int
    class_name: str
    confidence: float
    box_xyxy: Tuple[float, float, float, float]


def letterbox(
    image: np.ndarray,
    new_shape: int | Tuple[int, int],
    color: Tuple[int, int, int] = (114, 114, 114),
) -> Tuple[np.ndarray, float, Tuple[float, float]]:
    """Resize ``image`` to fit ``new_shape`` keeping the aspect ratio, padding with ``color``.

    Returns the padded image, the scale ratio, and the (dw, dh) padding added on
    each side; the last two are needed to map boxes back to the original image.
    """
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
    """Load an image file and convert it into a model input tensor (see ``preprocess_array``)."""
    image = Image.open(image_path).convert("RGB")
    rgb = np.asarray(image)
    return preprocess_array(rgb, input_size)


def preprocess_array(rgb: np.ndarray, input_size: int) -> Tuple[np.ndarray, np.ndarray, float, Tuple[float, float]]:
    """Letterbox an RGB array and return ``(tensor, original_rgb, ratio, pad)``.

    The tensor has shape (1, 3, input_size, input_size), dtype float32, values in [0, 1].
    """
    letterboxed, ratio, pad = letterbox(rgb, input_size)
    tensor = letterboxed.astype(np.float32) / 255.0
    tensor = np.transpose(tensor, (2, 0, 1))[None, ...]
    return tensor, rgb, ratio, pad


def sigmoid(x: np.ndarray) -> np.ndarray:
    """Element-wise logistic function."""
    return 1.0 / (1.0 + np.exp(-x))


def box_iou(box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    """Intersection-over-union between one box and an array of boxes, all in xyxy format."""
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
    """Greedy non-maximum suppression; return the indices of the boxes to keep, best score first."""
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
    """Undo letterboxing: remove padding, divide by the scale ratio and clip to the image bounds."""
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
    """Turn the raw network output into a sorted list of ``Detection`` objects.

    Supports both YOLOv8-style layouts, (84, N) and (N, 84): the box is
    (cx, cy, w, h) followed by one score per class. NMS runs independently for
    each class in ``allowed_class_names``.
    """
    raw = np.asarray(outputs[0])
    raw = np.squeeze(raw)
    if raw.ndim != 2:
        raise RuntimeError(f"Unexpected ONNX output shape: {raw.shape}")
    # # Exported YOLOv8 models emit (4 + classes, anchors); transpose to (anchors, 4 + classes).
    if raw.shape[0] < raw.shape[1] and raw.shape[0] <= 128:
        raw = raw.T
    if raw.shape[1] < 5:
        raise RuntimeError(f"Unexpected ONNX output format: {raw.shape}")

    boxes = raw[:, :4].astype(np.float32)
    class_scores = raw[:, 4:].astype(np.float32)
    # # Scores outside [0, 1] are raw logits: apply the sigmoid. Exports that already
    # # include it are left untouched.
    if class_scores.size and (class_scores.min() < -0.1 or class_scores.max() > 1.1):
        class_scores = sigmoid(class_scores)

    # # Some exports emit normalised coordinates; scale them to input-size pixels.
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
        # # Convert (center x, center y, width, height) to corner coordinates.
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
    """Draw detections on the image stored at ``image_path`` and save the preview to ``output_path``."""
    image = Image.open(image_path).convert("RGB")
    draw_detections_on_image(image, detections, output_path)


def draw_detections_on_array(image_rgb: np.ndarray, detections: Sequence[Detection], output_path: Path) -> None:
    """Draw detections on an RGB array and save the preview to ``output_path``."""
    image = Image.fromarray(image_rgb.astype(np.uint8)).convert("RGB")
    draw_detections_on_image(image, detections, output_path)


def draw_detections_on_image(image: Image.Image, detections: Sequence[Detection], output_path: Path) -> None:
    """Draw boxes and ``class confidence`` labels on a PIL image and save it as JPEG."""
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

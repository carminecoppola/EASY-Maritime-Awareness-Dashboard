from __future__ import annotations

"""Convert internal detections into the stable public API representation."""

import uuid
from typing import Any, Iterable


def format_detections(
    detections: Iterable[Any],
    *,
    frame: Any | None = None,
) -> list[dict[str, Any]]:
    return [
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

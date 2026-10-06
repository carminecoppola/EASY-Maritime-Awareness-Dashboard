# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Convert internal detections into the stable public API representation.

The JSON produced here is what the dashboard stores in session manifests and
returns from ``/api/inference/*``; changing a key is an API change.
"""

from __future__ import annotations

import uuid
from typing import Any, Iterable


def format_detections(
    detections: Iterable[Any],
    *,
    frame: Any | None = None,
) -> list[dict[str, Any]]:
    """Serialise detections into JSON-ready dictionaries.

    Each item gets a random ``det-<12 hex>`` id, a rounded confidence and box,
    and the provenance of ``frame`` (frame id, source type/name, session id)
    when a frame is supplied.
    """
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

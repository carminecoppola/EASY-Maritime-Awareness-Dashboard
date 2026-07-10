from __future__ import annotations

"""Dataset acquisition coordinator.

This manager is intentionally thin for now: it centralizes the moment where a
runtime action becomes dataset material and delegates persistence to
SessionManager. That gives the project one obvious place to grow toward RGB /
thermal pairing, capture cadence, and fine-tuning manifests.
"""

from pathlib import Path
from typing import Any, Dict, List

from runtime_support import utc_now_iso


class AcquisitionManager:
    """Records acquisition artifacts into the active session manifest."""

    def __init__(self, *, session_manager: Any, events: Any | None = None, logger: Any | None = None) -> None:
        self.session_manager = session_manager
        self.events = events
        self.logger = logger

    def status(self) -> Dict[str, Any]:
        session_status = self.session_manager.status()
        current = session_status.get("current")
        manifest = self.session_manager.read_manifest(str(current.get("session_id"))) if current else None
        return {
            "ok": True,
            "running": bool(session_status.get("running")),
            "session_id": current.get("session_id") if current else None,
            "manifest_path": manifest.get("path") if manifest else None,
            "manifest_counts": manifest.get("counts") if manifest else {},
            "updated_at": utc_now_iso(),
        }

    def record_snapshot(self, *, feed: str, snapshot: Dict[str, Any], meta: Dict[str, Any] | None = None) -> Dict[str, Any]:
        """Index a saved snapshot when an operator session is active."""
        current = self.session_manager.get_current_session()
        if not current:
            return {
                "ok": True,
                "recorded": False,
                "reason": "No running session",
                "snapshot": snapshot,
                "updated_at": utc_now_iso(),
            }
        session_id = str(current.get("session_id") or "")
        entry = {
            "kind": "snapshot",
            "artifact_type": "image",
            "feed": feed,
            "source": snapshot.get("source") or (meta or {}).get("source"),
            "path": snapshot.get("path"),
            "url": snapshot.get("url"),
            "filename": snapshot.get("filename"),
            "created": snapshot.get("created"),
            "size_bytes": snapshot.get("size_bytes"),
            "meta": meta or snapshot.get("meta") or {},
        }
        return self.session_manager.append_manifest_item(session_id, entry)

    def record_inference_result(self, result: Dict[str, Any], detections: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Persist detections and add an inference entry to the session manifest."""
        mode = str(result.get("source") or result.get("mode") or "replay")
        session = self.session_manager.ensure_session(mode=mode, operator="auto")
        session_id = str(session.get("session_id") or "")
        enriched_result = dict(result)
        enriched_result["session_id"] = enriched_result.get("session_id") or session_id
        self.session_manager.record_inference_result(enriched_result, detections)

        frame = enriched_result.get("frame") if isinstance(enriched_result.get("frame"), dict) else {}
        entry = {
            "kind": "inference",
            "artifact_type": "analysis",
            "source": enriched_result.get("source"),
            "source_label": enriched_result.get("source_label"),
            "image_path": enriched_result.get("image_path"),
            "image_name": Path(str(enriched_result.get("image_path") or "")).name,
            "frame_id": enriched_result.get("frame_id") or frame.get("frame_id"),
            "frame_index": frame.get("frame_index"),
            "camera_id": frame.get("camera_id"),
            "count": len(detections),
            "detections": detections,
            "inference_time_ms": enriched_result.get("inference_time_ms"),
            "fps": enriched_result.get("fps"),
            "preview_path": enriched_result.get("output_preview_path"),
            "detections_path": enriched_result.get("output_json_path"),
            "model_path": enriched_result.get("model_path"),
            "backend": enriched_result.get("backend"),
        }
        return self.session_manager.append_manifest_item(session_id, entry)

# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Acquisition coordinator: the point where runtime captures become dataset material.

When a mission is running, every snapshot and every inference result is recorded
in the session manifest (``manifest.json``) through this class. RGB and thermal
captures taken within ``PAIR_WINDOW_SECONDS`` of each other are linked into the
same *sample*, which is the unit later validated and exported for fine-tuning
(see ``dataset_exporter.py``).

The manager is intentionally thin: it decides *what* to record and delegates
persistence to ``SessionManager``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from runtime_support import parse_utc_ts, utc_now_iso


PAIR_WINDOW_SECONDS = 2.5
FEED_DATASET_ROLES = {
    "rgb_left": {"modality": "rgb", "dataset_role": "rgb_left"},
    "rgb_right": {"modality": "rgb", "dataset_role": "rgb_right"},
    "thermal": {"modality": "thermal", "dataset_role": "thermal"},
}


class AcquisitionManager:
    """Records acquisition artifacts into the active session manifest."""

    def __init__(self, *, session_manager: Any, events: Any | None = None, logger: Any | None = None) -> None:
        """Keep references to the session manager and the optional event log and logger."""
        self.session_manager = session_manager
        self.events = events
        self.logger = logger

    def status(self) -> Dict[str, Any]:
        """Summarise the acquisition of the running (or latest) session: manifest counts and dataset summary."""
        session_status = self.session_manager.status()
        current = session_status.get("current")
        latest = session_status.get("latest")
        selected_session = current or latest
        manifest = self.session_manager.read_manifest(str(selected_session.get("session_id"))) if selected_session else None
        counts = manifest.get("counts") if manifest else {}
        return {
            "ok": True,
            "running": bool(session_status.get("running")),
            "session_id": selected_session.get("session_id") if selected_session else None,
            "manifest_path": manifest.get("path") if manifest else None,
            "manifest_counts": counts,
            "dataset_summary": {
                "samples": counts.get("samples", 0) if isinstance(counts, dict) else 0,
                "paired_items": counts.get("paired_items", 0) if isinstance(counts, dict) else 0,
                "paired_capture_sets": counts.get("paired_capture_sets", 0) if isinstance(counts, dict) else 0,
                "within_tolerance_samples": counts.get("within_tolerance_samples", 0) if isinstance(counts, dict) else 0,
                "synchronized_samples": counts.get("synchronized_samples", 0) if isinstance(counts, dict) else 0,
                "by_feed": counts.get("by_feed", {}) if isinstance(counts, dict) else {},
                "pair_window_seconds": PAIR_WINDOW_SECONDS,
            },
            "updated_at": utc_now_iso(),
        }

    def record_snapshot(self, *, feed: str, snapshot: Dict[str, Any], meta: Dict[str, Any] | None = None) -> Dict[str, Any]:
        """Index a saved snapshot in the running session's manifest.

        A capture taken by the paired RGB+thermal action carries a ``capture_set_id``
        and is grouped by it. Otherwise it is paired by timestamp with the closest
        snapshot of the other modality inside the pairing window. Returns
        ``recorded: False`` when no mission is running.
        """
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
        feed_info = FEED_DATASET_ROLES.get(feed, {"modality": "unknown", "dataset_role": feed})
        created_ts = self._snapshot_created_ts(snapshot)
        capture_set_id = str((meta or {}).get("capture_set_id") or "") or None
        pairing = {} if capture_set_id else self._snapshot_pairing(session_id=session_id, feed=feed, created_ts=created_ts)
        sample_id = (
            f"{session_id}:capture:{capture_set_id}"
            if capture_set_id
            else pairing.get("sample_id") or self._new_sample_id(session_id, feed, created_ts)
        )
        capture_meta = meta or snapshot.get("meta") or {}
        capture_status = str(capture_meta.get("status") or "").upper()
        usable = bool(capture_meta.get("capture_ok", capture_status not in {"NOT_DETECTED", "DISABLED", "ERROR"}))
        entry = {
            "kind": "snapshot",
            "artifact_type": "image",
            "sample_id": sample_id,
            "capture_set_id": capture_set_id,
            "feed": feed,
            "modality": feed_info["modality"],
            "dataset_role": feed_info["dataset_role"],
            "usable": usable,
            "source": snapshot.get("source") or (meta or {}).get("source"),
            "path": snapshot.get("path"),
            "url": snapshot.get("url"),
            "filename": snapshot.get("filename"),
            "created": snapshot.get("created"),
            "created_ts": created_ts,
            "size_bytes": snapshot.get("size_bytes"),
            "pair_window_seconds": PAIR_WINDOW_SECONDS,
            "paired_with": pairing.get("paired_with"),
            "pair_delta_seconds": pairing.get("pair_delta_seconds"),
            "synchronization": {
                "method": capture_meta.get("synchronization_method") or ("capture_set_unmeasured" if capture_set_id else "timestamp_window"),
                "window_seconds": PAIR_WINDOW_SECONDS,
                "pairing_status": capture_meta.get("pairing_status") or ("legacy_unmeasured" if capture_set_id else None),
                "observed_wall_skew_ms": capture_meta.get("observed_wall_skew_ms"),
                "hardware_synchronized": bool(capture_meta.get("hardware_synchronized", False)),
            },
            "meta": capture_meta,
        }
        return self.session_manager.append_manifest_item(session_id, entry)

    def record_inference_result(self, result: Dict[str, Any], detections: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Persist the detections of one inference and add an ``inference`` entry to the session manifest."""
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
            "sample_id": frame.get("sample_id") or enriched_result.get("sample_id"),
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

    def _snapshot_pairing(self, *, session_id: str, feed: str, created_ts: float | None) -> Dict[str, Any]:
        """Find the closest snapshot of the opposite modality within the pairing window.

        Returns the shared ``sample_id``, the matched item and the time delta, or an
        empty dictionary when nothing is close enough.
        """
        if created_ts is None:
            return {}
        manifest = self.session_manager.read_manifest(session_id)
        items = manifest.get("items", [])
        if not isinstance(items, list):
            return {}
        feed_modality = FEED_DATASET_ROLES.get(feed, {}).get("modality")
        best: Dict[str, Any] | None = None
        best_delta = PAIR_WINDOW_SECONDS + 0.001
        for item in reversed(items):
            if item.get("kind") != "snapshot":
                continue
            if item.get("feed") == feed:
                continue
            item_modality = item.get("modality") or FEED_DATASET_ROLES.get(str(item.get("feed") or ""), {}).get("modality")
            if feed_modality and item_modality == feed_modality:
                continue
            other_ts = self._item_created_ts(item)
            if other_ts is None:
                continue
            delta = abs(created_ts - other_ts)
            if delta <= PAIR_WINDOW_SECONDS and delta < best_delta:
                best = item
                best_delta = delta
        if not best:
            return {}
        sample_id = best.get("sample_id") or self._new_sample_id(session_id, str(best.get("feed") or "paired"), self._item_created_ts(best))
        return {
            "sample_id": sample_id,
            "paired_with": {
                "id": best.get("id"),
                "feed": best.get("feed"),
                "path": best.get("path"),
                "created": best.get("created"),
            },
            "pair_delta_seconds": round(best_delta, 3),
        }

    @staticmethod
    def _snapshot_created_ts(snapshot: Dict[str, Any]) -> float | None:
        """Creation time of a snapshot in epoch seconds (None if unknown)."""
        try:
            if snapshot.get("created_ts") is not None:
                return float(snapshot.get("created_ts"))
        except Exception:
            pass
        return parse_utc_ts(str(snapshot.get("created") or "")) or None

    @staticmethod
    def _item_created_ts(item: Dict[str, Any]) -> float | None:
        """Creation time of a manifest item in epoch seconds (None if unknown)."""
        try:
            if item.get("created_ts") is not None:
                return float(item.get("created_ts"))
        except Exception:
            pass
        return parse_utc_ts(str(item.get("created") or item.get("timestamp") or "")) or None

    @staticmethod
    def _new_sample_id(session_id: str, feed: str, created_ts: float | None) -> str:
        """Build a sample id from the session, the creation time in milliseconds and the feed."""
        stamp = int((created_ts or 0.0) * 1000)
        return f"{session_id}:{stamp}:{feed}"

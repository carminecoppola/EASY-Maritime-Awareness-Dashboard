from __future__ import annotations

import json
import os
import threading
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from runtime_support import atomic_write_json, read_json, utc_now_iso


PROJECT_ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = PROJECT_ROOT / "runtime"
SESSIONS_DIR = RUNTIME_ROOT / "sessions"


@dataclass
class DetectionRecord:
    id: str
    timestamp: str
    session_id: str
    source: str
    source_label: str
    image_name: str
    image_path: str
    class_id: Optional[int]
    class_name: str
    confidence: Optional[float]
    bbox: Dict[str, Optional[float]]
    status: str
    created_at: str
    updated_at: str
    track_id: Optional[str] = None
    thermal_confirmation: Optional[bool] = None
    depth: Optional[float] = None
    distance: Optional[float] = None
    velocity: Optional[float] = None
    frame_id: Optional[str] = None
    source_type: Optional[str] = None
    source_name: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["box_xyxy"] = [
            payload["bbox"].get("x1"),
            payload["bbox"].get("y1"),
            payload["bbox"].get("x2"),
            payload["bbox"].get("y2"),
        ]
        payload["label"] = payload["class_name"]
        payload["type"] = payload["class_name"]
        payload["origin"] = payload["source"]
        payload["ts"] = payload["timestamp"]
        return payload


class DetectionManager:
    """Tracks current detections plus the persisted cross-session history."""

    def __init__(
        self,
        sessions_dir: Path | str = SESSIONS_DIR,
        *,
        events: Any | None = None,
        session_id: str | None = None,
        session_manager: Any | None = None,
        acquisition_manager: Any | None = None,
        event_manager: Any | None = None,
    ) -> None:
        self.sessions_dir = Path(sessions_dir)
        self.current_path = self.sessions_dir / "current_detections.json"
        self.history_path = self.sessions_dir / "detection_history.json"
        self.history_journal_path = self.sessions_dir / "detection_history.jsonl"
        self._history_compaction_interval = max(
            30.0,
            float(os.environ.get("EASY_DETECTION_HISTORY_COMPACTION_SECONDS", "300")),
        )
        self._history_compaction_bytes = max(
            4096,
            int(os.environ.get("EASY_DETECTION_HISTORY_COMPACTION_BYTES", "262144")),
        )
        self._last_history_compaction = time.monotonic()
        self.events = events
        self.session_manager = session_manager
        self.acquisition_manager = acquisition_manager
        self.event_manager = event_manager
        self.session_id = session_id or time.strftime("session-%Y%m%d-%H%M%S", time.gmtime())
        self._lock = threading.Lock()
        self._detections: Dict[str, DetectionRecord] = {}
        self._current_ids: List[str] = []
        self._history_ids: List[str] = []
        self._last_detection_id: str | None = None
        self._last_image: str | None = None
        self._last_source = "unknown"
        self._last_source_label = "Unknown"
        self._last_inference_ms: float | None = None
        self._last_fps: float | None = None
        self._last_run_ts: str | None = None
        self._last_error = ""
        self._journal_record_ids: set[str] = set()
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self._load_history_snapshot()
        self._load_history_journal()
        self._load_current_snapshot()
        for record_id in self._journal_record_ids - set(self._current_ids):
            if record_id in self._detections:
                self._detections[record_id].status = "RESOLVED"
        self._persist(force_history=True)

    def _load_history_snapshot(self) -> None:
        if not self.history_path.exists():
            return
        try:
            payload = read_json(self.history_path)
        except Exception:
            return
        for item in payload.get("detections", []):
            try:
                bbox = item.get("bbox") or {}
                if isinstance(bbox, list):
                    bbox = self._bbox_dict(bbox)
                record = DetectionRecord(
                    id=str(item.get("id") or uuid.uuid4().hex),
                    timestamp=str(item.get("timestamp") or item.get("created_at") or utc_now_iso()),
                    session_id=str(item.get("session_id") or self.session_id),
                    source=str(item.get("source") or "unknown"),
                    source_label=str(item.get("source_label") or item.get("source") or "Unknown"),
                    image_name=str(item.get("image_name") or Path(str(item.get("image_path") or "")).name),
                    image_path=str(item.get("image_path") or ""),
                    class_id=item.get("class_id"),
                    class_name=str(item.get("class_name") or item.get("label") or "object"),
                    confidence=item.get("confidence"),
                    bbox=bbox,
                    status=str(item.get("status") or "ACTIVE"),
                    created_at=str(item.get("created_at") or utc_now_iso()),
                    updated_at=str(item.get("updated_at") or utc_now_iso()),
                    track_id=item.get("track_id"),
                    thermal_confirmation=item.get("thermal_confirmation"),
                    depth=item.get("depth"),
                    distance=item.get("distance"),
                    velocity=item.get("velocity"),
                    frame_id=item.get("frame_id"),
                    source_type=item.get("source_type"),
                    source_name=item.get("source_name"),
                )
            except Exception:
                continue
            self._detections[record.id] = record
            self._history_ids.append(record.id)
            self._last_detection_id = record.id

    def _record_from_payload_item(self, item: Dict[str, Any]) -> Optional[DetectionRecord]:
        try:
            bbox = item.get("bbox") or {}
            if isinstance(bbox, list):
                bbox = self._bbox_dict(bbox)
            return DetectionRecord(
                id=str(item.get("id") or uuid.uuid4().hex),
                timestamp=str(item.get("timestamp") or item.get("created_at") or utc_now_iso()),
                session_id=str(item.get("session_id") or self.session_id),
                source=str(item.get("source") or "unknown"),
                source_label=str(item.get("source_label") or item.get("source") or "Unknown"),
                image_name=str(item.get("image_name") or Path(str(item.get("image_path") or "")).name),
                image_path=str(item.get("image_path") or ""),
                class_id=item.get("class_id"),
                class_name=str(item.get("class_name") or item.get("label") or "object"),
                confidence=item.get("confidence"),
                bbox=bbox,
                status=str(item.get("status") or "ACTIVE"),
                created_at=str(item.get("created_at") or utc_now_iso()),
                updated_at=str(item.get("updated_at") or utc_now_iso()),
                track_id=item.get("track_id"),
                thermal_confirmation=item.get("thermal_confirmation"),
                depth=item.get("depth"),
                distance=item.get("distance"),
                velocity=item.get("velocity"),
                frame_id=item.get("frame_id"),
                source_type=item.get("source_type"),
                source_name=item.get("source_name"),
            )
        except Exception:
            return None

    def _load_current_snapshot(self) -> None:
        if not self.current_path.exists():
            return
        try:
            payload = read_json(self.current_path)
        except Exception:
            return
        current_ids: List[str] = []
        for item in payload.get("detections", []) or payload.get("last_detections", []):
            record = self._record_from_payload_item(item)
            if record is None:
                continue
            self._detections[record.id] = record
            if record.id not in self._history_ids:
                self._history_ids.append(record.id)
            current_ids.append(record.id)
            self._last_detection_id = record.id
        self._current_ids = current_ids
        self._last_image = payload.get("last_image") or payload.get("image_path") or self._last_image
        self._last_source = str(payload.get("source") or self._last_source)
        self._last_source_label = str(payload.get("source_label") or self._last_source_label)
        self._last_inference_ms = payload.get("last_inference_ms")
        self._last_fps = payload.get("fps")
        self._last_run_ts = payload.get("last_run_ts") or payload.get("updated_at")
        self._last_error = str(payload.get("error") or "")

    def _load_history_journal(self) -> None:
        if not self.history_journal_path.exists():
            return
        try:
            with self.history_journal_path.open("r", encoding="utf-8") as stream:
                lines = stream.readlines()
        except OSError:
            # A compact snapshot remains available if the journal can't be read.
            return
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except (json.JSONDecodeError, ValueError):
                # Skip only the corrupted line (e.g. shutdown interrupted an
                # append); one bad line must not drop every record after it.
                continue
            record = self._record_from_payload_item(item)
            if record is None:
                continue
            self._journal_record_ids.add(record.id)
            if record.id in self._detections:
                continue
            self._detections[record.id] = record
            self._history_ids.append(record.id)
            self._last_detection_id = record.id

    def _bbox_dict(self, value: Any) -> Dict[str, Optional[float]]:
        if isinstance(value, dict):
            return {
                "x1": self._float_or_none(value.get("x1")),
                "y1": self._float_or_none(value.get("y1")),
                "x2": self._float_or_none(value.get("x2")),
                "y2": self._float_or_none(value.get("y2")),
            }
        if isinstance(value, (list, tuple)) and len(value) >= 4:
            return {
                "x1": self._float_or_none(value[0]),
                "y1": self._float_or_none(value[1]),
                "x2": self._float_or_none(value[2]),
                "y2": self._float_or_none(value[3]),
            }
        return {"x1": None, "y1": None, "x2": None, "y2": None}

    def _float_or_none(self, value: Any) -> Optional[float]:
        try:
            return None if value is None else round(float(value), 4)
        except Exception:
            return None

    def _active_session_id(self, *, source: str = "replay") -> str:
        if self.session_manager is None:
            return self.session_id
        try:
            session = self.session_manager.ensure_session(mode=source, operator="auto")
            session_id = session.get("session_id")
            if session_id:
                self.session_id = str(session_id)
                return self.session_id
        except Exception:
            pass
        return self.session_id

    def _event(self, record: DetectionRecord) -> None:
        if not self.events:
            return
        confidence = "--" if record.confidence is None else f"{record.confidence:.2f}"
        description = f"Detection {record.id}: {record.class_name} confidence {confidence} source {record.source_label}"
        try:
            self.events.add(
                "DETECTION_MANAGER",
                "DETECTION_NEW",
                description,
                "info",
                meta=record.to_dict(),
            )
        except Exception:
            pass

    def _payload(self, *, current_only: bool = True) -> Dict[str, Any]:
        ids = self._current_ids if current_only else self._history_ids
        detections = [self._detections[item_id].to_dict() for item_id in ids if item_id in self._detections]
        return {
            "ok": True,
            "manager": "DetectionManager",
            "session_id": self.session_id,
            "source": self._last_source,
            "source_label": self._last_source_label,
            "last_image": self._last_image,
            "image_path": self._last_image,
            "last_run_ts": self._last_run_ts,
            "last_inference_ms": self._last_inference_ms,
            "fps": self._last_fps,
            "error": self._last_error,
            "count": len(detections),
            "detections": detections,
            "last_detections": detections,
            "last_detection": self.get_detection(self._last_detection_id) if self._last_detection_id else None,
            "current_detections_path": str(self.current_path),
            "history_path": str(self.history_path),
            "updated_at": utc_now_iso(),
        }

    def _append_history_journal(self, records: List[DetectionRecord]) -> None:
        if not records:
            return
        with self.history_journal_path.open("a", encoding="utf-8") as stream:
            for record in records:
                stream.write(json.dumps(record.to_dict(), ensure_ascii=False, separators=(",", ":")) + "\n")

    def _persist(
        self,
        *,
        force_history: bool = False,
        journal_records: List[DetectionRecord] | None = None,
    ) -> None:
        atomic_write_json(self.current_path, self._payload(current_only=True))
        self._append_history_journal(journal_records or [])
        journal_size = self.history_journal_path.stat().st_size if self.history_journal_path.exists() else 0
        compaction_due = (
            time.monotonic() - self._last_history_compaction >= self._history_compaction_interval
            and journal_size >= self._history_compaction_bytes
        )
        if force_history or compaction_due:
            atomic_write_json(self.history_path, self._payload(current_only=False))
            self.history_journal_path.write_text("", encoding="utf-8")
            self._journal_record_ids.clear()
            self._last_history_compaction = time.monotonic()

    def _build_record(
        self,
        detection: Dict[str, Any],
        *,
        session_id: str,
        source: str,
        source_label: str,
        image_path: str,
        timestamp: str,
        status: str,
    ) -> DetectionRecord:
        now = utc_now_iso()
        return DetectionRecord(
            id=str(detection.get("id") or f"det-{uuid.uuid4().hex[:12]}"),
            timestamp=timestamp,
            session_id=session_id,
            source=source,
            source_label=str(source_label or detection.get("source_label") or source or "Unknown"),
            image_name=Path(image_path).name,
            image_path=image_path,
            class_id=detection.get("class_id"),
            class_name=str(detection.get("class_name") or detection.get("label") or "object"),
            confidence=self._float_or_none(detection.get("confidence")),
            bbox=self._bbox_dict(detection.get("bbox") or detection.get("box_xyxy") or detection.get("xyxy")),
            status=status,
            created_at=now,
            updated_at=now,
            track_id=detection.get("track_id"),
            thermal_confirmation=detection.get("thermal_confirmation"),
            depth=detection.get("depth"),
            distance=detection.get("distance"),
            velocity=detection.get("velocity"),
            frame_id=detection.get("frame_id"),
            source_type=detection.get("source_type"),
            source_name=detection.get("source_name"),
        )

    def _append_record(self, record: DetectionRecord) -> None:
        self._detections[record.id] = record
        self._current_ids.append(record.id)
        self._history_ids.append(record.id)
        self._last_detection_id = record.id
        self._last_image = record.image_path or self._last_image
        self._last_source = record.source
        self._last_source_label = record.source_label

    def add_detection(
        self,
        detection: Dict[str, Any],
        *,
        source: str = "unknown",
        source_label: str | None = None,
        image_path: str | Path | None = None,
        timestamp: str | None = None,
        status: str = "NEW",
    ) -> Dict[str, Any]:
        image_path_value = "" if image_path is None else str(image_path)
        active_source = str(source or detection.get("source") or "unknown")
        record = self._build_record(
            detection,
            session_id=self._active_session_id(source=active_source),
            source=active_source,
            source_label=str(source_label or detection.get("source_label") or source or "Unknown"),
            image_path=image_path_value,
            timestamp=timestamp or utc_now_iso(),
            status=status,
        )
        with self._lock:
            self._append_record(record)
            self._persist(journal_records=[record])
        self._event(record)
        if self.event_manager is not None:
            try:
                self.event_manager.record_detection(record.to_dict())
            except Exception:
                pass
        return record.to_dict()

    def record_inference_result(self, result: Dict[str, Any], *, mode: str = "replay") -> Dict[str, Any]:
        timestamp = str(result.get("updated_at") or utc_now_iso())
        source = str(result.get("source") or ("replay" if mode in {"replay", "demo", "loop", "single", "once"} else mode))
        source_label = str(result.get("source_label") or ("Replay / Demo" if source == "replay" else source.replace("_", " ").title()))
        image_path = str(result.get("image_path") or result.get("last_image") or "")
        detections = result.get("detections") if isinstance(result.get("detections"), list) else []
        session_id = self._active_session_id(source=source)
        records = [
            self._build_record(
                detection,
                session_id=session_id,
                source=source,
                source_label=source_label,
                image_path=image_path,
                timestamp=timestamp,
                status="NEW",
            )
            for detection in detections
        ]
        with self._lock:
            for item_id in self._current_ids:
                if item_id in self._detections:
                    self._detections[item_id].status = "RESOLVED"
                    self._detections[item_id].updated_at = timestamp
            self._current_ids = []
            self._last_detection_id = None
            self._last_image = image_path or self._last_image
            self._last_source = source
            self._last_source_label = source_label
            self._last_inference_ms = result.get("inference_time_ms", result.get("last_inference_ms"))
            self._last_fps = result.get("fps")
            self._last_run_ts = timestamp
            self._last_error = "" if result.get("ok", True) else str(result.get("error") or "")
            for record in records:
                self._append_record(record)
            self._persist(journal_records=records)
        added = [record.to_dict() for record in records]
        for record in records:
            self._event(record)
        if self.event_manager is not None and added:
            try:
                batch_recorder = getattr(self.event_manager, "record_detections", None)
                if callable(batch_recorder):
                    batch_recorder(added)
                else:
                    for detection in added:
                        self.event_manager.record_detection(detection)
            except Exception:
                pass
        if self.acquisition_manager is not None:
            try:
                self.acquisition_manager.record_inference_result(result, added)
            except Exception:
                pass
        elif self.session_manager is not None:
            try:
                self.session_manager.record_inference_result(result, added)
            except Exception:
                pass
        return self.get_current_detections()

    def get_detection(self, detection_id: str | None) -> Optional[Dict[str, Any]]:
        if not detection_id:
            return None
        record = self._detections.get(str(detection_id))
        return record.to_dict() if record else None

    def get_current_detections(self) -> Dict[str, Any]:
        with self._lock:
            return self._payload(current_only=True)

    def get_history(self) -> Dict[str, Any]:
        with self._lock:
            return self._payload(current_only=False)

    def clear(self) -> Dict[str, Any]:
        with self._lock:
            self._detections.clear()
            self._current_ids = []
            self._history_ids = []
            self._last_detection_id = None
            self._last_error = ""
            self._persist(force_history=True)
            return self._payload(current_only=True)

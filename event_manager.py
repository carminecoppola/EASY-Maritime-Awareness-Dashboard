from __future__ import annotations

import threading
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from runtime_support import atomic_write_json, parse_utc_ts, read_json, utc_now_iso


PROJECT_ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = PROJECT_ROOT / "runtime"
SESSIONS_DIR = RUNTIME_ROOT / "sessions"
EVENT_STATUSES = {"NEW", "ACTIVE", "RESOLVED"}
EVENT_SEVERITIES = {"INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"}

DETECTION_EVENT_MAP = {
    "boat": {"type": "BoatDetected", "severity": "LOW"},
    "ship": {"type": "ShipDetected", "severity": "LOW"},
    "buoy": {"type": "BuoyDetected", "severity": "INFO"},
}
@dataclass
class EventRecord:
    event_id: str
    session_id: str
    type: str
    severity: str
    status: str
    source: str
    related_detection_ids: List[str]
    created_at: str
    updated_at: str
    track_id: Optional[str] = None
    thermal_confirmation: Optional[bool] = None
    distance: Optional[float] = None
    priority: Optional[str] = None
    resolved_at: Optional[str] = None
    notes: Optional[str] = None
    update_count: int = 1
    last_timestamp: Optional[str] = None
    last_confidence: Optional[float] = None
    source_label: Optional[str] = None
    event_key: Optional[str] = None
    meta: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["id"] = self.event_id
        payload["count"] = self.update_count
        payload["timestamp"] = self.created_at
        payload["label"] = self.type
        return payload


class EventManager:
    """Builds higher-level mission events from detections and session context."""

    def __init__(
        self,
        sessions_dir: Path | str = SESSIONS_DIR,
        *,
        events: Any | None = None,
        session_manager: Any | None = None,
    ) -> None:
        self.sessions_dir = Path(sessions_dir)
        self.current_path = self.sessions_dir / "current_events.json"
        self.history_path = self.sessions_dir / "event_history.json"
        self.events = events
        self.session_manager = session_manager
        self._lock = threading.RLock()
        self._records: Dict[str, EventRecord] = {}
        self._current_ids: List[str] = []
        self._history_ids: List[str] = []
        self._active_keys: Dict[str, str] = {}
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self._load_history_snapshot()
        self._load_current_snapshot()
        self._persist()

    def _session_events_path(self, session_id: str) -> Path:
        return self.sessions_dir / session_id / "events.json"

    def _float_or_none(self, value: Any) -> float | None:
        try:
            return None if value is None else round(float(value), 4)
        except Exception:
            return None

    def _record_from_item(self, item: Dict[str, Any]) -> EventRecord | None:
        try:
            record = EventRecord(
                event_id=str(item.get("event_id") or item.get("id") or f"evt-{uuid.uuid4().hex[:12]}"),
                session_id=str(item.get("session_id") or ""),
                type=str(item.get("type") or "ObjectDetected"),
                severity=str(item.get("severity") or "INFO").upper(),
                status=str(item.get("status") or "NEW").upper(),
                source=str(item.get("source") or "unknown"),
                related_detection_ids=[str(value) for value in item.get("related_detection_ids") or []],
                created_at=str(item.get("created_at") or item.get("timestamp") or utc_now_iso()),
                updated_at=str(item.get("updated_at") or utc_now_iso()),
                track_id=item.get("track_id"),
                thermal_confirmation=item.get("thermal_confirmation"),
                distance=self._float_or_none(item.get("distance")),
                priority=item.get("priority"),
                resolved_at=item.get("resolved_at"),
                notes=item.get("notes"),
                update_count=max(1, int(item.get("update_count") or item.get("count") or 1)),
                last_timestamp=str(item.get("last_timestamp") or item.get("updated_at") or item.get("created_at") or utc_now_iso()),
                last_confidence=self._float_or_none(item.get("last_confidence")),
                source_label=item.get("source_label"),
                event_key=item.get("event_key"),
                meta=item.get("meta") if isinstance(item.get("meta"), dict) else {},
            )
            if record.severity not in EVENT_SEVERITIES:
                record.severity = "INFO"
            if record.status not in EVENT_STATUSES:
                record.status = "NEW"
            return record
        except Exception:
            return None

    def _load_history_snapshot(self) -> None:
        payload = read_json(self.history_path, {"events": []})
        for item in payload.get("events", []):
            record = self._record_from_item(item)
            if record is None:
                continue
            self._records[record.event_id] = record
            self._history_ids.append(record.event_id)
            if record.status in {"NEW", "ACTIVE"} and record.event_key:
                self._active_keys[record.event_key] = record.event_id

    def _load_current_snapshot(self) -> None:
        payload = read_json(self.current_path, {"events": []})
        current_ids: List[str] = []
        for item in payload.get("events", []) or payload.get("current_events", []):
            record = self._record_from_item(item)
            if record is None:
                continue
            self._records[record.event_id] = record
            if record.event_id not in self._history_ids:
                self._history_ids.append(record.event_id)
            current_ids.append(record.event_id)
            if record.status in {"NEW", "ACTIVE"} and record.event_key:
                self._active_keys[record.event_key] = record.event_id
        self._current_ids = current_ids

    def _event_payload(self, *, current_only: bool) -> Dict[str, Any]:
        ids = self._current_ids if current_only else self._history_ids
        items = [self._records[item_id].to_dict() for item_id in ids if item_id in self._records]
        return {
            "ok": True,
            "count": len(items),
            "events": items,
            "current_events": [self._records[item_id].to_dict() for item_id in self._current_ids if item_id in self._records],
            "history_path": str(self.history_path),
            "current_events_path": str(self.current_path),
            "updated_at": utc_now_iso(),
        }

    def _sync_session_file(self, session_id: str) -> None:
        if not session_id:
            return
        path = self._session_events_path(session_id)
        payload = read_json(
            path,
            {"ok": True, "session_id": session_id, "count": 0, "events": [], "current_events": [], "activity_log": []},
        )
        session_events = [
            self._records[item_id].to_dict()
            for item_id in self._history_ids
            if item_id in self._records and self._records[item_id].session_id == session_id
        ]
        session_current = [
            self._records[item_id].to_dict()
            for item_id in self._current_ids
            if item_id in self._records and self._records[item_id].session_id == session_id
        ]
        payload.update(
            {
                "ok": True,
                "session_id": session_id,
                "count": len(session_events),
                "active_count": len(session_current),
                "events": session_events,
                "current_events": session_current,
                "updated_at": utc_now_iso(),
            }
        )
        if not isinstance(payload.get("activity_log"), list):
            payload["activity_log"] = []
        atomic_write_json(path, payload)

    def _persist(self, session_ids: set[str] | None = None) -> None:
        atomic_write_json(self.current_path, self._event_payload(current_only=True))
        atomic_write_json(self.history_path, self._event_payload(current_only=False))
        affected_session_ids = session_ids
        if affected_session_ids is None:
            affected_session_ids = {
                self._records[item_id].session_id
                for item_id in self._history_ids
                if item_id in self._records and self._records[item_id].session_id
            }
        for session_id in affected_session_ids:
            self._sync_session_file(session_id)

    def _classification(self, detection: Dict[str, Any]) -> Dict[str, str] | None:
        label = str(detection.get("class_name") or detection.get("label") or detection.get("type") or "").strip().lower()
        return DETECTION_EVENT_MAP.get(label)

    def _event_key(self, *, session_id: str, event_type: str, source: str, track_id: str | None = None) -> str:
        parts = [session_id or "no-session", event_type, source or "unknown", track_id or "no-track"]
        return "::".join(parts)

    def _emit_activity(self, record: EventRecord, created: bool) -> None:
        if not self.events:
            return
        event_type = "EVENT_CREATED" if created else "EVENT_UPDATED"
        action = "created" if created else "updated"
        description = f"Event {record.type} {action} for session {record.session_id}"
        try:
            self.events.add("EVENT_ENGINE", event_type, description, record.severity.lower(), meta=record.to_dict())
        except Exception:
            pass

    def _record_detection_locked(self, detection: Dict[str, Any]) -> tuple[EventRecord, bool] | None:
        classification = self._classification(detection)
        if classification is None:
            return None
        now = utc_now_iso()
        session_id = str(detection.get("session_id") or "")
        if not session_id and self.session_manager is not None:
            try:
                session = self.session_manager.ensure_session(mode=str(detection.get("source") or "replay"), operator="auto")
                session_id = str(session.get("session_id") or "")
            except Exception:
                session_id = ""
        source = str(detection.get("source") or "unknown")
        track_id = detection.get("track_id")
        event_type = classification["type"]
        event_key = self._event_key(session_id=session_id, event_type=event_type, source=source, track_id=str(track_id) if track_id else None)
        detection_id = str(detection.get("id") or detection.get("detection_id") or "")
        confidence = self._float_or_none(detection.get("confidence"))
        timestamp = str(detection.get("timestamp") or detection.get("created_at") or now)

        current_id = self._active_keys.get(event_key)
        if current_id and current_id in self._records:
            record = self._records[current_id]
            if detection_id and detection_id not in record.related_detection_ids:
                record.related_detection_ids.append(detection_id)
            record.updated_at = now
            record.last_timestamp = timestamp
            record.last_confidence = confidence
            record.distance = self._float_or_none(detection.get("distance")) or record.distance
            record.thermal_confirmation = detection.get("thermal_confirmation", record.thermal_confirmation)
            record.track_id = detection.get("track_id", record.track_id)
            record.source_label = str(detection.get("source_label") or record.source_label or source)
            record.update_count += 1
            record.status = "ACTIVE"
            record.meta = {
                **record.meta,
                "class_name": detection.get("class_name") or detection.get("label"),
                "image_path": detection.get("image_path"),
                "bbox": detection.get("bbox") or detection.get("box_xyxy"),
            }
            return record, False

        record = EventRecord(
            event_id=f"evt-{uuid.uuid4().hex[:12]}",
            session_id=session_id,
            type=event_type,
            severity=classification["severity"],
            status="NEW",
            source=source,
            related_detection_ids=[detection_id] if detection_id else [],
            created_at=now,
            updated_at=now,
            track_id=detection.get("track_id"),
            thermal_confirmation=detection.get("thermal_confirmation"),
            distance=self._float_or_none(detection.get("distance")),
            priority=None,
            resolved_at=None,
            notes=None,
            update_count=1,
            last_timestamp=timestamp,
            last_confidence=confidence,
            source_label=str(detection.get("source_label") or source),
            event_key=event_key,
            meta={
                "class_name": detection.get("class_name") or detection.get("label"),
                "image_path": detection.get("image_path"),
                "bbox": detection.get("bbox") or detection.get("box_xyxy"),
            },
        )
        self._records[record.event_id] = record
        self._history_ids.append(record.event_id)
        self._current_ids.append(record.event_id)
        self._active_keys[event_key] = record.event_id
        return record, True

    def record_detections(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Record one inference frame with a single durable write."""
        changed: List[tuple[EventRecord, bool]] = []
        with self._lock:
            for detection in detections:
                result = self._record_detection_locked(detection)
                if result is not None:
                    changed.append(result)
            if changed:
                self._persist({record.session_id for record, _ in changed if record.session_id})
        for record, created in changed:
            self._emit_activity(record, created=created)
        return [record.to_dict() for record, _ in changed]

    def record_detection(self, detection: Dict[str, Any]) -> Dict[str, Any] | None:
        records = self.record_detections([detection])
        return records[0] if records else None

    def resolve_event(self, event_id: str, *, notes: str | None = None) -> Dict[str, Any] | None:
        with self._lock:
            record = self._records.get(event_id)
            if record is None:
                return None
            record.status = "RESOLVED"
            record.resolved_at = utc_now_iso()
            record.updated_at = record.resolved_at
            if notes is not None:
                record.notes = notes
            if event_id in self._current_ids:
                self._current_ids = [item_id for item_id in self._current_ids if item_id != event_id]
            if record.event_key and self._active_keys.get(record.event_key) == event_id:
                self._active_keys.pop(record.event_key, None)
            self._persist()
            return record.to_dict()

    def resolve_session_events(self, session_id: str, *, notes: str | None = None) -> Dict[str, Any]:
        resolved = []
        with self._lock:
            for event_id in list(self._current_ids):
                record = self._records.get(event_id)
                if record is None or record.session_id != session_id:
                    continue
                record.status = "RESOLVED"
                record.resolved_at = utc_now_iso()
                record.updated_at = record.resolved_at
                if notes is not None:
                    record.notes = notes
                if record.event_key and self._active_keys.get(record.event_key) == event_id:
                    self._active_keys.pop(record.event_key, None)
                resolved.append(record.to_dict())
            self._current_ids = [
                event_id
                for event_id in self._current_ids
                if self._records.get(event_id) is not None and self._records[event_id].status in {"NEW", "ACTIVE"}
            ]
            self._persist()
        return {"ok": True, "count": len(resolved), "events": resolved, "session_id": session_id}

    def get_event(self, event_id: str | None) -> Dict[str, Any] | None:
        if not event_id:
            return None
        with self._lock:
            record = self._records.get(str(event_id))
            return record.to_dict() if record else None

    def get_current_events(self) -> Dict[str, Any]:
        with self._lock:
            return self._event_payload(current_only=True)

    def get_history(self) -> Dict[str, Any]:
        with self._lock:
            return self._event_payload(current_only=False)

    def clear(self) -> Dict[str, Any]:
        with self._lock:
            session_ids = {
                self._records[item_id].session_id
                for item_id in self._history_ids
                if item_id in self._records and self._records[item_id].session_id
            }
            self._records.clear()
            self._current_ids = []
            self._history_ids = []
            self._active_keys.clear()
            self._persist()
            for session_id in session_ids:
                self._sync_session_file(session_id)
            return self._event_payload(current_only=True)

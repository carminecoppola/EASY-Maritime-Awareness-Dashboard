from __future__ import annotations

import socket
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from runtime_support import atomic_write_json, parse_utc_ts, read_json, utc_now_iso


PROJECT_ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = PROJECT_ROOT / "runtime"
SESSIONS_ROOT = RUNTIME_ROOT / "sessions"
SESSION_STATUSES = {"CREATED", "RUNNING", "STOPPED"}
SESSION_SUBDIRS = ("snapshots", "replay", "rgb_left", "rgb_right", "thermal")
def session_timestamp() -> str:
    return time.strftime("%Y%m%d_%H%M%S", time.gmtime())


class SessionManager:
    """Owns lifecycle and metadata for acquisition sessions on disk."""

    def __init__(
        self,
        sessions_root: Path | str = SESSIONS_ROOT,
        *,
        events: Any | None = None,
        hostname: str | None = None,
        model_name: str = "easy_v1_best_rgb.onnx",
        model_type: str = "onnx",
        project_version: str = "EASY Dashboard Phase 6",
    ) -> None:
        self.sessions_root = Path(sessions_root)
        self.index_path = self.sessions_root / "index.json"
        self.events = events
        self.hostname = hostname or socket.gethostname()
        self.model_name = model_name
        self.model_type = model_type
        self.project_version = project_version
        self._lock = threading.RLock()
        self._index: List[Dict[str, Any]] = []
        self._current: Dict[str, Any] | None = None
        self.sessions_root.mkdir(parents=True, exist_ok=True)
        self._load_session_index()
        self._restore_running_session()

    def _load_session_index(self) -> None:
        payload = read_json(self.index_path, {"sessions": []})
        sessions = payload.get("sessions", [])
        self._index = sessions if isinstance(sessions, list) else []
        self._persist_session_index()

    def _persist_session_index(self) -> None:
        atomic_write_json(
            self.index_path,
            {
                "ok": True,
                "count": len(self._index),
                "sessions": self._index,
                "updated_at": utc_now_iso(),
            },
        )

    def _restore_running_session(self) -> None:
        for item in reversed(self._index):
            if str(item.get("status") or "").upper() != "RUNNING":
                continue
            session_dir = Path(str(item.get("path") or ""))
            metadata = read_json(session_dir / "metadata.json", {})
            if metadata.get("status") == "RUNNING":
                self._current = metadata
                return

    def _session_dir(self, session_id: str) -> Path:
        return self.sessions_root / session_id

    def _paths(self, session_id: str) -> Dict[str, Path]:
        root = self._session_dir(session_id)
        return {
            "root": root,
            "metadata": root / "metadata.json",
            "detections": root / "detections.json",
            "metrics": root / "metrics.json",
            "events": root / "events.json",
        }

    def _ensure_structure(self, session_id: str) -> None:
        paths = self._paths(session_id)
        paths["root"].mkdir(parents=True, exist_ok=True)
        for folder in SESSION_SUBDIRS:
            (paths["root"] / folder).mkdir(parents=True, exist_ok=True)
        if not paths["detections"].exists():
            atomic_write_json(paths["detections"], {"ok": True, "session_id": session_id, "count": 0, "detections": []})
        if not paths["events"].exists():
            atomic_write_json(
                paths["events"],
                {"ok": True, "session_id": session_id, "count": 0, "active_count": 0, "events": [], "current_events": [], "activity_log": []},
            )
        if not paths["metrics"].exists():
            atomic_write_json(paths["metrics"], self._empty_metrics(session_id))

    def _empty_metrics(self, session_id: str) -> Dict[str, Any]:
        return {
            "ok": True,
            "session_id": session_id,
            "total_detections": 0,
            "total_events": 0,
            "active_events": 0,
            "boat_count": 0,
            "ship_count": 0,
            "buoy_count": 0,
            "session_duration": 0,
            "inference_calls": 0,
            "average_inference_time": None,
            "updated_at": utc_now_iso(),
        }

    def _metadata_payload(
        self,
        session_id: str,
        *,
        start_time: str,
        end_time: str | None = None,
        status: str = "RUNNING",
        mode: str = "replay",
        operator: str = "operator",
        notes: str = "",
    ) -> Dict[str, Any]:
        start_ts = parse_utc_ts(start_time)
        end_ts = parse_utc_ts(end_time) if end_time else time.time()
        duration = round(max(0.0, (end_ts or 0.0) - (start_ts or end_ts or 0.0)), 2)
        return {
            "ok": True,
            "session_id": session_id,
            "start_time": start_time,
            "end_time": end_time,
            "duration": duration,
            "status": status,
            "mode": mode,
            "operator": operator,
            "hostname": self.hostname,
            "model_name": self.model_name,
            "model_type": self.model_type,
            "project_version": self.project_version,
            "notes": notes,
            "editable": {
                "operator": operator,
                "notes": notes,
                "campaign": None,
                "location": None,
                "weather": None,
            },
            "path": str(self._session_dir(session_id)),
            "updated_at": utc_now_iso(),
        }

    def _update_index_item(self, metadata: Dict[str, Any]) -> None:
        session_id = str(metadata.get("session_id") or "")
        summary = {
            "session_id": session_id,
            "start_time": metadata.get("start_time"),
            "end_time": metadata.get("end_time"),
            "duration": metadata.get("duration"),
            "status": metadata.get("status"),
            "mode": metadata.get("mode"),
            "operator": metadata.get("operator"),
            "path": metadata.get("path"),
            "updated_at": metadata.get("updated_at"),
        }
        self._index = [item for item in self._index if item.get("session_id") != session_id]
        self._index.append(summary)
        self._persist_session_index()

    def _write_metadata(self, metadata: Dict[str, Any]) -> None:
        session_id = str(metadata["session_id"])
        atomic_write_json(self._paths(session_id)["metadata"], metadata)
        self._update_index_item(metadata)

    def _current_id(self) -> str | None:
        if not self._current:
            return None
        return str(self._current.get("session_id") or "")

    def start_session(
        self,
        *,
        mode: str = "replay",
        operator: str = "operator",
        model_name: str | None = None,
        model_type: str | None = None,
        notes: str = "",
    ) -> Dict[str, Any]:
        with self._lock:
            if self._current and self._current.get("status") == "RUNNING":
                return {"ok": True, "message": "Session already running", "session": self.get_current_session()}
            if model_name:
                self.model_name = model_name
            if model_type:
                self.model_type = model_type
            session_id = f"session_{session_timestamp()}"
            start_time = utc_now_iso()
            self._ensure_structure(session_id)
            metadata = self._metadata_payload(
                session_id,
                start_time=start_time,
                status="RUNNING",
                mode=mode,
                operator=operator,
                notes=notes,
            )
            self._current = metadata
            self._write_metadata(metadata)
            self._emit("SESSION_START", f"Session {session_id} started", "info", metadata)
            return {"ok": True, "message": "Session started", "session": self.get_current_session()}

    def ensure_session(self, *, mode: str = "replay", operator: str = "auto", model_name: str | None = None, model_type: str | None = None) -> Dict[str, Any]:
        with self._lock:
            if self._current and self._current.get("status") == "RUNNING":
                return self.get_current_session()
        return self.start_session(mode=mode, operator=operator, model_name=model_name, model_type=model_type).get("session", {})

    def stop_session(self) -> Dict[str, Any]:
        with self._lock:
            if not self._current:
                return {"ok": True, "message": "No running session", "session": None}
            metadata = dict(self._current)
            if metadata.get("status") == "STOPPED":
                self._current = None
                return {"ok": True, "message": "Session already stopped", "session": metadata}
            end_time = utc_now_iso()
            metadata = self._metadata_payload(
                str(metadata["session_id"]),
                start_time=str(metadata["start_time"]),
                end_time=end_time,
                status="STOPPED",
                mode=str(metadata.get("mode") or "replay"),
                operator=str(metadata.get("operator") or "operator"),
                notes=str(metadata.get("notes") or ""),
            )
            self._current = None
            self._write_metadata(metadata)
            self._refresh_metrics(metadata["session_id"])
            self._emit("SESSION_STOP", f"Session {metadata['session_id']} stopped", "info", metadata)
            return {"ok": True, "message": "Session stopped", "session": self._session_payload(metadata)}

    def is_running(self) -> bool:
        return bool(self._current and self._current.get("status") == "RUNNING")

    def get_current_session(self) -> Dict[str, Any] | None:
        with self._lock:
            if not self._current:
                return None
            metadata = self._metadata_payload(
                str(self._current["session_id"]),
                start_time=str(self._current["start_time"]),
                end_time=self._current.get("end_time"),
                status=str(self._current.get("status") or "RUNNING"),
                mode=str(self._current.get("mode") or "replay"),
                operator=str(self._current.get("operator") or "operator"),
                notes=str(self._current.get("notes") or ""),
            )
            self._current = metadata
            self._write_metadata(metadata)
            self._refresh_metrics(metadata["session_id"])
            return self._session_payload(metadata)

    def status(self) -> Dict[str, Any]:
        current = self.get_current_session()
        return {
            "ok": True,
            "running": bool(current and current.get("status") == "RUNNING"),
            "current": current,
            "count": len(self._index),
            "index_path": str(self.index_path),
            "sessions_root": str(self.sessions_root),
            "updated_at": utc_now_iso(),
        }

    def list_sessions(self) -> Dict[str, Any]:
        with self._lock:
            sessions = []
            for item in reversed(self._index):
                session_dir = Path(str(item.get("path") or ""))
                metadata = read_json(session_dir / "metadata.json", item)
                sessions.append(self._session_payload(metadata))
            return {"ok": True, "count": len(sessions), "sessions": sessions, "index_path": str(self.index_path)}

    def record_inference_result(self, result: Dict[str, Any], detections: List[Dict[str, Any]]) -> None:
        mode = str(result.get("source") or result.get("mode") or "replay")
        session = self.ensure_session(mode=mode, operator="auto")
        session_id = str(session.get("session_id") or "")
        if not session_id:
            return
        detections_path = self._paths(session_id)["detections"]
        payload = read_json(detections_path, {"ok": True, "session_id": session_id, "detections": []})
        existing = payload.get("detections", [])
        if not isinstance(existing, list):
            existing = []
        existing.extend(detections)
        payload.update(
            {
                "ok": True,
                "session_id": session_id,
                "count": len(existing),
                "detections": existing,
                "updated_at": utc_now_iso(),
            }
        )
        atomic_write_json(detections_path, payload)
        self._append_session_event(
            session_id,
            "INFERENCE_RESULT",
            {
                "image_path": result.get("image_path"),
                "count": len(detections),
                "inference_time_ms": result.get("inference_time_ms"),
                "source": result.get("source"),
            },
        )
        self._refresh_metrics(session_id, inference_time_ms=result.get("inference_time_ms"))

    def _refresh_metrics(self, session_id: str, inference_time_ms: Any | None = None) -> Dict[str, Any]:
        paths = self._paths(session_id)
        detections_payload = read_json(paths["detections"], {"detections": []})
        detections = detections_payload.get("detections", [])
        if not isinstance(detections, list):
            detections = []
        previous = read_json(paths["metrics"], self._empty_metrics(session_id))
        events_payload = read_json(paths["events"], {"events": [], "current_events": []})
        stored_events = events_payload.get("events", [])
        current_events = events_payload.get("current_events", [])
        if not isinstance(stored_events, list):
            stored_events = []
        if not isinstance(current_events, list):
            current_events = []
        inference_calls = int(previous.get("inference_calls") or 0)
        average = previous.get("average_inference_time")
        if inference_time_ms is not None:
            try:
                elapsed = float(inference_time_ms)
                average = elapsed if not inference_calls else ((float(average or 0.0) * inference_calls) + elapsed) / (inference_calls + 1)
                inference_calls += 1
            except Exception:
                pass
        metadata = read_json(paths["metadata"], {})
        start_ts = parse_utc_ts(metadata.get("start_time"))
        end_ts = parse_utc_ts(metadata.get("end_time")) if metadata.get("end_time") else time.time()
        duration = round(max(0.0, (end_ts or 0.0) - (start_ts or end_ts or 0.0)), 2)
        metrics = {
            "ok": True,
            "session_id": session_id,
            "total_detections": len(detections),
            "total_events": len(stored_events),
            "active_events": len(current_events),
            "boat_count": sum(1 for item in detections if str(item.get("class_name") or item.get("label") or "").lower() == "boat"),
            "ship_count": sum(1 for item in detections if str(item.get("class_name") or item.get("label") or "").lower() == "ship"),
            "buoy_count": sum(1 for item in detections if str(item.get("class_name") or item.get("label") or "").lower() == "buoy"),
            "session_duration": duration,
            "inference_calls": inference_calls,
            "average_inference_time": round(float(average), 2) if average is not None else None,
            "updated_at": utc_now_iso(),
        }
        atomic_write_json(paths["metrics"], metrics)
        return metrics

    def _session_payload(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        session_id = str(metadata.get("session_id") or "")
        paths = self._paths(session_id)
        metrics = read_json(paths["metrics"], self._empty_metrics(session_id))
        return {
            **metadata,
            "metrics": metrics,
            "paths": {key: str(path) for key, path in paths.items()},
        }

    def _append_session_event(self, session_id: str, event_type: str, meta: Dict[str, Any]) -> None:
        path = self._paths(session_id)["events"]
        payload = read_json(path, {"ok": True, "session_id": session_id, "events": [], "current_events": [], "activity_log": []})
        activity_log = payload.get("activity_log", [])
        if not isinstance(activity_log, list):
            activity_log = []
        activity_log.append({"timestamp": utc_now_iso(), "type": event_type, "meta": meta})
        payload.update(
            {
                "ok": True,
                "session_id": session_id,
                "activity_log": activity_log,
                "updated_at": utc_now_iso(),
            }
        )
        if not isinstance(payload.get("events"), list):
            payload["events"] = []
        if not isinstance(payload.get("current_events"), list):
            payload["current_events"] = []
        payload["count"] = len(payload["events"])
        payload["active_count"] = len(payload["current_events"])
        atomic_write_json(path, payload)

    def _emit(self, event_type: str, description: str, severity: str, meta: Dict[str, Any]) -> None:
        if not self.events:
            return
        try:
            self.events.add("SESSION_MANAGER", event_type, description, severity, meta=meta)
        except Exception:
            pass

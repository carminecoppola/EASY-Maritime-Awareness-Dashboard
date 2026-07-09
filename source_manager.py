from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

from device_manager import DeviceManager, DeviceStatus


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class SourceStatus:
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    NOT_AVAILABLE = "NOT_AVAILABLE"
    STREAMING = "STREAMING"
    ERROR = "ERROR"
    INITIALIZING = "INITIALIZING"
    UNKNOWN = "UNKNOWN"


VALID_STATUSES = {
    SourceStatus.ONLINE,
    SourceStatus.OFFLINE,
    SourceStatus.NOT_AVAILABLE,
    SourceStatus.STREAMING,
    SourceStatus.ERROR,
    SourceStatus.INITIALIZING,
    SourceStatus.UNKNOWN,
}


@dataclass
class SourceRecord:
    id: str
    name: str
    type: str
    status: str = SourceStatus.UNKNOWN
    enabled: bool = True
    last_update: str = ""
    configuration: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self, *, selected: bool = False) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "status": self.status,
            "enabled": self.enabled,
            "last_update": self.last_update,
            "configuration": dict(self.configuration),
            "selected": selected,
        }


class SourceManager:
    def __init__(
        self,
        *,
        runtime_root: Path | str,
        replay_root: Path | str,
        device_manager: DeviceManager | None = None,
        events: Any | None = None,
        logger: Any | None = None,
    ) -> None:
        self.runtime_root = Path(runtime_root)
        self.replay_root = Path(replay_root)
        self.device_manager = device_manager
        self.events = events
        self.logger = logger
        self._lock = threading.RLock()
        self._sources: Dict[str, SourceRecord] = {}
        self._selected_source_id = "replay"
        self._selected_last_update = utc_now_iso()
        self._register_defaults()
        self.refresh_status()
        self.select_source(self._selected_source_id, emit_event=False)

    def _log(self, level: str, message: str) -> None:
        if not self.logger:
            return
        log_fn = getattr(self.logger, level, None)
        if callable(log_fn):
            log_fn(message)

    def _emit(self, source: str, event_type: str, description: str, severity: str = "info", meta: Optional[Dict[str, Any]] = None) -> None:
        if not self.events:
            return
        try:
            self.events.add(source, event_type, description, severity, meta=meta)
        except Exception:
            pass

    def _register_defaults(self) -> None:
        self.register_source(
            "replay",
            "Replay Folder",
            "replay_folder",
            enabled=True,
            configuration={
                "runtime_root": str(self.runtime_root),
                "replay_dir": str(self.replay_root),
                "role": "primary_replay",
                "supports_live": False,
            },
        )
        self.register_source(
            "rgb_left",
            "RGB LEFT",
            "camera_placeholder",
            enabled=True,
            configuration={
                "transport": "libcamera",
                "provider": "RGB",
                "side": "left",
                "supports_live": True,
            },
        )
        self.register_source(
            "rgb_right",
            "RGB RIGHT",
            "camera_placeholder",
            enabled=True,
            configuration={
                "transport": "libcamera",
                "provider": "RGB",
                "side": "right",
                "supports_live": True,
            },
        )
        self.register_source(
            "thermal",
            "THERMAL",
            "thermal_placeholder",
            enabled=True,
            configuration={
                "transport": "flir",
                "provider": "THERMAL",
                "supports_live": True,
            },
        )

    def register_source(
        self,
        source_id: str,
        name: str,
        source_type: str,
        *,
        enabled: bool = True,
        configuration: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            record = SourceRecord(
                id=source_id,
                name=name,
                type=source_type,
                status=SourceStatus.UNKNOWN,
                enabled=enabled,
                last_update=utc_now_iso(),
                configuration=dict(configuration or {}),
            )
            self._sources[source_id] = record
            return self._source_payload(record)

    def _is_replay_source(self, record: SourceRecord) -> bool:
        return record.type == "replay_folder" or "replay_dir" in record.configuration

    def _device_status_to_source_status(self, status: str | None) -> str:
        value = str(status or DeviceStatus.UNKNOWN).upper()
        mapping = {
            DeviceStatus.CONNECTED: SourceStatus.ONLINE,
            DeviceStatus.STREAMING: SourceStatus.STREAMING,
            DeviceStatus.DISCONNECTED: SourceStatus.OFFLINE,
            DeviceStatus.INITIALIZING: SourceStatus.INITIALIZING,
            DeviceStatus.ERROR: SourceStatus.ERROR,
            DeviceStatus.NOT_PRESENT: SourceStatus.NOT_AVAILABLE,
            DeviceStatus.UNKNOWN: SourceStatus.UNKNOWN,
        }
        return mapping.get(value, SourceStatus.UNKNOWN)

    def _has_replay_frames(self, replay_dir: Path) -> bool:
        if not replay_dir.exists():
            return False
        for path in replay_dir.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
                return True
        return False

    def _compute_status(self, record: SourceRecord) -> str:
        if not record.enabled:
            return SourceStatus.NOT_AVAILABLE
        if record.type == "replay_folder":
            replay_dir = Path(str(record.configuration.get("replay_dir") or self.replay_root))
            replay_ready = replay_dir.exists() and self._has_replay_frames(replay_dir)
            if self.device_manager is not None:
                device = self.device_manager.get_device_status("replay")
                if device:
                    device_status = self._device_status_to_source_status(device.get("status"))
                    if device_status == SourceStatus.STREAMING and replay_ready:
                        return SourceStatus.STREAMING if record.id == self._selected_source_id else SourceStatus.ONLINE
                    if device_status in {SourceStatus.ONLINE, SourceStatus.STREAMING} and replay_ready:
                        return SourceStatus.STREAMING if record.id == self._selected_source_id else SourceStatus.ONLINE
                    if not replay_ready:
                        return SourceStatus.NOT_AVAILABLE if not replay_dir.exists() else SourceStatus.OFFLINE
                    if device_status in {SourceStatus.ERROR, SourceStatus.OFFLINE, SourceStatus.NOT_AVAILABLE}:
                        return device_status
            if not replay_dir.exists():
                return SourceStatus.NOT_AVAILABLE
            if self._has_replay_frames(replay_dir):
                return SourceStatus.STREAMING if record.id == self._selected_source_id else SourceStatus.ONLINE
            return SourceStatus.OFFLINE
        if record.type.endswith("_placeholder"):
            if self.device_manager is not None:
                device = self.device_manager.get_device_status(record.id)
                if device:
                    return self._device_status_to_source_status(device.get("status"))
            return SourceStatus.NOT_AVAILABLE
        if self.device_manager is not None:
            device = self.device_manager.get_device_status(record.id)
            if device:
                return self._device_status_to_source_status(device.get("status"))
        return SourceStatus.UNKNOWN

    def _touch(self, record: SourceRecord, status: Optional[str] = None) -> SourceRecord:
        record.status = status if status in VALID_STATUSES else self._compute_status(record)
        record.last_update = utc_now_iso()
        return record

    def _source_payload(self, record: SourceRecord) -> Dict[str, Any]:
        return record.to_dict(selected=record.id == self._selected_source_id)

    def list_sources(self) -> list[Dict[str, Any]]:
        with self._lock:
            return [self._source_payload(record) for record in self._sources.values()]

    def get_source(self, source_id: str | None) -> Optional[Dict[str, Any]]:
        if not source_id:
            return None
        with self._lock:
            record = self._sources.get(source_id)
            if not record:
                return None
            return self._source_payload(record)

    def _selected_record(self) -> Optional[SourceRecord]:
        return self._sources.get(self._selected_source_id)

    def get_selected_source(self) -> Dict[str, Any]:
        with self._lock:
            record = self._selected_record()
            if not record and self._sources:
                record = next(iter(self._sources.values()))
            if not record:
                return {
                    "id": None,
                    "name": "Unknown",
                    "type": "unknown",
                    "status": SourceStatus.UNKNOWN,
                    "enabled": False,
                    "last_update": utc_now_iso(),
                    "configuration": {},
                    "selected": True,
                }
            return self._source_payload(record)

    def resolve_frame_source(self) -> Dict[str, Any]:
        selected = self.get_selected_source()
        source_id = str(selected.get("id") or "")
        record = self._sources.get(source_id)
        frame_path = None
        if record and record.type == "replay_folder":
            candidate = Path(str(record.configuration.get("replay_dir") or self.replay_root))
            if candidate.exists():
                frame_path = str(candidate)
        return {
            "selected_source": selected,
            "frame_source": frame_path,
            "selected_source_id": source_id,
            "status": selected.get("status", SourceStatus.UNKNOWN),
            "last_update": selected.get("last_update", utc_now_iso()),
        }

    def check_health(self, source_id: str) -> Dict[str, Any]:
        with self._lock:
            record = self._sources.get(source_id)
            if not record:
                return {
                    "ok": False,
                    "error": f"Source not found: {source_id}",
                    "source": None,
                }
            status = self._compute_status(record)
            self._touch(record, status)
            return {
                "ok": True,
                "source": self._source_payload(record),
            }

    def refresh_status(self, source_id: str | None = None) -> Dict[str, Any]:
        with self._lock:
            if source_id:
                if self.device_manager is not None:
                    try:
                        self.device_manager.refresh(source_id)
                    except Exception:
                        pass
                result = self.check_health(source_id)
                if result.get("ok"):
                    self._emit("SOURCE_MANAGER", "SOURCE_REFRESH", f"{source_id} refreshed", "info", meta={"source_id": source_id})
                return result
            if self.device_manager is not None:
                try:
                    self.device_manager.refresh()
                except Exception:
                    pass
            refreshed = []
            for record in self._sources.values():
                refreshed.append(self.check_health(record.id)["source"])
            self._emit("SOURCE_MANAGER", "SOURCE_REFRESH", "Sources refreshed", "info", meta={"count": len(self._sources)})
            return self.get_status()

    def select_source(self, source_id: str, *, emit_event: bool = True) -> Dict[str, Any]:
        with self._lock:
            previous_id = self._selected_source_id
            record = self._sources.get(source_id)
            if not record:
                payload = {
                    "ok": False,
                    "error": f"Source not found: {source_id}",
                    "selected_source": self.get_selected_source(),
                    "sources": self.list_sources(),
                }
                if emit_event:
                    self._emit("SOURCE_MANAGER", "SOURCE_SELECT_FAILED", payload["error"], "error", meta={"source_id": source_id})
                return payload
            self._selected_source_id = source_id
            self._selected_last_update = utc_now_iso()
            status = self._compute_status(record)
            self._touch(record, status)
            payload = self.get_status()
            if emit_event:
                if previous_id != source_id:
                    self._emit(
                        "SOURCE_MANAGER",
                        "SOURCE_CHANGED",
                        f"Source changed to {record.name}",
                        "info",
                        meta={"previous_source_id": previous_id, "source_id": record.id, "status": status},
                    )
                if status == SourceStatus.NOT_AVAILABLE:
                    severity = "warning"
                    description = f"{record.name} unavailable"
                elif status == SourceStatus.STREAMING:
                    severity = "info"
                    description = f"{record.name} selected"
                else:
                    severity = "info"
                    description = f"{record.name} selected"
                self._emit("SOURCE_MANAGER", "SOURCE_SELECT", description, severity, meta={"source_id": record.id, "status": status})
                self._log("info", f"{record.name} selected")
                if status == SourceStatus.NOT_AVAILABLE:
                    self._log("warning", f"{record.name} unavailable")
            return payload

    def get_status(self, source_id: str | None = None) -> Dict[str, Any]:
        with self._lock:
            if source_id:
                source = self.get_source(source_id)
                if not source:
                    return {"ok": False, "error": f"Source not found: {source_id}"}
                return {
                    "ok": True,
                    "count": len(self._sources),
                    "selected_source_id": self._selected_source_id,
                    "selected_source": self.get_selected_source(),
                    "source": source,
                    "sources": self.list_sources(),
                    "updated_at": utc_now_iso(),
                }
            return {
                "ok": True,
                "count": len(self._sources),
                "selected_source_id": self._selected_source_id,
                "selected_source": self.get_selected_source(),
                "sources": self.list_sources(),
                "updated_at": utc_now_iso(),
            }

    def get_selected_replay_dir(self) -> Optional[Path]:
        with self._lock:
            record = self._selected_record()
            if not record or record.type != "replay_folder":
                return None
            candidate = Path(str(record.configuration.get("replay_dir") or self.replay_root))
            if candidate.exists():
                return candidate
            return None

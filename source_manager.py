# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Registry of the frame sources the operator can select in the dashboard.

A *source* is where frames come from (the recorded dataset, RGB left, RGB right,
thermal). Each source mirrors a *device* from ``device_manager.py``: the device
reports the hardware state, this module translates it into a UI-friendly
source status and tracks which source is currently selected.

Device status -> source status:
    CONNECTED -> ONLINE        STREAMING -> STREAMING      DISCONNECTED -> OFFLINE
    INITIALIZING -> INITIALIZING   ERROR -> ERROR   NOT_PRESENT -> NOT_AVAILABLE
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from device_manager import DeviceManager, DeviceStatus
from runtime_catalog import build_runtime_endpoint_catalog
from runtime_support import directory_has_frames, normalize_status, utc_now_iso


class SourceStatus:
    """Allowed values for a source status."""
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    NOT_AVAILABLE = "NOT_AVAILABLE"
    STREAMING = "STREAMING"
    ERROR = "ERROR"
    INITIALIZING = "INITIALIZING"
    UNKNOWN = "UNKNOWN"


# Recursive directory walk; a running replay folder's frame set doesn't
# change fast enough to justify redoing it on every dashboard poll (every
# 1-2s), so cache the result for a short window instead.
REPLAY_FRAMES_CACHE_SECONDS = 2.0


VALID_SOURCE_STATUSES = {
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
    """State of one registered source, convertible to the API representation."""
    id: str
    name: str
    type: str
    status: str = SourceStatus.UNKNOWN
    enabled: bool = True
    last_update: str = ""
    configuration: dict[str, Any] = field(default_factory=dict)
    capabilities: dict[str, Any] = field(default_factory=dict)

    def to_dict(self, *, selected: bool = False) -> dict[str, Any]:
        """Serialise the source, deriving the ``available``/``selectable``/``streaming`` flags from its status."""
        available = self.enabled and self.status in {SourceStatus.ONLINE, SourceStatus.STREAMING}
        selectable = self.enabled and self.status not in {
            SourceStatus.NOT_AVAILABLE,
            SourceStatus.OFFLINE,
            SourceStatus.ERROR,
        }
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "status": self.status,
            "enabled": self.enabled,
            "last_update": self.last_update,
            "configuration": dict(self.configuration),
            "runtime_state": dict(self.configuration.get("runtime_state") or {}),
            "capabilities": dict(self.capabilities),
            "availability": {
                "available": available,
                "selectable": selectable,
                "streaming": self.status == SourceStatus.STREAMING,
            },
            "selected": selected,
        }


class SourceManager:
    """Tracks source selection and maps device status into UI-friendly source state."""

    def __init__(
        self,
        *,
        runtime_root: Path | str,
        replay_root: Path | str,
        device_manager: DeviceManager | None = None,
        events: Any | None = None,
        logger: Any | None = None,
        auto_refresh: bool = True,
    ) -> None:
        """Register the default sources, optionally refresh their status and select the replay source."""
        self.runtime_root = Path(runtime_root)
        self.replay_root = Path(replay_root)
        self.device_manager = device_manager
        self.events = events
        self.logger = logger
        self._lock = threading.RLock()
        self._sources: dict[str, SourceRecord] = {}
        self._replay_frames_cache: tuple[float, bool] | None = None
        self._selected_source_id = "replay"
        self._selected_last_update = utc_now_iso()
        self._register_default_sources()
        if auto_refresh:
            self.refresh_status()
        self.select_source(self._selected_source_id, emit_event=False)

    def _log(self, level: str, message: str) -> None:
        """Log through the optional logger."""
        if not self.logger:
            return
        log_fn = getattr(self.logger, level, None)
        if callable(log_fn):
            log_fn(message)

    def _emit(
        self,
        source: str,
        event_type: str,
        description: str,
        severity: str = "info",
        meta: dict[str, Any] | None = None,
    ) -> None:
        """Add an event to the event log; logging failures are ignored."""
        if not self.events:
            return
        try:
            self.events.add(source, event_type, description, severity, meta=meta)
        except Exception:
            pass

    def _register_default_sources(self) -> None:
        """Register one source per endpoint of the runtime catalog."""
        for endpoint in build_runtime_endpoint_catalog(self.runtime_root, self.replay_root):
            self.register_source(
                endpoint.endpoint_id,
                endpoint.display_name,
                endpoint.source_type,
                enabled=endpoint.source_enabled,
                configuration=endpoint.source_configuration,
                capabilities=endpoint.source_capabilities,
            )

    def register_source(
        self,
        source_id: str,
        name: str,
        source_type: str,
        *,
        enabled: bool = True,
        configuration: dict[str, Any] | None = None,
        capabilities: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Add (or replace) a source and return its serialised form."""
        with self._lock:
            record = SourceRecord(
                id=source_id,
                name=name,
                type=source_type,
                status=SourceStatus.UNKNOWN,
                enabled=enabled,
                last_update=utc_now_iso(),
                configuration=dict(configuration or {}),
                capabilities=dict(capabilities or {}),
            )
            self._sources[source_id] = record
            return self._serialize_source(record)

    def _serialize_source(self, record: SourceRecord) -> dict[str, Any]:
        """Serialise a record, flagging whether it is the selected one."""
        return record.to_dict(selected=record.id == self._selected_source_id)

    def _map_device_status_to_source_status(self, status: str | None) -> str:
        """Translate a device status into the matching source status."""
        value = normalize_status(status, DeviceStatus.UNKNOWN)
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

    def _get_selected_record(self) -> SourceRecord | None:
        """Return the record of the selected source, if any."""
        return self._sources.get(self._selected_source_id)

    def _update_source_record(self, record: SourceRecord, status: str | None = None) -> SourceRecord:
        """Set the record status (resolving it when not valid) and stamp ``last_update``."""
        record.status = status if status in VALID_SOURCE_STATUSES else self._resolve_source_status(record)
        record.last_update = utc_now_iso()
        return record

    def _replay_has_frames(self, replay_dir: Path) -> bool:
        """Check whether the replay folder holds images, caching the answer for a short time."""
        now = time.monotonic()
        if self._replay_frames_cache is not None:
            cached_at, cached_value = self._replay_frames_cache
            if now - cached_at < REPLAY_FRAMES_CACHE_SECONDS:
                return cached_value
        value = directory_has_frames(replay_dir)
        self._replay_frames_cache = (now, value)
        return value

    def _resolve_source_status(self, record: SourceRecord) -> str:
        """Compute the current status of a source.

        Replay sources depend on the folder content and the replay device. Live
        sources follow their device and also copy its ``runtime_state``.
        """
        if not record.enabled:
            return SourceStatus.NOT_AVAILABLE

        if record.type == "replay_folder":
            replay_dir = Path(str(record.configuration.get("replay_dir") or self.replay_root))
            replay_ready = replay_dir.exists() and self._replay_has_frames(replay_dir)
            replay_device = self.device_manager.get_device_status("replay") if self.device_manager else None
            device_status = self._map_device_status_to_source_status(replay_device.get("status")) if replay_device else SourceStatus.UNKNOWN

            if not replay_dir.exists():
                return SourceStatus.NOT_AVAILABLE
            if not replay_ready:
                return SourceStatus.OFFLINE
            if device_status in {SourceStatus.ERROR, SourceStatus.OFFLINE, SourceStatus.NOT_AVAILABLE}:
                return device_status
            return SourceStatus.STREAMING if record.id == self._selected_source_id else SourceStatus.ONLINE

        device = self.device_manager.get_device_status(record.id) if self.device_manager else None
        if device:
            runtime_state = device.get("runtime_state")
            if isinstance(runtime_state, dict):
                record.configuration["runtime_state"] = dict(runtime_state)
            return self._map_device_status_to_source_status(device.get("status"))

        if record.type.endswith("_placeholder"):
            return SourceStatus.NOT_AVAILABLE

        return SourceStatus.UNKNOWN

    def list_sources(self) -> list[dict[str, Any]]:
        """Refresh and return every source."""
        with self._lock:
            for record in self._sources.values():
                self._update_source_record(record, self._resolve_source_status(record))
            return [self._serialize_source(record) for record in self._sources.values()]

    def get_source(self, source_id: str | None) -> dict[str, Any] | None:
        """Refresh and return one source, or None when unknown."""
        if not source_id:
            return None
        with self._lock:
            record = self._sources.get(source_id)
            if not record:
                return None
            self._update_source_record(record, self._resolve_source_status(record))
            return self._serialize_source(record)

    def get_selected_source(self) -> dict[str, Any]:
        """Return the selected source (or an ``Unknown`` placeholder when none is registered)."""
        with self._lock:
            record = self._get_selected_record()
            if not record and self._sources:
                record = next(iter(self._sources.values()))
            if record:
                self._update_source_record(record, self._resolve_source_status(record))
            if not record:
                return {
                    "id": None,
                    "name": "Unknown",
                    "type": "unknown",
                    "status": SourceStatus.UNKNOWN,
                    "enabled": False,
                    "last_update": utc_now_iso(),
                    "configuration": {},
                    "capabilities": {},
                    "availability": {"available": False, "selectable": False, "streaming": False},
                    "selected": True,
                }
            return self._serialize_source(record)

    def check_health(self, source_id: str) -> dict[str, Any]:
        """Re-evaluate one source and return it."""
        with self._lock:
            record = self._sources.get(source_id)
            if not record:
                return {"ok": False, "error": f"Source not found: {source_id}", "source": None}

            status = self._resolve_source_status(record)
            self._update_source_record(record, status)
            return {"ok": True, "source": self._serialize_source(record)}

    def refresh_status(self, source_id: str | None = None) -> dict[str, Any]:
        """Ask the device manager to refresh, then re-evaluate one source or all of them."""
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

            for record in self._sources.values():
                self.check_health(record.id)
            self._emit("SOURCE_MANAGER", "SOURCE_REFRESH", "Sources refreshed", "info", meta={"count": len(self._sources)})
            return self.get_status()

    def select_source(self, source_id: str, *, emit_event: bool = True) -> dict[str, Any]:
        """Select the active source and emit the corresponding events.

        Returns the overall status, or ``ok: False`` with an error for an unknown id.
        """
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
            status = self._resolve_source_status(record)
            self._update_source_record(record, status)
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
                description = f"{record.name} selected" if status != SourceStatus.NOT_AVAILABLE else f"{record.name} unavailable"
                severity = "warning" if status == SourceStatus.NOT_AVAILABLE else "info"
                self._emit("SOURCE_MANAGER", "SOURCE_SELECT", description, severity, meta={"source_id": record.id, "status": status})
                self._log("info", f"{record.name} selected")
                if status == SourceStatus.NOT_AVAILABLE:
                    self._log("warning", f"{record.name} unavailable")

            return payload

    def get_status(self, source_id: str | None = None) -> dict[str, Any]:
        """Return the overall source status, optionally including one specific source."""
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

    def get_selected_replay_dir(self) -> Path | None:
        """Replay folder of the selected source, or None when it is not a replay source or the folder is missing."""
        with self._lock:
            record = self._get_selected_record()
            if not record or record.type != "replay_folder":
                return None
            candidate = Path(str(record.configuration.get("replay_dir") or self.replay_root))
            return candidate if candidate.exists() else None

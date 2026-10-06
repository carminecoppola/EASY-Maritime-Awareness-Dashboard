# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Registry of the physical and simulated devices behind the EASY endpoints.

Every endpoint of the runtime catalog becomes a *managed device*:

    ReplayDevice        the recorded dataset folder (always present)
    LiveHardwareDevice  a camera or thermal sensor whose state is read from the
                        runtime object that actually owns the hardware
    PlaceholderDevice   an endpoint with no hardware attached (NOT_PRESENT)

State changes are turned into events (``CAMERA_LOST``, ``THERMAL_CONNECTED``, ...)
so the operator sees them in the activity log.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from easy_dashboard.runtime_catalog import build_runtime_endpoint_catalog
from easy_dashboard.runtime_support import directory_has_frames, health_from_status, utc_now_iso


class DeviceStatus:
    """Allowed values for a device status."""
    CONNECTED = "CONNECTED"
    DISCONNECTED = "DISCONNECTED"
    INITIALIZING = "INITIALIZING"
    STREAMING = "STREAMING"
    ERROR = "ERROR"
    NOT_PRESENT = "NOT_PRESENT"
    UNKNOWN = "UNKNOWN"


VALID_DEVICE_STATUSES = {
    DeviceStatus.CONNECTED,
    DeviceStatus.DISCONNECTED,
    DeviceStatus.INITIALIZING,
    DeviceStatus.STREAMING,
    DeviceStatus.ERROR,
    DeviceStatus.NOT_PRESENT,
    DeviceStatus.UNKNOWN,
}


def status_to_health(status: str) -> str:
    """Backward-compatible alias of ``runtime_support.health_from_status``."""
    return health_from_status(status)


@dataclass
class DeviceRecord:
    """Serialisable state of one device (status, health, fps, temperature, configuration)."""
    device_id: str
    device_type: str
    device_name: str
    serial_number: str = ""
    driver: str = "unknown"
    status: str = DeviceStatus.UNKNOWN
    health: str = "UNKNOWN"
    fps: float = 0.0
    temperature: float | None = None
    last_seen: str = ""
    configuration: dict[str, Any] = field(default_factory=dict)
    runtime_state: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Return the record as a plain dictionary for the API."""
        return {
            "device_id": self.device_id,
            "device_type": self.device_type,
            "device_name": self.device_name,
            "serial_number": self.serial_number,
            "driver": self.driver,
            "status": self.status,
            "health": self.health,
            "fps": self.fps,
            "temperature": self.temperature,
            "last_seen": self.last_seen,
            "configuration": dict(self.configuration),
            "runtime_state": dict(self.runtime_state),
        }


class ManagedDevice:
    """Base wrapper around a device record plus event and log side effects."""

    def __init__(self, record: DeviceRecord, *, events: Any | None = None, logger: Any | None = None) -> None:
        """Keep the record and the optional event log and logger."""
        self.record = record
        self.events = events
        self.logger = logger
        self._lock = threading.RLock()

    def _log(self, level: str, message: str) -> None:
        """Log through the optional logger."""
        if not self.logger:
            return
        log_fn = getattr(self.logger, level, None)
        if callable(log_fn):
            log_fn(message)

    def _emit(self, event_type: str, description: str, severity: str = "info") -> None:
        """Add a ``DEVICE_MANAGER`` event describing the device; failures are ignored."""
        if not self.events:
            return
        try:
            self.events.add(
                "DEVICE_MANAGER",
                event_type,
                description,
                severity,
                meta={
                    "device_id": self.record.device_id,
                    "device_type": self.record.device_type,
                    "status": self.record.status,
                },
            )
        except Exception:
            pass

    def _emit_state_change(self, previous_status: str, new_status: str) -> None:
        """Emit a human-readable event when the status changes.

        The event type depends on the device kind: replay, thermal or camera.
        """
        name = self.record.device_name
        device_type = str(self.record.device_type).lower()
        severity = "info"
        event_type = "DEVICE_STATE_CHANGED"
        description = f"{name} status changed to {new_status}"

        if self.record.device_id == "replay":
            if new_status in {DeviceStatus.CONNECTED, DeviceStatus.STREAMING}:
                event_type = "REPLAY_ACTIVE"
                description = "Replay Active"
            elif new_status in {DeviceStatus.DISCONNECTED, DeviceStatus.NOT_PRESENT, DeviceStatus.ERROR}:
                event_type = "REPLAY_IDLE"
                description = "Recorded dataset unavailable"
                severity = "warning"
        elif "thermal" in device_type:
            if new_status in {DeviceStatus.CONNECTED, DeviceStatus.STREAMING}:
                event_type = "THERMAL_CONNECTED"
                description = "Thermal Connected"
            elif new_status in {DeviceStatus.DISCONNECTED, DeviceStatus.NOT_PRESENT, DeviceStatus.ERROR}:
                event_type = "THERMAL_OFFLINE"
                description = "Thermal Offline"
                severity = "warning"
        else:
            if new_status in {DeviceStatus.CONNECTED, DeviceStatus.STREAMING}:
                event_type = "CAMERA_CONNECTED"
                description = "Camera Connected"
            elif new_status in {DeviceStatus.DISCONNECTED, DeviceStatus.NOT_PRESENT, DeviceStatus.ERROR}:
                event_type = "CAMERA_LOST"
                description = "Camera Lost"
                severity = "warning"

        self._emit(event_type, description, severity)
        self._log("info", f"{name}: {previous_status} -> {new_status}")

    def _apply_transition(
        self,
        *,
        status: str | None = None,
        fps: float | None = None,
        temperature: float | None = None,
        emit_event: bool = True,
    ) -> dict[str, Any]:
        """Apply a new status/fps/temperature, derive the health and emit an event if the status changed."""
        previous_status = self.record.status
        resolved_status = status if status in VALID_DEVICE_STATUSES else previous_status
        self.record.status = resolved_status
        self.record.health = status_to_health(resolved_status)
        if fps is not None:
            self.record.fps = max(0.0, float(fps))
        if temperature is not None:
            self.record.temperature = float(temperature)
        self.record.last_seen = utc_now_iso()
        if emit_event and previous_status != resolved_status:
            self._emit_state_change(previous_status, resolved_status)
        return self.serialize()

    def connect(self) -> dict[str, Any]:
        """Mark the device as CONNECTED."""
        with self._lock:
            return self._apply_transition(status=DeviceStatus.CONNECTED)

    def check_health(self) -> dict[str, Any]:
        """Return the current state; subclasses probe the hardware first."""
        with self._lock:
            return self.serialize()

    def refresh(self) -> dict[str, Any]:
        """Re-check the device and return its state."""
        with self._lock:
            return self.check_health()

    def serialize(self) -> dict[str, Any]:
        """Return the record as a dictionary."""
        return self.record.to_dict()


class ReplayDevice(ManagedDevice):
    """The recorded dataset: STREAMING when the replay folder contains images, otherwise CONNECTED."""
    def __init__(self, record: DeviceRecord, replay_root: Path, *, events: Any | None = None, logger: Any | None = None) -> None:
        """Remember the replay folder."""
        super().__init__(record, events=events, logger=logger)
        self.replay_root = Path(replay_root)

    def connect(self) -> dict[str, Any]:
        """Mark the replay device as connected, using the configured fps."""
        with self._lock:
            return self._apply_transition(status=DeviceStatus.CONNECTED, fps=self.record.configuration.get("fps", self.record.fps))

    def check_health(self) -> dict[str, Any]:
        """Probe the replay folder for images and update the status accordingly."""
        with self._lock:
            has_frames = directory_has_frames(self.replay_root)
            status = DeviceStatus.STREAMING if has_frames else DeviceStatus.CONNECTED
            fps = self.record.configuration.get("fps")
            if fps is None:
                fps = 0.0 if not has_frames else self.record.fps or 0.0
            return self._apply_transition(
                status=status,
                fps=fps,
                temperature=self.record.temperature,
                emit_event=True,
            )


class PlaceholderDevice(ManagedDevice):
    """Endpoint without hardware: it always reports NOT_PRESENT."""
    def connect(self) -> dict[str, Any]:
        """Stay NOT_PRESENT: there is nothing to connect to."""
        with self._lock:
            return self._apply_transition(status=DeviceStatus.NOT_PRESENT, emit_event=True)

    def check_health(self) -> dict[str, Any]:
        """Report NOT_PRESENT with zero fps and no temperature."""
        with self._lock:
            return self._apply_transition(status=DeviceStatus.NOT_PRESENT, fps=0.0, temperature=None, emit_event=True)


class LiveHardwareDevice(ManagedDevice):
    """Device whose status is derived from an existing runtime sensor object."""

    def __init__(
        self,
        record: DeviceRecord,
        status_provider: Any,
        *,
        events: Any | None = None,
        logger: Any | None = None,
    ) -> None:
        """``status_provider`` is a callable returning the sensor status payload."""
        super().__init__(record, events=events, logger=logger)
        self.status_provider = status_provider

    def check_health(self) -> dict[str, Any]:
        """Call the status provider and fold its payload into the device record.

        An exception from the provider marks the device as ERROR instead of propagating.
        """
        with self._lock:
            try:
                payload = self.status_provider() if callable(self.status_provider) else {}
            except Exception as exc:
                self.record.configuration["last_error"] = str(exc)
                return self._apply_transition(status=DeviceStatus.ERROR, fps=0.0, emit_event=True)
            if not isinstance(payload, dict):
                payload = {}
            configuration = payload.get("configuration")
            if isinstance(configuration, dict):
                self.record.configuration.update(configuration)
            runtime_state = payload.get("runtime_state")
            if isinstance(runtime_state, dict):
                self.record.runtime_state = dict(runtime_state)
            error = payload.get("error")
            if error:
                self.record.configuration["last_error"] = str(error)
            elif "last_error" in self.record.configuration:
                self.record.configuration.pop("last_error", None)
            return self._apply_transition(
                status=str(payload.get("status") or DeviceStatus.UNKNOWN).upper(),
                fps=float(payload.get("fps") or 0.0),
                temperature=payload.get("temperature"),
                emit_event=True,
            )


class DeviceManager:
    """Owns the runtime device registry exposed to the health and diagnostics APIs."""

    def __init__(
        self,
        *,
        runtime_root: Path | str,
        replay_root: Path | str,
        status_providers: dict[str, Any] | None = None,
        events: Any | None = None,
        logger: Any | None = None,
        auto_refresh: bool = True,
    ) -> None:
        """Create the runtime/replay folders, register the default devices and optionally refresh them."""
        self.runtime_root = Path(runtime_root)
        self.replay_root = Path(replay_root)
        self.events = events
        self.logger = logger
        self.status_providers = dict(status_providers or {})
        self._lock = threading.RLock()
        self._devices: dict[str, ManagedDevice] = {}
        self.runtime_root.mkdir(parents=True, exist_ok=True)
        self.replay_root.mkdir(parents=True, exist_ok=True)
        self._register_default_devices()
        if auto_refresh:
            self.refresh()

    def _log(self, level: str, message: str) -> None:
        """Log through the optional logger."""
        if not self.logger:
            return
        log_fn = getattr(self.logger, level, None)
        if callable(log_fn):
            log_fn(message)

    def _store_device(self, device: ManagedDevice) -> ManagedDevice:
        """Add a device to the registry, keyed by its id."""
        self._devices[device.record.device_id] = device
        return device

    def _register_default_devices(self) -> None:
        """Create one device per catalog endpoint, picking the class that matches the available hardware."""
        for endpoint in build_runtime_endpoint_catalog(self.runtime_root, self.replay_root):
            record = DeviceRecord(
                device_id=endpoint.endpoint_id,
                device_type=endpoint.device_type,
                device_name=endpoint.display_name,
                serial_number=endpoint.serial_number,
                driver=endpoint.driver,
                status=endpoint.device_status,
                health=endpoint.device_health,
                fps=float(endpoint.device_configuration.get("fps", 0.0)),
                last_seen=utc_now_iso(),
                configuration=dict(endpoint.device_configuration),
            )
            if endpoint.endpoint_id == "replay":
                self._store_device(
                    ReplayDevice(
                        record,
                        self.replay_root,
                        events=self.events,
                        logger=self.logger,
                    )
                )
            elif endpoint.endpoint_id in self.status_providers:
                self._store_device(
                    LiveHardwareDevice(
                        record,
                        self.status_providers[endpoint.endpoint_id],
                        events=self.events,
                        logger=self.logger,
                    )
                )
            else:
                self._store_device(PlaceholderDevice(record, events=self.events, logger=self.logger))

    def _serialize_device(self, device: ManagedDevice) -> dict[str, Any]:
        """Return a device as a dictionary."""
        return device.serialize()

    def _refresh_managed_device(self, device: ManagedDevice) -> dict[str, Any]:
        """Refresh one device; an unexpected failure marks it ERROR/OFFLINE."""
        try:
            return device.refresh()
        except Exception as exc:  # pragma: no cover - defensive
            device.record.status = DeviceStatus.ERROR
            device.record.health = "OFFLINE"
            device.record.last_seen = utc_now_iso()
            self._log("warning", f"Device refresh failed for {device.record.device_id}: {exc}")
            return device.serialize()

    def list_devices(self) -> list[dict[str, Any]]:
        """Return every device as a dictionary."""
        with self._lock:
            return [self._serialize_device(device) for device in self._devices.values()]

    def get_device(self, device_id: str | None) -> dict[str, Any] | None:
        """Return one device, or None when the id is unknown."""
        if not device_id:
            return None
        with self._lock:
            device = self._devices.get(device_id)
            return self._serialize_device(device) if device else None

    def get_device_status(self, device_id: str | None) -> dict[str, Any] | None:
        """Alias of ``get_device``."""
        return self.get_device(device_id)

    def refresh(self, device_id: str | None = None) -> dict[str, Any]:
        """Refresh one device or all of them and return the result."""
        with self._lock:
            if device_id:
                device = self._devices.get(device_id)
                if not device:
                    return {"ok": False, "error": f"Device not found: {device_id}"}
                return {"ok": True, "device": self._refresh_managed_device(device)}

            devices = [self._refresh_managed_device(device) for device in self._devices.values()]
            connected_count = sum(1 for item in devices if str(item.get("status")) in {DeviceStatus.CONNECTED, DeviceStatus.STREAMING})
            return {
                "ok": True,
                "count": len(devices),
                "connected_count": connected_count,
                "devices": devices,
                "updated_at": utc_now_iso(),
            }

    def get_status(self, device_id: str | None = None) -> dict[str, Any]:
        """Return the registry summary (counts and devices), or the status of one device."""
        with self._lock:
            if device_id:
                device = self.get_device(device_id)
                if not device:
                    return {"ok": False, "error": f"Device not found: {device_id}"}
                return {
                    "ok": True,
                    "count": len(self._devices),
                    "device": device,
                    "updated_at": utc_now_iso(),
                }

            devices = self.list_devices()
            connected_count = sum(1 for item in devices if str(item.get("status")) in {DeviceStatus.CONNECTED, DeviceStatus.STREAMING})
            return {
                "ok": True,
                "count": len(devices),
                "connected_count": connected_count,
                "devices": devices,
                "updated_at": utc_now_iso(),
            }

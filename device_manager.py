from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class DeviceStatus:
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
    value = str(status or DeviceStatus.UNKNOWN).upper()
    if value in {DeviceStatus.CONNECTED, DeviceStatus.STREAMING}:
        return "GOOD"
    if value == DeviceStatus.INITIALIZING:
        return "DEGRADED"
    if value in {DeviceStatus.DISCONNECTED, DeviceStatus.NOT_PRESENT, DeviceStatus.ERROR}:
        return "OFFLINE"
    return "UNKNOWN"


@dataclass
class DeviceRecord:
    device_id: str
    device_type: str
    device_name: str
    serial_number: str = ""
    driver: str = "unknown"
    status: str = DeviceStatus.UNKNOWN
    health: str = "UNKNOWN"
    fps: float = 0.0
    temperature: Optional[float] = None
    last_seen: str = ""
    configuration: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
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
        }


class ManagedDevice:
    def __init__(self, record: DeviceRecord, *, events: Any | None = None, logger: Any | None = None) -> None:
        self.record = record
        self.events = events
        self.logger = logger
        self._lock = threading.RLock()

    def _log(self, level: str, message: str) -> None:
        if not self.logger:
            return
        log_fn = getattr(self.logger, level, None)
        if callable(log_fn):
            log_fn(message)

    def _emit(self, event_type: str, description: str, severity: str = "info") -> None:
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

    def _transition(
        self,
        *,
        status: str | None = None,
        fps: float | None = None,
        temperature: float | None = None,
        emit: bool = True,
    ) -> Dict[str, Any]:
        previous_status = self.record.status
        new_status = status if status in VALID_DEVICE_STATUSES else previous_status
        if new_status:
            self.record.status = new_status
            self.record.health = status_to_health(new_status)
        if fps is not None:
            self.record.fps = max(0.0, float(fps))
        if temperature is not None:
            self.record.temperature = float(temperature)
        self.record.last_seen = utc_now_iso()
        if emit and previous_status != self.record.status:
            self._emit_state_change(previous_status, self.record.status)
        return self.get_status()

    def _emit_state_change(self, previous_status: str, new_status: str) -> None:
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
                description = "Replay Device unavailable"
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

    def connect(self) -> Dict[str, Any]:
        with self._lock:
            return self._transition(status=DeviceStatus.CONNECTED)

    def disconnect(self) -> Dict[str, Any]:
        with self._lock:
            return self._transition(status=DeviceStatus.DISCONNECTED)

    def check_health(self) -> Dict[str, Any]:
        with self._lock:
            return self.get_status()

    def refresh(self) -> Dict[str, Any]:
        with self._lock:
            return self.check_health()

    def get_status(self) -> Dict[str, Any]:
        return self.record.to_dict()


class ReplayDevice(ManagedDevice):
    def __init__(self, record: DeviceRecord, replay_root: Path, *, events: Any | None = None, logger: Any | None = None) -> None:
        super().__init__(record, events=events, logger=logger)
        self.replay_root = Path(replay_root)

    def _has_replay_frames(self) -> bool:
        if not self.replay_root.exists():
            return False
        for path in self.replay_root.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
                return True
        return False

    def connect(self) -> Dict[str, Any]:
        with self._lock:
            return self._transition(status=DeviceStatus.CONNECTED, fps=self.record.configuration.get("fps", self.record.fps))

    def check_health(self) -> Dict[str, Any]:
        with self._lock:
            has_frames = self._has_replay_frames()
            status = DeviceStatus.STREAMING if has_frames else DeviceStatus.CONNECTED
            fps = self.record.configuration.get("fps")
            if fps is None:
                fps = 0.0 if not has_frames else self.record.fps or 0.0
            temperature = self.record.temperature
            return self._transition(status=status, fps=fps, temperature=temperature, emit=True)

    def refresh(self) -> Dict[str, Any]:
        return self.check_health()


class PlaceholderDevice(ManagedDevice):
    def connect(self) -> Dict[str, Any]:
        with self._lock:
            return self._transition(status=DeviceStatus.NOT_PRESENT, emit=True)

    def disconnect(self) -> Dict[str, Any]:
        with self._lock:
            return self._transition(status=DeviceStatus.DISCONNECTED)

    def check_health(self) -> Dict[str, Any]:
        with self._lock:
            return self._transition(status=DeviceStatus.NOT_PRESENT, fps=0.0, temperature=None, emit=True)

    def refresh(self) -> Dict[str, Any]:
        return self.check_health()


class DeviceManager:
    def __init__(
        self,
        *,
        runtime_root: Path | str,
        replay_root: Path | str,
        events: Any | None = None,
        logger: Any | None = None,
    ) -> None:
        self.runtime_root = Path(runtime_root)
        self.replay_root = Path(replay_root)
        self.events = events
        self.logger = logger
        self._lock = threading.RLock()
        self._devices: Dict[str, ManagedDevice] = {}
        self.runtime_root.mkdir(parents=True, exist_ok=True)
        self.replay_root.mkdir(parents=True, exist_ok=True)
        self._register_defaults()
        self.refresh()

    def _log(self, level: str, message: str) -> None:
        if not self.logger:
            return
        log_fn = getattr(self.logger, level, None)
        if callable(log_fn):
            log_fn(message)

    def _register_device(self, device: ManagedDevice) -> ManagedDevice:
        self._devices[device.record.device_id] = device
        return device

    def _register_defaults(self) -> None:
        self._register_device(
            ReplayDevice(
                DeviceRecord(
                    device_id="replay",
                    device_type="replay",
                    device_name="Replay Device",
                    serial_number="replay-local",
                    driver="folder-frame-provider",
                    status=DeviceStatus.CONNECTED,
                    health="GOOD",
                    fps=0.0,
                    last_seen=utc_now_iso(),
                    configuration={
                        "replay_root": str(self.replay_root),
                        "role": "replay",
                        "always_available": True,
                    },
                ),
                self.replay_root,
                events=self.events,
                logger=self.logger,
            )
        )
        self._register_device(
            PlaceholderDevice(
                DeviceRecord(
                    device_id="rgb_left",
                    device_type="rgb",
                    device_name="RGB LEFT",
                    serial_number="rgb-left-placeholder",
                    driver="placeholder",
                    status=DeviceStatus.NOT_PRESENT,
                    health="OFFLINE",
                    fps=0.0,
                    last_seen=utc_now_iso(),
                    configuration={
                        "side": "left",
                        "transport": "libcamera",
                        "present": False,
                    },
                ),
                events=self.events,
                logger=self.logger,
            )
        )
        self._register_device(
            PlaceholderDevice(
                DeviceRecord(
                    device_id="rgb_right",
                    device_type="rgb",
                    device_name="RGB RIGHT",
                    serial_number="rgb-right-placeholder",
                    driver="placeholder",
                    status=DeviceStatus.NOT_PRESENT,
                    health="OFFLINE",
                    fps=0.0,
                    last_seen=utc_now_iso(),
                    configuration={
                        "side": "right",
                        "transport": "libcamera",
                        "present": False,
                    },
                ),
                events=self.events,
                logger=self.logger,
            )
        )
        self._register_device(
            PlaceholderDevice(
                DeviceRecord(
                    device_id="thermal",
                    device_type="thermal",
                    device_name="THERMAL",
                    serial_number="thermal-placeholder",
                    driver="placeholder",
                    status=DeviceStatus.NOT_PRESENT,
                    health="OFFLINE",
                    fps=0.0,
                    last_seen=utc_now_iso(),
                    configuration={
                        "transport": "flir",
                        "present": False,
                    },
                ),
                events=self.events,
                logger=self.logger,
            )
        )

    def _device_payload(self, device: ManagedDevice) -> Dict[str, Any]:
        return device.get_status()

    def list_devices(self) -> list[Dict[str, Any]]:
        with self._lock:
            return [self._device_payload(device) for device in self._devices.values()]

    def get_device(self, device_id: str | None) -> Optional[Dict[str, Any]]:
        if not device_id:
            return None
        with self._lock:
            device = self._devices.get(device_id)
            if not device:
                return None
            return self._device_payload(device)

    def get_device_status(self, device_id: str | None) -> Optional[Dict[str, Any]]:
        return self.get_device(device_id)

    def _refresh_device(self, device: ManagedDevice) -> Dict[str, Any]:
        try:
            return device.refresh()
        except Exception as exc:  # pragma: no cover - defensive
            device.record.status = DeviceStatus.ERROR
            device.record.health = "OFFLINE"
            device.record.last_seen = utc_now_iso()
            self._log("warning", f"Device refresh failed for {device.record.device_id}: {exc}")
            return device.get_status()

    def refresh(self, device_id: str | None = None) -> Dict[str, Any]:
        with self._lock:
            if device_id:
                device = self._devices.get(device_id)
                if not device:
                    return {"ok": False, "error": f"Device not found: {device_id}"}
                return {"ok": True, "device": self._refresh_device(device)}
            devices = [self._refresh_device(device) for device in self._devices.values()]
            return {
                "ok": True,
                "count": len(devices),
                "connected_count": sum(1 for item in devices if str(item.get("status")) in {DeviceStatus.CONNECTED, DeviceStatus.STREAMING}),
                "devices": devices,
                "updated_at": utc_now_iso(),
            }

    def get_status(self, device_id: str | None = None) -> Dict[str, Any]:
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
            return {
                "ok": True,
                "count": len(devices),
                "connected_count": sum(1 for item in devices if str(item.get("status")) in {DeviceStatus.CONNECTED, DeviceStatus.STREAMING}),
                "devices": devices,
                "updated_at": utc_now_iso(),
            }

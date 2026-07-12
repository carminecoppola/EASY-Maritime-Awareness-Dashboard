from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from acquisition_manager import AcquisitionManager
from detection_manager import DetectionManager
from dataset_exporter import DatasetExporter
from device_manager import DeviceManager
from event_manager import EventManager
from frame_provider import UnifiedFrameProvider
from inference_worker import InferenceWorker
from session_manager import SessionManager
from source_manager import SourceManager
from runtime_support import error_from_payload, health_from_status, is_active_status, status_from_payload
from easy_dashboard.runtime_status import build_rgb_device_status, build_thermal_device_status


PROJECT_ROOT = Path(__file__).resolve().parent


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def format_utc_ts(epoch: float | None) -> str | None:
    if epoch is None:
        return None
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def human_uptime(seconds: float | int | None) -> str:
    if seconds is None:
        return "--"
    total = max(0, int(seconds))
    days, rem = divmod(total, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h {minutes}m {secs}s"
    return f"{hours}h {minutes}m {secs}s"


def _safe_call(func: Callable[[], Any] | None, default: Any = None) -> Any:
    if not callable(func):
        return default
    try:
        return func()
    except Exception:
        return default


def _status_from_payload(payload: Any, default: str = "UNKNOWN") -> str:
    return status_from_payload(payload, default)


def _error_from_payload(payload: Any) -> str:
    return error_from_payload(payload)


def _health_from_status(status: str) -> str:
    return health_from_status(status)


def _is_active(status: str) -> bool:
    return is_active_status(status)


@dataclass
class RegisteredComponent:
    component_id: str
    label: str
    kind: str
    instance: Any
    critical: bool = True
    started_at: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    last_status: str = "UNKNOWN"
    last_health: str = "UNKNOWN"
    last_error: str = ""
    status_getter: Callable[[], Any] | None = None
    start_hook: Callable[[], Any] | None = None
    stop_hook: Callable[[], Any] | None = None
    restart_hook: Callable[[], Any] | None = None

    def snapshot(self) -> Dict[str, Any]:
        payload = _safe_call(self.status_getter, default={})
        status = _status_from_payload(payload, self.last_status)
        health = _health_from_status(status)
        error = _error_from_payload(payload)
        if not error and isinstance(payload, dict) and payload.get("ok") is False:
            error = str(payload.get("error") or payload.get("message") or "Component error")
        self.last_seen = time.time()
        self.last_status = status
        self.last_health = health
        self.last_error = error
        details = payload if isinstance(payload, dict) else {"value": payload}
        return {
            "id": self.component_id,
            "label": self.label,
            "kind": self.kind,
            "status": status,
            "health": health,
            "active": _is_active(status),
            "critical": self.critical,
            "uptime_seconds": max(0, int(time.time() - self.started_at)),
            "uptime": human_uptime(time.time() - self.started_at),
            "last_seen": utc_now_iso(),
            "error": error,
            "details": details,
        }


class SystemOrchestrator:
    def __init__(
        self,
        *,
        runtime_root: Path | str,
        replay_root: Path | str,
        events: Any,
        logger: Any | None = None,
        probe: Any | None = None,
        rgb: Any | None = None,
        thermal: Any | None = None,
    ) -> None:
        self.runtime_root = Path(runtime_root)
        self.replay_root = Path(replay_root)
        self.events = events
        self.logger = logger
        self.probe = probe
        self.rgb = rgb
        self.thermal = thermal
        self._lock = threading.RLock()
        self._started_at = time.time()
        self._last_restart_at: float | None = None
        self._status = "INITIALIZING"
        self._last_error = ""
        self._components: Dict[str, RegisteredComponent] = {}

        self.runtime_root.mkdir(parents=True, exist_ok=True)
        self.replay_root.mkdir(parents=True, exist_ok=True)

        self.device_manager = DeviceManager(
            runtime_root=self.runtime_root,
            replay_root=self.replay_root,
            status_providers=self._build_device_status_providers(),
            events=self.events,
            logger=self.logger,
        )
        self.source_manager = SourceManager(
            runtime_root=self.runtime_root,
            replay_root=self.replay_root,
            device_manager=self.device_manager,
            events=self.events,
            logger=self.logger,
        )
        self.session_manager = SessionManager(
            self.runtime_root / "sessions",
            events=self.events,
            hostname=self._probe_hostname(),
        )
        self.acquisition_manager = AcquisitionManager(
            session_manager=self.session_manager,
            events=self.events,
            logger=self.logger,
        )
        self.dataset_exporter = DatasetExporter(
            session_manager=self.session_manager,
            export_root=self.runtime_root / "exports",
        )
        self.event_manager = EventManager(
            self.runtime_root / "sessions",
            events=self.events,
            session_manager=self.session_manager,
        )
        self.detection_manager = DetectionManager(
            self.runtime_root / "sessions",
            events=self.events,
            session_manager=self.session_manager,
            acquisition_manager=self.acquisition_manager,
            event_manager=self.event_manager,
        )
        self.inference = InferenceWorker(
            events=self.events,
            detection_manager=self.detection_manager,
            source_manager=self.source_manager,
        )
        self.frame_provider: UnifiedFrameProvider = self.inference.frame_provider
        if self.rgb is not None and hasattr(self.rgb, "capture_snapshot"):
            self.frame_provider.register_live_source("RGB_LEFT", "RGB LEFT", lambda: self.rgb.capture_snapshot("left"))
            self.frame_provider.register_live_source("RGB_RIGHT", "RGB RIGHT", lambda: self.rgb.capture_snapshot("right"))

        self._register_managed_components()
        self._register_external_components()
        self._refresh_component_states()

    def _probe_hostname(self) -> str:
        if self.probe and hasattr(self.probe, "hostname"):
            try:
                return str(self.probe.hostname())
            except Exception:
                pass
        return "unknown"

    def _build_device_status_providers(self) -> Dict[str, Callable[[], Dict[str, Any]]]:
        return {
            "rgb_left": lambda: self._rgb_device_status("rgb_left"),
            "rgb_right": lambda: self._rgb_device_status("rgb_right"),
            "thermal": self._thermal_device_status,
        }

    def _rgb_device_status(self, feed_id: str) -> Dict[str, Any]:
        return build_rgb_device_status(self.rgb, feed_id)

    def _thermal_device_status(self) -> Dict[str, Any]:
        return build_thermal_device_status(self.thermal)

    def _register_component(
        self,
        component_id: str,
        label: str,
        kind: str,
        instance: Any,
        *,
        critical: bool = True,
        status_getter: Callable[[], Any] | None = None,
        start_hook: Callable[[], Any] | None = None,
        stop_hook: Callable[[], Any] | None = None,
        restart_hook: Callable[[], Any] | None = None,
    ) -> RegisteredComponent:
        component = RegisteredComponent(
            component_id=component_id,
            label=label,
            kind=kind,
            instance=instance,
            critical=critical,
            status_getter=status_getter,
            start_hook=start_hook,
            stop_hook=stop_hook,
            restart_hook=restart_hook,
        )
        self._components[component_id] = component
        return component

    def register_external_component(
        self,
        component_id: str,
        label: str,
        kind: str,
        instance: Any,
        *,
        critical: bool = False,
        status_getter: Callable[[], Any] | None = None,
        start_hook: Callable[[], Any] | None = None,
        stop_hook: Callable[[], Any] | None = None,
        restart_hook: Callable[[], Any] | None = None,
    ) -> RegisteredComponent:
        with self._lock:
            return self._register_component(
                component_id,
                label,
                kind,
                instance,
                critical=critical,
                status_getter=status_getter,
                start_hook=start_hook,
                stop_hook=stop_hook,
                restart_hook=restart_hook,
            )

    def _register_managed_components(self) -> None:
        self._register_component(
            "device_manager",
            "Device Manager",
            "manager",
            self.device_manager,
            status_getter=self.device_manager.get_status,
            restart_hook=self.device_manager.refresh,
        )
        self._register_component(
            "source_manager",
            "Source Manager",
            "manager",
            self.source_manager,
            status_getter=self.source_manager.get_status,
            restart_hook=self.source_manager.refresh_status,
        )
        self._register_component(
            "session_manager",
            "Session Manager",
            "manager",
            self.session_manager,
            status_getter=self.session_manager.status,
        )
        self._register_component(
            "acquisition_manager",
            "Acquisition Manager",
            "manager",
            self.acquisition_manager,
            status_getter=self.acquisition_manager.status,
        )
        self._register_component(
            "event_manager",
            "Event Manager",
            "manager",
            self.event_manager,
            status_getter=self.event_manager.get_current_events,
        )
        self._register_component(
            "detection_manager",
            "Detection Manager",
            "manager",
            self.detection_manager,
            status_getter=self.detection_manager.get_current_detections,
        )
        self._register_component(
            "frame_provider",
            "Unified Frame Provider",
            "provider",
            self.frame_provider,
            status_getter=self.frame_provider.status,
            restart_hook=self.frame_provider.reset,
        )
        self._register_component(
            "inference_worker",
            "Inference Worker",
            "worker",
            self.inference,
            status_getter=self._inference_status,
            start_hook=self.inference.start,
            stop_hook=self.inference.stop,
            restart_hook=self._restart_inference,
        )

    def _register_external_components(self) -> None:
        if self.probe is not None:
            self._register_component(
                "probe",
                "System Probe",
                "system",
                self.probe,
                critical=False,
                status_getter=self._probe_status,
            )
        if self.rgb is not None:
            self._register_component(
                "rgb",
                "RGB Source",
                "stream",
                self.rgb,
                critical=False,
                status_getter=self._rgb_status,
                start_hook=self._rgb_start,
                stop_hook=self._rgb_stop,
                restart_hook=self._rgb_restart,
            )
        if self.thermal is not None:
            self._register_component(
                "thermal",
                "Thermal Source",
                "stream",
                self.thermal,
                critical=False,
                status_getter=self._thermal_status,
                start_hook=self._thermal_start,
                stop_hook=self._thermal_stop,
                restart_hook=self._thermal_restart,
            )

    def _probe_status(self) -> Dict[str, Any]:
        if self.probe is None:
            return {"ok": True, "status": "UNKNOWN", "health": "UNKNOWN"}
        return {
            "ok": True,
            "status": "READY",
            "health": "GOOD",
            "hostname": _safe_call(getattr(self.probe, "hostname", None), default="unknown"),
            "ip_address": _safe_call(getattr(self.probe, "ip_address", None), default="127.0.0.1"),
            "cpu_temperature_c": _safe_call(getattr(self.probe, "cpu_temperature", None), default=None),
        }

    def _rgb_status(self) -> Dict[str, Any]:
        if self.rgb is None:
            return {"ok": False, "status": "UNKNOWN", "error": "RGB component missing"}
        payload = _safe_call(getattr(self.rgb, "latest_state", None), default={}) or {}
        if not isinstance(payload, dict):
            payload = {"status": str(payload)}
        payload.setdefault("ok", True)
        return payload

    def _thermal_status(self) -> Dict[str, Any]:
        if self.thermal is None:
            return {"ok": False, "status": "UNKNOWN", "error": "Thermal component missing"}
        payload = _safe_call(getattr(self.thermal, "status_payload", None), default={}) or {}
        if not isinstance(payload, dict):
            payload = {"status": str(payload)}
        payload.setdefault("ok", True)
        return payload

    def _inference_status(self) -> Dict[str, Any]:
        payload = _safe_call(getattr(self.inference, "status", None), default={}) or {}
        if not isinstance(payload, dict):
            payload = {"status": str(payload)}
        status = "RUNNING" if payload.get("running") else "READY"
        if payload.get("ok") is False:
            status = "ERROR"
        error = str(payload.get("error") or payload.get("config_error") or "")
        return {
            "ok": payload.get("ok", True),
            "status": status,
            "health": "GOOD" if status in {"READY", "RUNNING"} and not error else "OFFLINE",
            "mode": payload.get("mode"),
            "running": payload.get("running"),
            "backend": payload.get("backend"),
            "model_path": payload.get("model_path"),
            "replay_dir": payload.get("replay_dir"),
            "error": error,
            "count": payload.get("count"),
            "last_image": payload.get("last_image"),
            "last_inference_ms": payload.get("last_inference_ms"),
            "fps": payload.get("fps"),
        }

    def _restart_inference(self) -> Dict[str, Any]:
        try:
            self.inference.stop()
        except Exception:
            pass
        return self.inference.status()

    def _rgb_start(self) -> Any:
        if self.rgb is not None and hasattr(self.rgb, "ensure_running"):
            return self.rgb.ensure_running()
        return None

    def _rgb_stop(self) -> Any:
        if self.rgb is not None and hasattr(self.rgb, "stop"):
            return self.rgb.stop()
        return None

    def _rgb_restart(self) -> Any:
        self._rgb_stop()
        return self._rgb_start()

    def _thermal_start(self) -> Any:
        if self.thermal is not None and hasattr(self.thermal, "start"):
            return self.thermal.start()
        return None

    def _thermal_stop(self) -> Any:
        # ThermalState.stop() is intentionally avoided during orchestration restart
        # because the current implementation is not restart-safe once its worker
        # event has been latched. Keep the hook as a no-op for future backends.
        return None

    def _thermal_restart(self) -> Any:
        return self._thermal_start()

    def _refresh_component_states(self) -> None:
        for component in self._components.values():
            snapshot = component.snapshot()
            component.last_status = str(snapshot.get("status") or "UNKNOWN")
            component.last_health = str(snapshot.get("health") or "UNKNOWN")
            component.last_error = str(snapshot.get("error") or "")

    def ensure_running(self) -> Dict[str, Any]:
        with self._lock:
            self._status = "RUNNING"
            self._last_error = ""
            _safe_call(self.device_manager.refresh)
            _safe_call(self._thermal_start)
            _safe_call(self._rgb_start)
            self._refresh_component_states()
            return self.health()

    def _component_list(self) -> list[Dict[str, Any]]:
        with self._lock:
            snapshots = [component.snapshot() for component in self._components.values()]
        return snapshots

    def start(self) -> Dict[str, Any]:
        with self._lock:
            self.ensure_running()
            _safe_call(self.source_manager.refresh_status)
            self.events.add(
                "SYSTEM_ORCHESTRATOR",
                "SYSTEM_START",
                "System orchestrator started",
                "info",
                meta={"components": list(self._components.keys())},
            )
            return self.health()

    def stop(self) -> Dict[str, Any]:
        with self._lock:
            _safe_call(self.inference.stop)
            _safe_call(self._rgb_stop)
            _safe_call(self.source_manager.refresh_status)
            self._status = "STOPPED"
            self._refresh_component_states()
            self.events.add(
                "SYSTEM_ORCHESTRATOR",
                "SYSTEM_STOP",
                "System orchestrator stopped",
                "info",
                meta={"components": list(self._components.keys())},
            )
            return self.health()

    def restart(self) -> Dict[str, Any]:
        with self._lock:
            self._last_restart_at = time.time()
            self.events.add(
                "SYSTEM_ORCHESTRATOR",
                "SYSTEM_RESTART",
                "System orchestrator restart requested",
                "warning",
                meta={"components": list(self._components.keys())},
            )
        self.stop()
        self.start()
        return self.health()

    def components(self) -> Dict[str, Any]:
        component_payloads = self._component_list()
        active_count = sum(1 for item in component_payloads if item.get("active"))
        error_count = sum(1 for item in component_payloads if item.get("error"))
        return {
            "ok": True,
            "status": self._status,
            "count": len(component_payloads),
            "active_count": active_count,
            "error_count": error_count,
            "components": component_payloads,
            "updated_at": utc_now_iso(),
        }

    def health(self) -> Dict[str, Any]:
        component_payloads = self._component_list()
        critical_errors = [
            item
            for item in component_payloads
            if item.get("critical") and item.get("status") in {"ERROR", "FAILED"}
        ]
        error_payloads = [item for item in component_payloads if item.get("error")]
        uptime_seconds = time.time() - self._started_at
        ok = self._status in {"RUNNING", "INITIALIZING"} and not critical_errors
        return {
            "ok": ok,
            "status": self._status,
            "started_at": format_utc_ts(self._started_at),
            "uptime_seconds": int(uptime_seconds),
            "uptime": human_uptime(uptime_seconds),
            "last_restart_at": format_utc_ts(self._last_restart_at),
            "component_count": len(component_payloads),
            "active_count": sum(1 for item in component_payloads if item.get("active")),
            "error_count": len(error_payloads),
            "errors": error_payloads,
            "components": component_payloads,
            "updated_at": utc_now_iso(),
            "system_root": str(self.runtime_root),
        }

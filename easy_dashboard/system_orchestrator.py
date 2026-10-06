# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""System orchestrator: builds, supervises and reports on every runtime component.

The orchestrator is the composition root of the backend. It creates the managers
in dependency order and registers each one as a *component* with a status getter:

    DeviceManager -> SourceManager -> SessionManager -> AcquisitionManager
    -> DatasetExporter -> EventManager -> DetectionManager -> InferenceWorker

The RGB capture, the thermal sensor and the system probe are external components
that are injected from ``app.py``. ``health()`` and ``components()`` aggregate the
state of all of them for the diagnostics API; the system is healthy unless a
*critical* component reports ERROR.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from easy_dashboard.acquisition_manager import AcquisitionManager
from easy_dashboard.detection_manager import DetectionManager
from easy_dashboard.dataset_exporter import DatasetExporter
from easy_dashboard.device_manager import DeviceManager
from easy_dashboard.event_manager import EventManager
from easy_dashboard.frame_provider import UnifiedFrameProvider
from easy_dashboard.inference_worker import InferenceWorker
from easy_dashboard.session_manager import SessionManager
from easy_dashboard.source_manager import SourceManager
from easy_dashboard.runtime_support import error_from_payload, health_from_status, is_active_status, status_from_payload
from easy_dashboard.runtime_status import build_rgb_device_status, build_thermal_device_status


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def utc_now_iso() -> str:
    """Current UTC time as ``YYYY-MM-DDTHH:MM:SSZ``."""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def format_utc_ts(epoch: float | None) -> str | None:
    """Format epoch seconds as a UTC ISO string (None stays None)."""
    if epoch is None:
        return None
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def human_uptime(seconds: float | int | None) -> str:
    """Format a duration in seconds as ``Xd Xh Xm Xs`` (``--`` when unknown)."""
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
    """Call ``func`` and return ``default`` if it is missing or raises."""
    if not callable(func):
        return default
    try:
        return func()
    except Exception:
        return default


def _status_from_payload(payload: Any, default: str = "UNKNOWN") -> str:
    """Alias of ``runtime_support.status_from_payload``."""
    return status_from_payload(payload, default)


def _error_from_payload(payload: Any) -> str:
    """Alias of ``runtime_support.error_from_payload``."""
    return error_from_payload(payload)


def _health_from_status(status: str) -> str:
    """Alias of ``runtime_support.health_from_status``."""
    return health_from_status(status)


def _is_active(status: str) -> bool:
    """Alias of ``runtime_support.is_active_status``."""
    return is_active_status(status)


@dataclass
class RegisteredComponent:
    """A supervised component: its instance, criticality and optional status/start/stop/restart hooks."""
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
        """Query the component and return its current status, health, uptime and error for the API."""
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
    """Creates, starts, stops and reports on the whole runtime."""
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
        """Build every manager, wire the live RGB sources into the frame provider and register all components."""
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
            auto_refresh=False,
        )
        self.source_manager = SourceManager(
            runtime_root=self.runtime_root,
            replay_root=self.replay_root,
            device_manager=self.device_manager,
            events=self.events,
            logger=self.logger,
            auto_refresh=False,
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
        """Host name from the system probe, or ``unknown``."""
        if self.probe and hasattr(self.probe, "hostname"):
            try:
                return str(self.probe.hostname())
            except Exception:
                pass
        return "unknown"

    def _build_device_status_providers(self) -> Dict[str, Callable[[], Dict[str, Any]]]:
        """Map each live endpoint to the callable that reports its hardware status."""
        return {
            "rgb_left": lambda: self._rgb_device_status("rgb_left"),
            "rgb_right": lambda: self._rgb_device_status("rgb_right"),
            "thermal": self._thermal_device_status,
        }

    def _rgb_device_status(self, feed_id: str) -> Dict[str, Any]:
        """Device status of one RGB feed."""
        return build_rgb_device_status(self.rgb, feed_id)

    def _thermal_device_status(self) -> Dict[str, Any]:
        """Device status of the thermal sensor."""
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
        """Register a component and return its record."""
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

    def _register_managed_components(self) -> None:
        """Register the managers, the frame provider and the inference worker (all critical)."""
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
        """Register the system probe, RGB and thermal sources; their failure is not critical."""
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
        """Host name, IP address and CPU temperature from the system probe."""
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
        """Latest RGB capture state."""
        if self.rgb is None:
            return {"ok": False, "status": "UNKNOWN", "error": "RGB component missing"}
        payload = _safe_call(getattr(self.rgb, "latest_state", None), default={}) or {}
        if not isinstance(payload, dict):
            payload = {"status": str(payload)}
        payload.setdefault("ok", True)
        return payload

    def _thermal_status(self) -> Dict[str, Any]:
        """Thermal status, read without touching the sensor (``refresh=False``)."""
        if self.thermal is None:
            return {"ok": False, "status": "UNKNOWN", "error": "Thermal component missing"}
        status_payload = getattr(self.thermal, "status_payload", None)
        payload = _safe_call(lambda: status_payload(refresh=False), default={}) if callable(status_payload) else {}
        payload = payload or {}
        if not isinstance(payload, dict):
            payload = {"status": str(payload)}
        payload.setdefault("ok", True)
        return payload

    def _inference_status(self) -> Dict[str, Any]:
        """Condensed inference worker status: RUNNING, READY or ERROR plus model and timing."""
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
        """Stop the inference loop (it is restarted by the operator or the mission) and return its status."""
        try:
            self.inference.stop()
        except Exception:
            pass
        return self.inference.status()

    def _rgb_start(self) -> Any:
        """Make sure the RGB capture process is running."""
        if self.rgb is not None and hasattr(self.rgb, "ensure_running"):
            return self.rgb.ensure_running()
        return None

    def _rgb_stop(self) -> Any:
        """Stop the RGB capture process."""
        if self.rgb is not None and hasattr(self.rgb, "stop"):
            return self.rgb.stop()
        return None

    def _rgb_restart(self) -> Any:
        """Stop and restart the RGB capture."""
        self._rgb_stop()
        return self._rgb_start()

    def _thermal_start(self) -> Any:
        """Start the thermal worker."""
        if self.thermal is not None and hasattr(self.thermal, "start"):
            return self.thermal.start()
        return None

    def _thermal_stop(self) -> Any:
        """Stop the thermal worker."""
        if self.thermal is not None and hasattr(self.thermal, "stop"):
            return self.thermal.stop()
        return None

    def _thermal_restart(self) -> Any:
        """Restart the thermal worker."""
        return self._thermal_start()

    def _refresh_component_states(self) -> None:
        """Poll every component and cache its latest status, health and error."""
        for component in self._components.values():
            snapshot = component.snapshot()
            component.last_status = str(snapshot.get("status") or "UNKNOWN")
            component.last_health = str(snapshot.get("health") or "UNKNOWN")
            component.last_error = str(snapshot.get("error") or "")

    def ensure_running(self) -> Dict[str, Any]:
        """Mark the system RUNNING and (re)start RGB and thermal if needed. Safe to call periodically."""
        with self._lock:
            self._status = "RUNNING"
            self._last_error = ""
            _safe_call(self.device_manager.refresh)
            _safe_call(self._thermal_start)
            _safe_call(self._rgb_start)
            self._refresh_component_states()
            return self.health()

    def _component_list(self) -> list[Dict[str, Any]]:
        """Snapshot of every component, taken under the lock."""
        with self._lock:
            snapshots = [component.snapshot() for component in self._components.values()]
        return snapshots

    def start(self) -> Dict[str, Any]:
        """Start the runtime and log ``SYSTEM_START``."""
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
        """Stop inference and RGB, flush buffered session data to disk and log ``SYSTEM_STOP``."""
        with self._lock:
            _safe_call(self.inference.stop)
            _safe_call(self._rgb_stop)
            _safe_call(self.source_manager.refresh_status)
            _safe_call(self.session_manager.flush_all)
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
        """Stop and start the runtime again."""
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
        """Component list with active and error counts."""
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
        """Overall health: ``ok`` is false when stopped/failed or when a critical component is in ERROR."""
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

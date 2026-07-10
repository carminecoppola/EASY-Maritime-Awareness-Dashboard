from __future__ import annotations

"""Runtime context shared by Flask blueprints.

The dashboard has several long-lived collaborators: stores, hardware probes,
stream sources, and runtime managers. Keeping them behind one context object
lets route modules stay small without hiding the dependencies in globals.
"""

import time
from dataclasses import dataclass
from typing import Any, Callable, Dict

from flask import request

from easy_dashboard.constants import SNAPSHOT_FEED_MAP
from easy_dashboard.presentation import build_camera_inventory, build_operations_payload, build_system_payload
from easy_dashboard.utils import utc_now_iso


@dataclass
class DashboardRuntime:
    config: Dict[str, Any]
    events: Any
    snapshot_store: Any
    probe: Any
    thermal: Any
    rgb: Any
    orchestrator: Any
    logger: Any

    @property
    def device_manager(self) -> Any:
        return self.orchestrator.device_manager

    @property
    def source_manager(self) -> Any:
        return self.orchestrator.source_manager

    @property
    def session_manager(self) -> Any:
        return self.orchestrator.session_manager

    @property
    def event_manager(self) -> Any:
        return self.orchestrator.event_manager

    @property
    def acquisition_manager(self) -> Any:
        return self.orchestrator.acquisition_manager

    @property
    def detection_manager(self) -> Any:
        return self.orchestrator.detection_manager

    @property
    def inference(self) -> Any:
        return self.orchestrator.inference

    def asset_version(self) -> str:
        return str(int(time.time()))

    def events_payload(self, limit: int = 50) -> Dict[str, Any]:
        all_events = self.events.list(9999)
        severity_counts: Dict[str, int] = {}
        source_counts: Dict[str, int] = {}
        for event in all_events:
            severity = str(event.get("severity", "info")).lower()
            severity_counts[severity] = severity_counts.get(severity, 0) + 1
            source = str(event.get("source", "unknown"))
            source_counts[source] = source_counts.get(source, 0) + 1
        return {
            "events": self.events.list(limit),
            "count": len(all_events),
            "summary": {"severity": severity_counts, "sources": source_counts},
        }

    def inference_status_payload(self) -> Dict[str, Any]:
        status_payload = self.inference.status()
        detection_state = self.detection_manager.get_current_detections()
        status_payload["count"] = detection_state.get("count", status_payload.get("count", 0))
        status_payload["last_detections"] = detection_state.get(
            "detections",
            status_payload.get("last_detections", []),
        )
        status_payload["last_image"] = detection_state.get("last_image") or status_payload.get("last_image")
        status_payload["last_run_ts"] = detection_state.get("last_run_ts") or status_payload.get("last_run_ts")
        status_payload["last_inference_ms"] = detection_state.get("last_inference_ms") or status_payload.get("last_inference_ms")
        status_payload["fps"] = detection_state.get("fps") or status_payload.get("fps")
        status_payload["detection_manager"] = {
            "current_detections_path": detection_state.get("current_detections_path"),
            "history_path": detection_state.get("history_path"),
            "session_id": detection_state.get("session_id"),
        }
        status_payload["frame_provider"] = self.inference.frame_provider_status()
        return status_payload

    def health_payload(self) -> Dict[str, Any]:
        camera_inventory = build_camera_inventory(self.rgb, self.thermal)
        system_payload = build_system_payload(self.probe)
        rgb_state = self.rgb.latest_state()
        thermal_state = self.thermal.status_payload()
        inference_state = self.inference.status()
        sources_state = self.source_manager.get_status()
        detection_state = self.detection_manager.get_current_detections()
        session_state = self.session_manager.status()
        device_state = self.device_manager.get_status()
        operations_inference_state = dict(inference_state)
        operations_inference_state.update(
            {
                "count": detection_state.get("count", 0),
                "last_detections": detection_state.get("detections", []),
                "last_image": detection_state.get("last_image") or inference_state.get("last_image"),
                "last_run_ts": detection_state.get("last_run_ts") or inference_state.get("last_run_ts"),
                "last_inference_ms": detection_state.get("last_inference_ms") or inference_state.get("last_inference_ms"),
                "fps": detection_state.get("fps") or inference_state.get("fps"),
                "source": detection_state.get("source") or inference_state.get("source"),
                "source_label": detection_state.get("source_label") or inference_state.get("source_label"),
            }
        )
        operations_payload = build_operations_payload(camera_inventory, rgb_state, thermal_state, operations_inference_state)
        ok = rgb_state["camera_state"] in {"DETECTED", "BUSY"} and thermal_state["status"] in {
            "MOCK",
            "REAL",
            "STARTING",
            "NOT_DETECTED",
            "DISABLED",
        }
        return {
            "ok": ok,
            "service": "easy-dashboard",
            "timestamp": utc_now_iso(),
            "system": system_payload,
            "system_orchestrator": self.orchestrator.health(),
            "system_components": self.orchestrator.components(),
            "cameras": camera_inventory,
            "sources": sources_state,
            "rgb": rgb_state,
            "thermal": thermal_state,
            "inference": inference_state,
            "detection_manager": detection_state,
            "session": session_state,
            "devices": device_state,
            "operations": operations_payload,
            "events_count": len(self.events.list(9999)),
        }

    def status_summary_payload(self) -> Dict[str, Any]:
        """Return a compact operator-facing status payload.

        `/health` is intentionally detailed for diagnostics. This summary is
        designed for UI cards, smoke checks, and first-level support: it keeps
        only the fields that answer "can I use the dashboard right now?".
        """
        health_payload = self.health_payload()
        acquisition_state = self.acquisition_manager.status()
        inference_state = self.inference_status_payload()
        session_state = self.session_manager.status()
        thermal_state = health_payload.get("thermal") or {}
        rgb_state = health_payload.get("rgb") or {}
        sources_state = health_payload.get("sources") or {}
        events_payload = self.events_payload(limit=8)
        dataset_summary = acquisition_state.get("dataset_summary") or {}
        manifest_counts = acquisition_state.get("manifest_counts") or {}
        latest_session = session_state.get("current") or session_state.get("latest") or {}

        return {
            "ok": bool(health_payload.get("ok")),
            "service": "easy-dashboard",
            "timestamp": health_payload.get("timestamp") or utc_now_iso(),
            "operator_state": "ready" if health_payload.get("ok") else "needs_attention",
            "live": {
                "rgb_state": rgb_state.get("camera_state"),
                "thermal_state": thermal_state.get("status") or thermal_state.get("mode"),
                "thermal_device": thermal_state.get("device"),
                "thermal_input_format": thermal_state.get("input_format"),
                "selected_source": (sources_state.get("selected_source") or {}).get("id"),
            },
            "mission": {
                "running": bool(session_state.get("running")),
                "session_id": latest_session.get("session_id"),
                "status": latest_session.get("status"),
                "duration_seconds": latest_session.get("duration_seconds") or latest_session.get("duration"),
            },
            "dataset": {
                "manifest_path": acquisition_state.get("manifest_path"),
                "samples": dataset_summary.get("samples", 0),
                "paired_items": dataset_summary.get("paired_items", 0),
                "snapshots": manifest_counts.get("snapshots", 0),
                "inference": manifest_counts.get("inference", 0),
                "detections": manifest_counts.get("detections", 0),
                "by_feed": dataset_summary.get("by_feed", {}),
                "pair_window_seconds": dataset_summary.get("pair_window_seconds"),
            },
            "ai": {
                "running": bool(inference_state.get("running")),
                "backend": inference_state.get("backend"),
                "detections": inference_state.get("count", 0),
                "last_run_ts": inference_state.get("last_run_ts"),
                "error": inference_state.get("error") or inference_state.get("config_error") or "",
            },
            "activity": {
                "events_count": events_payload.get("count", 0),
                "recent_events": events_payload.get("events", []),
            },
        }

    def dashboard_state_payload(self) -> Dict[str, Any]:
        health_payload = self.health_payload()
        snapshots_limit = int(request.args.get("snapshots_limit", 12))
        events_limit = int(request.args.get("events_limit", 9999))
        snapshots_summary = self.snapshot_store.summary()
        return {
            "ok": health_payload.get("ok", False),
            "timestamp": health_payload.get("timestamp"),
            "health": health_payload,
            "events": self.events_payload(limit=events_limit),
            "snapshots": {
                "count": snapshots_summary["count"],
                "items": self.snapshot_store.list_recent(snapshots_limit),
                "feeds": SNAPSHOT_FEED_MAP,
                "summary": snapshots_summary,
            },
            "sources": health_payload.get("sources") or self.source_manager.get_status(),
            "devices": health_payload.get("devices") or self.device_manager.get_status(),
            "inference": self.inference_status_payload(),
            "detections": self.detection_manager.get_current_detections(),
            "session": self.session_manager.status(),
            "acquisition": self.acquisition_manager.status(),
            "events_current": self.event_manager.get_current_events(),
            "events_history": self.event_manager.get_history(),
            "frame_provider": self.inference.frame_provider_status(),
            "system_status": self.orchestrator.health(),
            "system_components": self.orchestrator.components(),
        }

    def capture_snapshot(self, feed: str, capture_fn: Callable[[], Any], meta: Dict[str, Any]) -> tuple[Any, bool, Dict[str, Any] | None, Dict[str, Any]]:
        try:
            frame, ok = capture_fn()
            meta = dict(meta)
            meta["capture_ok"] = ok
            snapshot_info = self.snapshot_store.save(feed, frame, meta=meta)
            try:
                self.acquisition_manager.record_snapshot(feed=feed, snapshot=snapshot_info, meta=meta)
            except Exception:
                self.logger.exception("Failed to index snapshot in session manifest for %s", feed)
            return frame, ok, snapshot_info, meta
        except Exception as exc:
            self.logger.exception("Failed to save snapshot for %s", feed)
            self.events.add(
                meta.get("source", feed.upper()),
                "SNAPSHOT_ERROR",
                f"Snapshot failed for {feed}: {exc}",
                "error",
                meta=meta,
            )
            return None, False, None, meta

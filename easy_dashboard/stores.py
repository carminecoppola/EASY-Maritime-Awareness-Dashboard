from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Dict, Optional

from .constants import SNAPSHOT_FEED_MAP
from .utils import utc_now_iso


LOGGER = logging.getLogger("easy-dashboard")


class EventStore:
    """Append-only event log mirrored in memory for the dashboard UI."""

    def __init__(self, path: Path, limit: int = 200) -> None:
        self.path = path
        self.limit = limit
        self._lock = threading.Lock()
        self._events: deque[Dict[str, Any]] = deque(maxlen=limit)
        self._load_existing()

    def _load_existing(self) -> None:
        if not self.path.exists():
            return
        try:
            with self.path.open("r", encoding="utf-8") as fh:
                lines = fh.readlines()
        except OSError:
            LOGGER.exception("Failed to open existing events log")
            return
        for line_no, line in enumerate(lines, start=1):
            line = line.strip("\x00").strip()
            if not line:
                continue
            try:
                self._events.append(json.loads(line))
            except (json.JSONDecodeError, ValueError):
                LOGGER.warning("Skipping malformed events log line %d in %s", line_no, self.path)

    def add(self, source: str, event_type: str, description: str, severity: str = "info", meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        meta = meta or {}
        action_map = {
            "STREAM_ERROR": "Controlla processo camera e riavvia lo stream se resta fermo.",
            "SNAPSHOT_ERROR": "Ripeti lo snapshot; se ricapita controlla spazio disco e stato feed.",
            "NOT_DETECTED": "Controlla cavo, alimentazione e device video.",
            "THERMAL_HOTSPOT": "Verifica la scena termica e confronta con RGB.",
            "INFERENCE_START": "Verifica runtime/replay e attendi i primi risultati AI.",
            "INFERENCE_STOP": "Riattiva il worker se la demo AI deve continuare.",
            "INFERENCE_ERROR": "Check runtime/models, runtime/config and onnxruntime availability.",
            "DETECTED": "Apri runtime/sessions e verifica le rilevazioni AI annotate.",
            "SESSION_START": "The session is active: captures and detections will be archived.",
            "SESSION_STOP": "Session stopped. You can review its archive in runtime/sessions.",
            "DETECTION_NEW": "Detection registrata nel manager e nella sessione corrente.",
            "SOURCE_SELECT": "The source was updated in Source Manager.",
            "SOURCE_SELECT_FAILED": "Verifica che la sorgente richiesta esista ancora.",
            "SOURCE_REFRESH": "The source registry was updated.",
        }
        event = {
            "id": f"{int(time.time() * 1000)}-{len(self._events)}",
            "timestamp": utc_now_iso(),
            "source": source,
            "type": event_type,
            "description": description,
            "severity": severity,
            "action": meta.get("action") or action_map.get(event_type, "No action required."),
            "meta": meta,
        }
        with self._lock:
            self._events.append(event)
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(event, ensure_ascii=False) + "\n")
        return event

    def list(self, limit: int = 50) -> list[Dict[str, Any]]:
        with self._lock:
            return list(self._events)[-limit:]


class SnapshotStore:
    """Keeps snapshots grouped by feed with tiny JSON sidecars for metadata."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self._lock = threading.Lock()
        self.root.mkdir(parents=True, exist_ok=True)
        for feed_meta in SNAPSHOT_FEED_MAP.values():
            (self.root / feed_meta["folder"]).mkdir(parents=True, exist_ok=True)

    def _feed_meta(self, feed: str) -> Dict[str, str]:
        if feed not in SNAPSHOT_FEED_MAP:
            raise KeyError(feed)
        return SNAPSHOT_FEED_MAP[feed]

    def _feed_dir(self, feed: str) -> Path:
        return self.root / self._feed_meta(feed)["folder"]

    def _snapshot_payload(self, path: Path, feed: str, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        stat = path.stat()
        feed_meta = self._feed_meta(feed)
        payload = {
            "feed": feed,
            "feed_label": feed_meta["label"],
            "source": feed_meta["source"],
            "filename": path.name,
            "path": str(path),
            "url": f"/snapshots/{feed}/{path.name}",
            "download_url": f"/snapshots/{feed}/{path.name}?download=1",
            "created_ts": stat.st_mtime,
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(stat.st_mtime)),
            "size_bytes": stat.st_size,
            "meta": meta or {},
        }
        sidecar = path.with_suffix(".json")
        if sidecar.exists():
            try:
                payload["meta"] = json.loads(sidecar.read_text())
            except Exception:
                LOGGER.exception("Failed to read snapshot metadata sidecar: %s", sidecar)
        return payload

    def save(self, feed: str, frame: bytes, *, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        feed_dir = self._feed_dir(feed)
        stamp = time.strftime("%Y%m%d_%H%M%S")
        suffix_ms = int((time.time() % 1) * 1000)
        filename = f"{stamp}_{suffix_ms:03d}_{feed}.jpg"
        path = feed_dir / filename
        sidecar = path.with_suffix(".json")
        payload_meta = meta or {}
        payload_meta.setdefault("saved_at", utc_now_iso())
        payload_meta.setdefault("feed", feed)
        payload_meta.setdefault("feed_label", self._feed_meta(feed)["label"])
        with self._lock:
            path.write_bytes(frame)
            sidecar.write_text(json.dumps(payload_meta, ensure_ascii=False, indent=2))
        return self._snapshot_payload(path, feed, payload_meta)

    def list_recent(self, limit: int = 24) -> list[Dict[str, Any]]:
        entries: list[Dict[str, Any]] = []
        for feed, feed_meta in SNAPSHOT_FEED_MAP.items():
            feed_dir = self.root / feed_meta["folder"]
            if not feed_dir.exists():
                continue
            for image_path in feed_dir.glob("*.jpg"):
                try:
                    entries.append(self._snapshot_payload(image_path, feed))
                except Exception:
                    LOGGER.exception("Failed to inspect snapshot: %s", image_path)
        entries.sort(key=lambda item: item.get("created_ts", 0.0), reverse=True)
        return entries[:limit]

    def summary(self) -> Dict[str, Any]:
        recent = self.list_recent(999)
        by_feed: Dict[str, Dict[str, Any]] = {}
        for feed, feed_meta in SNAPSHOT_FEED_MAP.items():
            items = [item for item in recent if item["feed"] == feed]
            total_size = sum(int(item.get("size_bytes") or 0) for item in items)
            by_feed[feed] = {
                "label": feed_meta["label"],
                "count": len(items),
                "size_bytes": total_size,
                "latest": items[0] if items else None,
            }
        return {
            "count": len(recent),
            "size_bytes": sum(int(item.get("size_bytes") or 0) for item in recent),
            "by_feed": by_feed,
            "latest": recent[0] if recent else None,
            "root": str(self.root),
        }

    def get_path(self, feed: str, filename: str) -> Path:
        feed_dir = self._feed_dir(feed)
        candidate = (feed_dir / filename).resolve()
        if feed_dir.resolve() not in candidate.parents and candidate != feed_dir.resolve():
            raise ValueError("Invalid snapshot path")
        return candidate

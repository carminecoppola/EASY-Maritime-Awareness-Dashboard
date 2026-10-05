# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Persistent stores: the event log and the snapshot archive.

* ``EventStore`` keeps the operator activity log, appended to
  ``data/logs/events.jsonl`` and mirrored in a bounded in-memory deque.
* ``SnapshotStore`` keeps JPEG snapshots per feed with a small JSON sidecar
  each, indexed in SQLite so listing and paging stay fast with thousands of files.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
import uuid
from collections import deque
from contextlib import closing
from pathlib import Path
from typing import Any, Dict, Optional

from .constants import SNAPSHOT_FEED_MAP
from .utils import utc_now_iso


LOGGER = logging.getLogger("easy-dashboard")


class EventStore:
    """Append-only event log mirrored in memory for the dashboard UI."""

    def __init__(self, path: Path, limit: int = 200) -> None:
        """Open the log and load the most recent ``limit`` events."""
        self.path = path
        self.limit = limit
        self._lock = threading.Lock()
        self._events: deque[Dict[str, Any]] = deque(maxlen=limit)
        self._load_existing()

    def _load_existing(self) -> None:
        """Load existing events, skipping malformed or NUL-corrupted lines."""
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
        """Record an event and return it.

        Every event carries an ``action`` hint for the operator, taken from ``meta`` or
        from a built-in table keyed by event type.
        """
        meta = meta or {}
        action_map = {
            "STREAM_ERROR": "Check the camera process and restart the stream if it stays stopped.",
            "SNAPSHOT_ERROR": "Retry the snapshot; if it fails again, check free disk space and the feed status.",
            "NOT_DETECTED": "Check the cable, the power supply and the video device.",
            "THERMAL_HOTSPOT": "Inspect the thermal scene and compare it with the RGB view.",
            "INFERENCE_START": "Check runtime/replay and wait for the first detection results.",
            "INFERENCE_STOP": "Restart the worker if inference should keep running.",
            "INFERENCE_ERROR": "Check runtime/models, runtime/config and onnxruntime availability.",
            "DETECTED": "Open runtime/sessions to review the annotated detections.",
            "SESSION_START": "The session is active: captures and detections will be archived.",
            "SESSION_STOP": "Session stopped. You can review its archive in runtime/sessions.",
            "DETECTION_NEW": "Detection recorded in the detection manager and in the current session.",
            "SOURCE_SELECT": "The source was updated in Source Manager.",
            "SOURCE_SELECT_FAILED": "Check that the requested source still exists.",
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
        """Return the most recent ``limit`` events, oldest first."""
        with self._lock:
            return list(self._events)[-limit:]


class SnapshotStore:
    """Keeps snapshots grouped by feed with tiny JSON sidecars for metadata."""

    def __init__(self, root: Path) -> None:
        """Create the folders and build the SQLite index."""
        self.root = root
        self._lock = threading.Lock()
        self.root.mkdir(parents=True, exist_ok=True)
        for feed_meta in SNAPSHOT_FEED_MAP.values():
            (self.root / feed_meta["folder"]).mkdir(parents=True, exist_ok=True)
        self._index_path = self.root / "snapshots.sqlite3"
        self.rebuild_index()

    def rebuild_index(self) -> None:
        """Rebuild the SQLite index from the files on disk.

        Run once at start-up so legacy files and manual edits are picked up, instead of
        scanning the folders on every poll.
        """
        with self._lock, closing(sqlite3.connect(self._index_path)) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS snapshots (feed TEXT, filename TEXT, created_ts REAL, size_bytes INTEGER, payload TEXT, PRIMARY KEY (feed, filename))")
            db.execute("CREATE INDEX IF NOT EXISTS snapshots_recent ON snapshots(created_ts DESC, filename DESC)")
            db.execute("CREATE INDEX IF NOT EXISTS snapshots_feed_recent ON snapshots(feed, created_ts DESC, filename DESC)")
            db.execute("DELETE FROM snapshots")
            for feed in SNAPSHOT_FEED_MAP:
                for path in self._feed_dir(feed).glob("*.jpg"):
                    try:
                        payload = self._snapshot_payload(path, feed)
                    except OSError:
                        LOGGER.exception("Failed to inspect snapshot: %s", path)
                        continue
                    self._index_snapshot(db, payload)

    @staticmethod
    def _index_snapshot(db: sqlite3.Connection, payload: Dict[str, Any]) -> None:
        """Insert one snapshot payload into the index."""
        db.execute("INSERT INTO snapshots VALUES (?, ?, ?, ?, ?)", (
            payload["feed"], payload["filename"], payload["created_ts"],
            payload["size_bytes"], json.dumps(payload, ensure_ascii=False),
        ))

    def _feed_meta(self, feed: str) -> Dict[str, str]:
        """Static metadata of a feed (label, source, folder); ``KeyError`` for unknown feeds."""
        if feed not in SNAPSHOT_FEED_MAP:
            raise KeyError(feed)
        return SNAPSHOT_FEED_MAP[feed]

    def _feed_dir(self, feed: str) -> Path:
        """Folder holding the snapshots of a feed."""
        return self.root / self._feed_meta(feed)["folder"]

    def _snapshot_payload(self, path: Path, feed: str, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Describe a snapshot file: URLs, creation time, size and the sidecar metadata."""
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
        """Store a JPEG with its sidecar and index it; return its payload.

        Files are created exclusively (never overwritten) and removed again if any
        step fails, so no orphan image or sidecar is left behind.
        """
        feed_dir = self._feed_dir(feed)
        stamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"{stamp}_{uuid.uuid4().hex}_{feed}.jpg"
        path = feed_dir / filename
        sidecar = path.with_suffix(".json")
        payload_meta = dict(meta or {})
        payload_meta.setdefault("saved_at", utc_now_iso())
        payload_meta.setdefault("feed", feed)
        payload_meta.setdefault("feed_label", self._feed_meta(feed)["label"])
        encoded_meta = json.dumps(payload_meta, ensure_ascii=False, indent=2)
        with self._lock:
            # Exclusive creation protects existing data even on a UUID collision.
            with path.open("xb") as image:
                sidecar_created = False
                try:
                    image.write(frame)
                    image.flush()
                    with sidecar.open("x", encoding="utf-8") as metadata:
                        sidecar_created = True
                        metadata.write(encoded_meta)
                    payload = self._snapshot_payload(path, feed, payload_meta)
                    with closing(sqlite3.connect(self._index_path)) as db, db:
                        self._index_snapshot(db, payload)
                except Exception:
                    path.unlink(missing_ok=True)
                    if sidecar_created:
                        sidecar.unlink(missing_ok=True)
                    raise
        return payload

    def list_recent(self, limit: int = 24, offset: int = 0) -> list[Dict[str, Any]]:
        """Return one page of snapshots, newest first."""
        with self._lock, closing(sqlite3.connect(self._index_path)) as db:
            rows = db.execute("SELECT payload FROM snapshots ORDER BY created_ts DESC, filename DESC LIMIT ? OFFSET ?", (max(0, limit), max(0, offset)))
            return [json.loads(row[0]) for row in rows]

    def summary(self) -> Dict[str, Any]:
        """Counts, sizes and the latest snapshot per feed and overall."""
        by_feed: Dict[str, Dict[str, Any]] = {}
        with self._lock, closing(sqlite3.connect(self._index_path)) as db:
            for feed, feed_meta in SNAPSHOT_FEED_MAP.items():
                count, total_size = db.execute("SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM snapshots WHERE feed = ?", (feed,)).fetchone()
                latest = db.execute("SELECT payload FROM snapshots WHERE feed = ? ORDER BY created_ts DESC, filename DESC LIMIT 1", (feed,)).fetchone()
                by_feed[feed] = {
                    "label": feed_meta["label"], "count": count, "size_bytes": total_size,
                    "latest": json.loads(latest[0]) if latest else None,
                }
        latest_items = [item["latest"] for item in by_feed.values() if item["latest"]]
        return {
            "count": sum(item["count"] for item in by_feed.values()),
            "size_bytes": sum(item["size_bytes"] for item in by_feed.values()),
            "by_feed": by_feed,
            "latest": max(latest_items, key=lambda item: (item["created_ts"], item["filename"]), default=None),
            "root": str(self.root),
        }

    def get_path(self, feed: str, filename: str) -> Path:
        """Resolve a snapshot file, rejecting names that would escape its feed folder (path traversal)."""
        feed_dir = self._feed_dir(feed)
        candidate = (feed_dir / filename).resolve()
        if feed_dir.resolve() not in candidate.parents and candidate != feed_dir.resolve():
            raise ValueError("Invalid snapshot path")
        return candidate

from __future__ import annotations

import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from easy_dashboard.stores import SnapshotStore


class SnapshotStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.store = SnapshotStore(self.root)

    def test_simultaneous_captures_preserve_every_image(self) -> None:
        with patch("easy_dashboard.stores.time.time", return_value=1700000000.123):
            with ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(lambda i: self.store.save("rgb_left", str(i).encode()), range(20)))
        self.assertEqual(len({item["filename"] for item in results}), 20)
        self.assertEqual({Path(item["path"]).read_bytes() for item in results}, {str(i).encode() for i in range(20)})
        self.assertEqual(self.store.summary()["count"], 20)

    def test_collision_cannot_overwrite_an_existing_capture(self) -> None:
        with patch("easy_dashboard.stores.uuid.uuid4") as uid, patch("easy_dashboard.stores.time.strftime", return_value="fixed"):
            uid.return_value.hex = "collision"
            original = self.store.save("rgb_left", b"original")
            with self.assertRaises(FileExistsError):
                self.store.save("rgb_left", b"replacement")
        self.assertEqual(Path(original["path"]).read_bytes(), b"original")
        self.assertEqual(self.store.summary()["count"], 1)

    def test_failed_metadata_write_does_not_leave_an_archive_entry(self) -> None:
        original_open = Path.open

        def fail_metadata(path, *args, **kwargs):
            if path.suffix == ".json" and args and args[0] == "x":
                raise OSError("disk full")
            return original_open(path, *args, **kwargs)

        with patch.object(Path, "open", fail_metadata):
            with self.assertRaises(OSError):
                self.store.save("rgb_left", b"frame")
        self.assertEqual(self.store.summary()["count"], 0)
        self.assertEqual(list(self.root.rglob("*.jpg")), [])

    def test_large_legacy_archive_has_complete_totals_and_pagination_without_file_reads(self) -> None:
        folder = self.root / "rgb_left"
        for i in range(1005):
            (folder / f"{i:04}.jpg").write_bytes(b"frame")
        (folder / "0000.json").write_text(json.dumps({"note": "legacy"}))
        self.store = SnapshotStore(self.root)
        with patch.object(Path, "glob", side_effect=AssertionError("request scanned disk")), patch.object(Path, "read_text", side_effect=AssertionError("request read sidecars")):
            summary = self.store.summary()
            first = self.store.list_recent(600)
            second = self.store.list_recent(600, 600)
        self.assertEqual(summary["count"], 1005)
        self.assertEqual(summary["size_bytes"], 5025)
        self.assertEqual(summary["by_feed"]["rgb_left"]["count"], 1005)
        self.assertEqual(len(first), 600)
        self.assertEqual(len(second), 405)
        self.assertEqual(len({item["filename"] for item in first + second}), 1005)
        self.assertEqual(next(item for item in first + second if item["filename"] == "0000.jpg")["meta"], {"note": "legacy"})

    def test_restart_reconciles_offline_changes(self) -> None:
        saved = self.store.save("thermal", b"frame", meta={"note": "before"})
        path = Path(saved["path"])
        path.with_suffix(".json").write_text('{"note": "after"}')
        restored = SnapshotStore(self.root)
        self.assertEqual(restored.list_recent()[0]["meta"]["note"], "after")
        path.unlink()
        restored = SnapshotStore(self.root)
        self.assertEqual(restored.summary()["count"], 0)

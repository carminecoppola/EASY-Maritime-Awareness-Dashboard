from __future__ import annotations

"""Validate and package session manifests for reproducible fine-tuning."""

import hashlib
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict

from runtime_support import atomic_write_json, utc_now_iso


class DatasetExporter:
    def __init__(self, *, session_manager: Any, export_root: Path | str) -> None:
        self.session_manager = session_manager
        self.export_root = Path(export_root)
        self.export_root.mkdir(parents=True, exist_ok=True)
        self._last_export: Dict[str, Any] | None = None

    @staticmethod
    def _split_for(sample_id: str, validation_percent: int) -> str:
        bucket = int(hashlib.sha256(sample_id.encode("utf-8")).hexdigest()[:8], 16) % 100
        return "validation" if bucket < validation_percent else "train"

    def validate(self, session_id: str | None = None) -> Dict[str, Any]:
        manifest = self.session_manager.read_manifest(session_id)
        if not manifest.get("ok"):
            return {"ok": False, "error": manifest.get("error") or "Manifest non disponibile", "samples": []}

        grouped: Dict[str, list[Dict[str, Any]]] = {}
        excluded: list[Dict[str, Any]] = []
        for item in manifest.get("items", []):
            if item.get("kind") != "snapshot":
                continue
            sample_id = str(item.get("sample_id") or "")
            path = Path(str(item.get("path") or ""))
            if not sample_id or not item.get("usable", True) or not path.is_file():
                excluded.append(
                    {
                        "id": item.get("id"),
                        "feed": item.get("feed"),
                        "reason": "not_usable" if not item.get("usable", True) else "missing_file",
                        "path": str(path),
                    }
                )
                continue
            grouped.setdefault(sample_id, []).append(item)

        valid_samples: list[Dict[str, Any]] = []
        incomplete_samples: list[Dict[str, Any]] = []
        for sample_id, items in sorted(grouped.items()):
            modalities = {str(item.get("modality") or "") for item in items}
            feeds = {str(item.get("feed") or "") for item in items}
            sample = {
                "sample_id": sample_id,
                "capture_set_id": next((item.get("capture_set_id") for item in items if item.get("capture_set_id")), None),
                "modalities": sorted(modalities),
                "feeds": sorted(feeds),
                "items": items,
            }
            if {"rgb", "thermal"} <= modalities:
                valid_samples.append(sample)
            else:
                sample["reason"] = "requires_rgb_and_thermal"
                incomplete_samples.append(sample)

        return {
            "ok": True,
            "session_id": manifest.get("session_id"),
            "manifest_path": manifest.get("path"),
            "valid": bool(valid_samples),
            "valid_samples": len(valid_samples),
            "incomplete_samples": len(incomplete_samples),
            "excluded_items": len(excluded),
            "samples": valid_samples,
            "incomplete": incomplete_samples,
            "excluded": excluded,
            "updated_at": utc_now_iso(),
        }

    def export(self, session_id: str | None = None, *, validation_percent: int = 20) -> Dict[str, Any]:
        validation_percent = max(0, min(50, int(validation_percent)))
        report = self.validate(session_id)
        if not report.get("ok") or not report.get("valid"):
            return {**report, "ok": False, "error": report.get("error") or "Nessun campione RGB/termico valido da esportare"}

        resolved_session_id = str(report["session_id"])
        export_id = f"{resolved_session_id}_{time.strftime('%Y%m%d_%H%M%S', time.gmtime())}_{uuid.uuid4().hex[:6]}"
        export_dir = self.export_root / export_id
        exported_samples: list[Dict[str, Any]] = []
        samples = list(report["samples"])
        assigned_splits = [self._split_for(sample["sample_id"], validation_percent) for sample in samples]
        if assigned_splits and "train" not in assigned_splits:
            assigned_splits[0] = "train"

        for sample, split in zip(samples, assigned_splits):
            exported_items = []
            for item in sample["items"]:
                source = Path(str(item["path"]))
                feed = str(item.get("feed") or "unknown")
                target_name = f"{hashlib.sha1(sample['sample_id'].encode('utf-8')).hexdigest()[:12]}_{feed}{source.suffix.lower()}"
                relative = Path("images") / split / feed / target_name
                target = export_dir / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
                exported_items.append(
                    {
                        "feed": feed,
                        "modality": item.get("modality"),
                        "dataset_role": item.get("dataset_role"),
                        "path": relative.as_posix(),
                        "source_manifest_id": item.get("id"),
                    }
                )
            exported_samples.append(
                {
                    "sample_id": sample["sample_id"],
                    "capture_set_id": sample.get("capture_set_id"),
                    "split": split,
                    "items": exported_items,
                    "labels": [],
                }
            )

        counts = {
            "samples": len(exported_samples),
            "train": sum(1 for sample in exported_samples if sample["split"] == "train"),
            "validation": sum(1 for sample in exported_samples if sample["split"] == "validation"),
            "images": sum(len(sample["items"]) for sample in exported_samples),
        }
        dataset_payload = {
            "ok": True,
            "schema": "easy.dataset.export.v1",
            "export_id": export_id,
            "session_id": resolved_session_id,
            "source_manifest_path": report.get("manifest_path"),
            "validation_percent": validation_percent,
            "counts": counts,
            "samples": exported_samples,
            "created_at": utc_now_iso(),
        }
        atomic_write_json(export_dir / "dataset.json", dataset_payload)
        atomic_write_json(export_dir / "validation_report.json", {key: value for key, value in report.items() if key != "samples"})
        archive_path = Path(shutil.make_archive(str(export_dir), "zip", root_dir=export_dir))
        self._last_export = {
            "ok": True,
            "export_id": export_id,
            "session_id": resolved_session_id,
            "path": str(export_dir),
            "archive_path": str(archive_path),
            "counts": counts,
            "created_at": dataset_payload["created_at"],
        }
        return dict(self._last_export)

    def status(self) -> Dict[str, Any]:
        return {"ok": True, "export_root": str(self.export_root), "last_export": self._last_export, "updated_at": utc_now_iso()}

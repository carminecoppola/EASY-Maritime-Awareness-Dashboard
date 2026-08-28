from __future__ import annotations

import json
import io
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import numpy as np
from PIL import Image

from runtime_support import atomic_write_json


PROJECT_ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = PROJECT_ROOT / "runtime"
DEFAULT_CONFIG_CANDIDATES = [
    RUNTIME_ROOT / "config" / "frame_provider_config.yaml",
    RUNTIME_ROOT / "config" / "frame_provider_config.yml",
    RUNTIME_ROOT / "config" / "frame_provider_config.json",
]
FRAME_PROVIDER_STATUS_PATH = RUNTIME_ROOT / "sessions" / "frame_provider_status.json"
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")
SOURCE_TYPES = {
    "REPLAY_IMAGE",
    "REPLAY_FOLDER",
    "REPLAY_VIDEO",
    "RGB_LEFT",
    "RGB_RIGHT",
    "THERMAL",
    "WEBCAM",
    "DATASET",
    "UNKNOWN",
}


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _load_yaml(path: Path) -> dict:
    try:
        import yaml  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            f"PyYAML is not installed, cannot parse {path.name}. "
            "Use frame_provider_config.json or install PyYAML."
        ) from exc
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def load_frame_provider_config(config_path: Path | None = None) -> dict:
    candidates = [config_path] if config_path else list(DEFAULT_CONFIG_CANDIDATES)
    for candidate in candidates:
        if not candidate or not candidate.exists():
            continue
        suffix = candidate.suffix.lower()
        if suffix == ".json":
            config = _load_json(candidate)
        elif suffix in {".yaml", ".yml"}:
            config = _load_yaml(candidate)
        else:
            continue
        config["_loaded_from"] = str(candidate)
        return config
    return {
        "default_source_type": "REPLAY_FOLDER",
        "default_source_path": "runtime/replay/test_inference",
        "loop": True,
        "save_temp_frames": False,
        "_loaded_from": "",
    }


def resolve_project_path(path_value: str | Path | None) -> Path | None:
    if path_value is None:
        return None
    path = Path(path_value)
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def image_paths_from_folder(folder: Path) -> List[Path]:
    if not folder.exists():
        return []
    return [
        path
        for path in sorted(folder.rglob("*"))
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    ]


@dataclass
class FrameObject:
    frame_id: str
    timestamp: str
    source_type: str
    source_name: str
    image_path: Optional[str]
    image: Optional[np.ndarray]
    width: int
    height: int
    metadata: Dict[str, Any]
    session_id: Optional[str] = None
    camera_id: Optional[str] = None
    sequence_id: Optional[str] = None
    frame_index: Optional[int] = None
    thermal_metadata: Optional[Dict[str, Any]] = None
    stereo_metadata: Optional[Dict[str, Any]] = None
    calibration_id: Optional[str] = None

    def to_dict(self, *, include_image: bool = False) -> Dict[str, Any]:
        payload = asdict(self)
        if not include_image:
            payload["image"] = None
        payload["has_image"] = self.image is not None
        return payload


class FrameProviderError(RuntimeError):
    pass


class BaseFrameProvider:
    source_type = "UNKNOWN"

    def __init__(
        self,
        *,
        source_path: str | Path | None = None,
        source_name: str | None = None,
        loop: bool = False,
        save_temp_frames: bool = False,
    ) -> None:
        self.source_path = resolve_project_path(source_path)
        self.source_name = source_name or (Path(source_path).name if source_path else self.source_type)
        self.loop = bool(loop)
        self.save_temp_frames = bool(save_temp_frames)
        self._last_frame: FrameObject | None = None
        self._last_error = ""
        self._lock = threading.RLock()

    def reset(self) -> Dict[str, Any]:
        with self._lock:
            self._last_frame = None
            self._last_error = ""
        return self.status()

    def next_frame(self, *, session_id: str | None = None) -> FrameObject:
        raise NotImplementedError

    def _build_frame(
        self,
        *,
        image: np.ndarray,
        image_path: Path | None,
        metadata: Dict[str, Any] | None = None,
        session_id: str | None = None,
        frame_index: int | None = None,
        sequence_id: str | None = None,
        camera_id: str | None = None,
    ) -> FrameObject:
        h, w = image.shape[:2]
        frame = FrameObject(
            frame_id=f"frame-{uuid.uuid4().hex[:12]}",
            timestamp=utc_now_iso(),
            source_type=self.source_type,
            source_name=self.source_name,
            image_path=str(image_path) if image_path else None,
            image=image,
            width=int(w),
            height=int(h),
            metadata=metadata or {},
            session_id=session_id,
            camera_id=camera_id,
            sequence_id=sequence_id,
            frame_index=frame_index,
            thermal_metadata=None,
            stereo_metadata=None,
            calibration_id=None,
        )
        with self._lock:
            self._last_frame = frame
            self._last_error = ""
        return frame

    def status(self) -> Dict[str, Any]:
        with self._lock:
            last = self._last_frame.to_dict() if self._last_frame else None
            return {
                "ok": not bool(self._last_error),
                "provider": self.__class__.__name__,
                "source_type": self.source_type,
                "source_name": self.source_name,
                "source_path": str(self.source_path) if self.source_path else None,
                "loop": self.loop,
                "save_temp_frames": self.save_temp_frames,
                "last_frame": last,
                "current_frame_id": last.get("frame_id") if last else None,
                "current_frame_index": last.get("frame_index") if last else None,
                "error": self._last_error,
                "updated_at": utc_now_iso(),
            }


class ImageFrameProvider(BaseFrameProvider):
    source_type = "REPLAY_IMAGE"

    def next_frame(self, *, session_id: str | None = None) -> FrameObject:
        if self.source_path is None:
            raise FrameProviderError("ImageFrameProvider requires source_path")
        if not self.source_path.exists():
            raise FrameProviderError(f"Input image not found: {self.source_path}")
        image = np.asarray(Image.open(self.source_path).convert("RGB"))
        return self._build_frame(
            image=image,
            image_path=self.source_path,
            metadata={"provider": "ImageFrameProvider"},
            session_id=session_id,
            frame_index=0,
            sequence_id=self.source_path.name,
        )


class FolderFrameProvider(BaseFrameProvider):
    source_type = "REPLAY_FOLDER"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._images = image_paths_from_folder(self.source_path) if self.source_path else []
        self._index = 0

    def reset(self) -> Dict[str, Any]:
        with self._lock:
            self._images = image_paths_from_folder(self.source_path) if self.source_path else []
            self._index = 0
        return super().reset()

    def next_frame(self, *, session_id: str | None = None) -> FrameObject:
        if self.source_path is None:
            raise FrameProviderError("FolderFrameProvider requires source_path")
        self._images = image_paths_from_folder(self.source_path)
        if not self._images:
            raise FrameProviderError(f"No images found in folder: {self.source_path}")
        if self._index >= len(self._images):
            if not self.loop:
                raise FrameProviderError("No more frames available in folder provider")
            self._index = 0
        image_path = self._images[self._index]
        image = np.asarray(Image.open(image_path).convert("RGB"))
        frame = self._build_frame(
            image=image,
            image_path=image_path,
            metadata={"provider": "FolderFrameProvider", "total_frames": len(self._images)},
            session_id=session_id,
            frame_index=self._index,
            sequence_id=image_path.parent.name,
        )
        self._index += 1
        return frame

    def status(self) -> Dict[str, Any]:
        payload = super().status()
        payload["total_frames"] = len(self._images)
        payload["next_frame_index"] = self._index
        return payload


class VideoFrameProvider(BaseFrameProvider):
    source_type = "REPLAY_VIDEO"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._capture: Any | None = None
        self._frame_index = 0
        self._total_frames: int | None = None

    def _open_capture(self) -> None:
        if self._capture is not None:
            return
        if self.source_path is None:
            raise FrameProviderError("VideoFrameProvider requires source_path")
        try:
            import cv2  # type: ignore
        except ImportError as exc:
            raise FrameProviderError("OpenCV is not installed, video provider unavailable") from exc
        capture = cv2.VideoCapture(str(self.source_path))
        if not capture or not capture.isOpened():
            raise FrameProviderError(f"Unable to open video source: {self.source_path}")
        total = int(capture.get(getattr(cv2, "CAP_PROP_FRAME_COUNT", 7)) or 0)
        self._capture = capture
        self._total_frames = total if total > 0 else None

    def reset(self) -> Dict[str, Any]:
        with self._lock:
            if self._capture is not None:
                try:
                    self._capture.release()
                except Exception:
                    pass
            self._capture = None
            self._frame_index = 0
            self._total_frames = None
        return super().reset()

    def next_frame(self, *, session_id: str | None = None) -> FrameObject:
        self._open_capture()
        capture = self._capture
        if capture is None:
            raise FrameProviderError("Video capture unavailable")
        ok, frame = capture.read()
        if not ok or frame is None:
            if not self.loop:
                raise FrameProviderError("No more frames available in video provider")
            self.reset()
            self._open_capture()
            capture = self._capture
            if capture is None:
                raise FrameProviderError("Video capture unavailable after reset")
            ok, frame = capture.read()
            if not ok or frame is None:
                raise FrameProviderError(f"Unable to read first frame from video: {self.source_path}")
        try:
            import cv2  # type: ignore
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        except Exception as exc:  # pragma: no cover
            raise FrameProviderError(f"Unable to decode video frame: {exc}") from exc
        image_path = None
        metadata: Dict[str, Any] = {
            "provider": "VideoFrameProvider",
            "total_frames": self._total_frames,
        }
        if self.save_temp_frames:
            temp_dir = RUNTIME_ROOT / "sessions" / "frame_provider_temp"
            temp_dir.mkdir(parents=True, exist_ok=True)
            image_path = temp_dir / f"video_frame_{self._frame_index:06d}.jpg"
            Image.fromarray(rgb).save(image_path, quality=92)
            metadata["temp_frame"] = True
        frame_obj = self._build_frame(
            image=rgb,
            image_path=image_path,
            metadata=metadata,
            session_id=session_id,
            frame_index=self._frame_index,
            sequence_id=self.source_path.name if self.source_path else "video",
        )
        self._frame_index += 1
        return frame_obj

    def status(self) -> Dict[str, Any]:
        payload = super().status()
        payload["total_frames"] = self._total_frames
        payload["next_frame_index"] = self._frame_index
        return payload


class CameraFrameProvider(BaseFrameProvider):
    def __init__(self, *, source_type: str = "UNKNOWN", **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.source_type = source_type if source_type in SOURCE_TYPES else "UNKNOWN"

    def next_frame(self, *, session_id: str | None = None) -> FrameObject:
        camera_label = self.source_name or self.source_type
        raise FrameProviderError(f"Camera provider placeholder for {camera_label} is not available in this phase")


class LiveCallbackFrameProvider(BaseFrameProvider):
    """Read a frame from the runtime that already owns the physical camera."""

    def __init__(self, *, source_type: str, frame_supplier: Callable[[], tuple[bytes, bool]], **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.source_type = source_type
        self.frame_supplier = frame_supplier
        self._frame_index = 0

    def next_frame(self, *, session_id: str | None = None) -> FrameObject:
        jpeg_bytes, usable = self.frame_supplier()
        if not usable:
            raise FrameProviderError(f"Live source {self.source_name} is not delivering a usable frame")
        try:
            image = np.asarray(Image.open(io.BytesIO(jpeg_bytes)).convert("RGB"))
        except Exception as exc:
            raise FrameProviderError(f"Unable to decode live frame from {self.source_name}: {exc}") from exc
        frame = self._build_frame(
            image=image,
            image_path=None,
            metadata={"provider": "LiveCallbackFrameProvider", "live": True},
            session_id=session_id,
            frame_index=self._frame_index,
            sequence_id=self.source_name,
            camera_id=self.source_type.lower(),
        )
        self._frame_index += 1
        return frame


class FrameProviderFactory:
    @staticmethod
    def normalize_source_type(source_type: str | None) -> str:
        candidate = str(source_type or "UNKNOWN").strip().upper()
        return candidate if candidate in SOURCE_TYPES else "UNKNOWN"

    @classmethod
    def create(
        cls,
        *,
        source_type: str | None,
        source_path: str | Path | None = None,
        source_name: str | None = None,
        loop: bool = False,
        save_temp_frames: bool = False,
    ) -> BaseFrameProvider:
        normalized = cls.normalize_source_type(source_type)
        common = {
            "source_path": source_path,
            "source_name": source_name,
            "loop": loop,
            "save_temp_frames": save_temp_frames,
        }
        if normalized == "REPLAY_IMAGE":
            return ImageFrameProvider(**common)
        if normalized in {"REPLAY_FOLDER", "DATASET"}:
            return FolderFrameProvider(**common)
        if normalized == "REPLAY_VIDEO":
            return VideoFrameProvider(**common)
        if normalized in {"RGB_LEFT", "RGB_RIGHT", "THERMAL", "WEBCAM"}:
            return CameraFrameProvider(source_type=normalized, **common)
        return CameraFrameProvider(source_type="UNKNOWN", **common)


class UnifiedFrameProvider:
    def __init__(self, config_path: Path | None = None) -> None:
        self.config_path = config_path
        self.config = load_frame_provider_config(config_path)
        self._lock = threading.RLock()
        self.provider = FrameProviderFactory.create(
            source_type=self.config.get("default_source_type"),
            source_path=self.config.get("default_source_path"),
            loop=bool(self.config.get("loop", True)),
            save_temp_frames=bool(self.config.get("save_temp_frames", False)),
        )
        self._last_error = ""
        self._live_sources: Dict[str, tuple[str, Callable[[], tuple[bytes, bool]]]] = {}
        self._persist_status()

    def register_live_source(
        self,
        source_type: str,
        source_name: str,
        frame_supplier: Callable[[], tuple[bytes, bool]],
    ) -> None:
        normalized = FrameProviderFactory.normalize_source_type(source_type)
        if normalized not in {"RGB_LEFT", "RGB_RIGHT", "THERMAL"}:
            raise ValueError(f"Unsupported live source type: {source_type}")
        with self._lock:
            self._live_sources[normalized] = (source_name, frame_supplier)

    def configure_live_source(self, source_type: str) -> Dict[str, Any]:
        normalized = FrameProviderFactory.normalize_source_type(source_type)
        with self._lock:
            registered = self._live_sources.get(normalized)
            if not registered:
                raise FrameProviderError(f"Live source is not registered: {normalized}")
            source_name, supplier = registered
            self.provider = LiveCallbackFrameProvider(
                source_type=normalized,
                source_name=source_name,
                frame_supplier=supplier,
                loop=True,
                save_temp_frames=False,
            )
            self._last_error = ""
            self._persist_status()
            return self.status()

    def _persist_status(self) -> None:
        atomic_write_json(FRAME_PROVIDER_STATUS_PATH, self.status())

    def configure(
        self,
        *,
        source_type: str | None,
        source_path: str | Path | None = None,
        source_name: str | None = None,
        loop: bool | None = None,
        save_temp_frames: bool | None = None,
    ) -> Dict[str, Any]:
        with self._lock:
            self.provider = FrameProviderFactory.create(
                source_type=source_type,
                source_path=source_path,
                source_name=source_name,
                loop=bool(self.config.get("loop", True) if loop is None else loop),
                save_temp_frames=bool(self.config.get("save_temp_frames", False) if save_temp_frames is None else save_temp_frames),
            )
            self._last_error = ""
            self._persist_status()
            return self.status()

    def next_frame(self, *, session_id: str | None = None) -> FrameObject:
        with self._lock:
            try:
                frame = self.provider.next_frame(session_id=session_id)
                self._last_error = ""
                return frame
            except Exception as exc:
                self._last_error = str(exc)
                raise

    def reset(self) -> Dict[str, Any]:
        with self._lock:
            payload = self.provider.reset()
            self._last_error = ""
            return payload

    def status(self) -> Dict[str, Any]:
        with self._lock:
            provider_payload = self.provider.status()
            provider_payload.update(
                {
                    "ok": provider_payload.get("ok", True) and not bool(self._last_error),
                    "error": self._last_error or provider_payload.get("error", ""),
                    "config_path": str(self.config_path or self.config.get("_loaded_from", "")),
                    "default_source_type": FrameProviderFactory.normalize_source_type(self.config.get("default_source_type")),
                    "default_source_path": str(resolve_project_path(self.config.get("default_source_path"))) if self.config.get("default_source_path") else None,
                }
            )
            return provider_payload

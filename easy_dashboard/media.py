from __future__ import annotations

import io
from typing import Any, Dict

from PIL import Image, ImageDraw


_RESAMPLE = getattr(Image, "Resampling", Image)
RESAMPLE_BICUBIC = getattr(_RESAMPLE, "BICUBIC", Image.BICUBIC)
RESAMPLE_NEAREST = getattr(_RESAMPLE, "NEAREST", Image.NEAREST)


def draw_rounded_box(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, *, fill=None, outline=None, width: int = 1) -> None:
    if hasattr(draw, "rounded_rectangle"):
        draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
    else:
        draw.rectangle(box, fill=fill, outline=outline, width=width)


def build_placeholder_svg(title: str, subtitle: str, accent: str = "#26d0b2") -> bytes:
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 480" role="img" aria-label="{title}">
  <rect width="1280" height="480" rx="28" fill="#08111b"/>
  <rect x="40" y="40" width="1200" height="400" rx="24" fill="#13212d" stroke="#21465d" stroke-width="2"/>
  <rect x="80" y="275" width="1120" height="24" rx="12" fill="#ffffff"/>
  <rect x="80" y="275" width="760" height="24" rx="12" fill="{accent}"/>
  <text x="80" y="140" fill="#f4f8fb" font-family="DejaVu Sans, Arial, sans-serif" font-size="44" font-weight="700">{title}</text>
  <text x="80" y="208" fill="#9bb2c2" font-family="DejaVu Sans, Arial, sans-serif" font-size="28">{subtitle}</text>
  <text x="80" y="348" fill="#9bb2c2" font-family="DejaVu Sans, Arial, sans-serif" font-size="24">EASY Maritime Awareness</text>
</svg>"""
    return svg.encode("utf-8")


def make_thermal_svg(stats: Dict[str, Any]) -> bytes:
    matrix = stats.get("matrix") or [[24.0 for _ in range(16)] for _ in range(12)]
    min_t = float(stats.get("min_c", 24.0))
    max_t = float(stats.get("max_c", 31.0))
    avg_t = float(stats.get("avg_c", 27.0))
    anomaly_active = bool(stats.get("anomaly_active"))
    threshold = float(stats.get("threshold_celsius", 35.0))
    hot_cells = stats.get("hot_cells") or []
    badge_fill = "#ff7a7a" if anomaly_active else "#26d0b2"
    badge_text = "ANOMALIA TERMICA" if anomaly_active else "NELLA SOGLIA"
    rects = []
    cell_w = 1280 / 16.0
    cell_h = 360 / 12.0
    span = max(0.1, max_t - min_t)
    for y, row in enumerate(matrix):
        for x, value in enumerate(row):
            normalized = max(0.0, min(1.0, (float(value) - min_t) / span))
            r = int(normalized * 255)
            g = int(max(0.0, 1.0 - abs(normalized - 0.55) * 1.6) * 255)
            b = int((1.0 - normalized) * 220 + 15)
            rects.append(
                f'<rect x="{x * cell_w:.2f}" y="{y * cell_h:.2f}" width="{cell_w:.2f}" height="{cell_h:.2f}" '
                f'fill="rgb({r},{g},{b})" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>'
            )
    for cell in hot_cells:
        try:
            x = int(cell["x"])
            y = int(cell["y"])
        except Exception:
            continue
        rects.append(
            f'<rect x="{x * cell_w + 2:.2f}" y="{y * cell_h + 2:.2f}" width="{cell_w - 4:.2f}" height="{cell_h - 4:.2f}" '
            f'rx="12" fill="none" stroke="{badge_fill}" stroke-width="4"/>'
        )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 480" role="img" aria-label="Thermal preview">
  <rect width="1280" height="480" rx="28" fill="#08111b"/>
  {''.join(rects)}
  <rect x="10" y="10" width="220" height="32" rx="16" fill="{badge_fill}" opacity="0.9"/>
  <text x="22" y="32" fill="#051018" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="700">{badge_text}</text>
  <rect x="10" y="308" width="620" height="42" rx="12" fill="rgba(0,0,0,0.50)"/>
  <text x="24" y="333" fill="#f4f8fb" font-family="DejaVu Sans, Arial, sans-serif" font-size="14">
    min {min_t:.1f} C | avg {avg_t:.1f} C | max {max_t:.1f} C | threshold {threshold:.1f} C
  </text>
</svg>"""
    return svg.encode("utf-8")


def make_placeholder_jpeg(title: str, subtitle: str, accent: str = "#26d0b2") -> bytes:
    image = Image.new("RGB", (1280, 480), (9, 17, 26))
    draw = ImageDraw.Draw(image)
    draw_rounded_box(draw, (40, 40, 1240, 440), radius=24, fill=(20, 34, 46), outline=(33, 70, 93), width=2)
    draw_rounded_box(draw, (80, 275, 1200, 297), radius=11, fill=(255, 255, 255))
    draw_rounded_box(draw, (80, 275, 840, 297), radius=11, fill=(38, 208, 178) if accent == "#26d0b2" else (255, 122, 122))
    draw.text((80, 110), title, fill=(244, 248, 251))
    draw.text((80, 178), subtitle, fill=(155, 178, 194))
    draw.text((80, 345), "EASY Maritime Awareness", fill=(155, 178, 194))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=90)
    return out.getvalue()


def multipart_frame(jpeg_bytes: bytes) -> bytes:
    return b"--frame\r\nContent-Type: image/jpeg\r\nCache-Control: no-cache\r\n\r\n" + jpeg_bytes + b"\r\n"

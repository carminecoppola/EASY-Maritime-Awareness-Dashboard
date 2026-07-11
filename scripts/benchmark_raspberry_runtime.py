#!/usr/bin/env python3
"""Measure dashboard API and inference latency without changing sessions."""

from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.error
import urllib.request


def request_json(url: str, *, method: str = "GET") -> tuple[dict, float]:
    request = urllib.request.Request(url, method=method, headers={"Content-Type": "application/json"})
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload, (time.perf_counter() - started) * 1000


def summary(values: list[float]) -> dict:
    ordered = sorted(values)
    return {"runs": len(values), "min_ms": round(min(values), 1), "median_ms": round(statistics.median(values), 1), "p95_ms": round(ordered[max(0, int(len(ordered) * 0.95) - 1)], 1), "max_ms": round(max(values), 1)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:5000")
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--inference", action="store_true", help="also run inference on the selected source")
    args = parser.parse_args()
    runs = max(1, min(100, args.runs))
    report = {"url": args.url, "health_ms": [], "inference_ms": [], "errors": []}
    for _ in range(runs):
        try:
            payload, elapsed = request_json(f"{args.url}/health")
            if not payload.get("ok"):
                raise RuntimeError("health returned ok=false")
            report["health_ms"].append(elapsed)
            if args.inference:
                result, inference_elapsed = request_json(f"{args.url}/api/inference/run-on-next-frame", method="POST")
                if not result.get("ok"):
                    raise RuntimeError(result.get("error") or "inference failed")
                report["inference_ms"].append(inference_elapsed)
        except (OSError, ValueError, RuntimeError, urllib.error.HTTPError) as exc:
            report["errors"].append(str(exc))
    output = {"ok": not report["errors"], "requested_runs": runs, "successful_health_runs": len(report["health_ms"]), "health": summary(report["health_ms"]) if report["health_ms"] else None, "inference": summary(report["inference_ms"]) if report["inference_ms"] else None, "errors": report["errors"]}
    print(json.dumps(output, indent=2))
    return 0 if output["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

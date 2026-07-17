#!/usr/bin/env python3
from __future__ import annotations

"""Run the reproducible EASY Raspberry Pi runtime characterization."""

import argparse
import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from easy_dashboard.runtime_benchmark import BenchmarkRunner, DEFAULT_API_PATHS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Measure EASY runtime resources, startup, API latency, inference timing and source FPS."
    )
    parser.add_argument("--url", default="http://127.0.0.1:5000")
    parser.add_argument("--service-name", default="easy-dashboard.service")
    parser.add_argument("--pid", type=int, default=0, help="Observe this PID instead of resolving systemd MainPID")
    parser.add_argument("--output-dir", default=str(PROJECT_ROOT / "runtime/benchmarks"))
    parser.add_argument("--run-id", help="Stable identifier for this experimental run")
    parser.add_argument("--duration", type=float, default=300.0, help="Steady-state sampling duration in seconds")
    parser.add_argument("--interval", type=float, default=2.0, help="Resource sampling interval in seconds")
    parser.add_argument("--warmup-seconds", type=float, default=30.0)
    parser.add_argument("--startup-runs", type=int, default=0, help="Explicit service stop/start repetitions")
    parser.add_argument("--startup-timeout", type=float, default=45.0)
    parser.add_argument("--startup-cooldown", type=float, default=3.0)
    parser.add_argument("--api-runs", "--runs", dest="api_runs", type=int, default=30)
    parser.add_argument("--api-paths", nargs="+", default=list(DEFAULT_API_PATHS))
    parser.add_argument("--request-delay", type=float, default=0.2)
    parser.add_argument("--inference-runs", type=int, default=10)
    parser.add_argument("--inference", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--inference-delay", type=float, default=0.5)
    parser.add_argument("--http-timeout", type=float, default=60.0)
    parser.add_argument("--stop-temperature-limit", type=float, default=78.0)
    parser.add_argument(
        "--allow-unhealthy",
        action="store_true",
        help="Allow collection when /health is false (engineering diagnostics only, not the paper protocol)",
    )
    args = parser.parse_args()
    if args.duration <= 0 or args.interval <= 0 or args.api_runs < 1 or args.startup_runs < 0 or args.inference_runs < 0:
        parser.error("duration/interval/api-runs must be positive; startup/inference runs cannot be negative")
    if args.pid and args.startup_runs:
        parser.error("--pid cannot be combined with --startup-runs")
    return args


def main() -> int:
    args = parse_args()
    try:
        runner = BenchmarkRunner(args, PROJECT_ROOT)
        summary = runner.run()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2), file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "ok": summary.get("ok"),
                "run_id": summary.get("run_id"),
                "output_dir": str(runner.output_dir),
                "samples": summary.get("sample_count"),
                "errors": summary.get("errors"),
            },
            indent=2,
        )
    )
    return 0 if summary.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())

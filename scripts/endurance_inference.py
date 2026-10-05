#!/usr/bin/env python3
# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Continuous-inference endurance run.

Issues inference requests back to back for a fixed duration and samples the
runtime while it does so, to answer a single question: does the node keep
working, and does anything grow or overheat while it does?

It is deliberately separate from scripts/benchmark_raspberry_runtime.py: that
one characterises a quiet, repeatable request path, this one keeps the load on
and watches for drift. Results are not comparable and must not be mixed.

    ./.venv/bin/python scripts/endurance_inference.py --minutes 120

Writes runtime/benchmarks/<run-id>/{requests.csv,samples.csv,summary.json}.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request

RUNTIME = Path(__file__).resolve().parent.parent / "runtime" / "benchmarks"


def now() -> str:
    """Current UTC time as an ISO string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def vcgencmd(arg: str) -> str:
    """Run ``vcgencmd`` with one argument and return its output."""
    try:
        return subprocess.run(["vcgencmd", arg], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        return ""


def temperature_c() -> float | None:
    """CPU temperature in Celsius, or None."""
    m = re.search(r"([\d.]+)", vcgencmd("measure_temp"))
    return float(m.group(1)) if m else None


def throttled_flags() -> dict:
    """Decode ``vcgencmd get_throttled`` into named flags."""
    m = re.search(r"0x([0-9a-fA-F]+)", vcgencmd("get_throttled"))
    v = int(m.group(1), 16) if m else 0
    return {
        "raw": f"0x{v:x}",
        "undervoltage_now": bool(v & 0x1),
        "throttled_now": bool(v & 0x4),
        "undervoltage_occurred": bool(v & 0x10000),
        "throttled_occurred": bool(v & 0x40000),
    }


def main_pid(service: str) -> int:
    """Main PID of a systemd service."""
    out = subprocess.run(["systemctl", "show", "-p", "MainPID", "--value", service], capture_output=True, text=True)
    try:
        return int(out.stdout.strip())
    except ValueError:
        return 0


def process_tree_rss_mb(pid: int) -> float | None:
    """Resident memory of a process and its children, in MB."""
    if not pid:
        return None
    try:
        import psutil
    except ImportError:
        return None
    try:
        p = psutil.Process(pid)
        procs = [p, *p.children(recursive=True)]
        return sum(x.memory_info().rss for x in procs) / (1024 * 1024)
    except Exception:
        return None


def post(url: str, timeout: float) -> tuple[int, float, str]:
    """POST to an endpoint; returns status, latency in ms and the body."""
    started = time.perf_counter()
    req = request.Request(url, data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            resp.read()
            return resp.status, (time.perf_counter() - started) * 1000, ""
    except error.HTTPError as exc:
        return exc.code, (time.perf_counter() - started) * 1000, exc.reason or "http error"
    except Exception as exc:  # noqa: BLE001 - any failure is a result here
        return 0, (time.perf_counter() - started) * 1000, str(exc)


def main() -> int:
    """Run the endurance loop and write the log."""
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://127.0.0.1:5000")
    ap.add_argument("--minutes", type=float, default=120.0)
    ap.add_argument("--delay", type=float, default=0.5, help="pause between requests, seconds")
    ap.add_argument("--sample-interval", type=float, default=30.0)
    ap.add_argument("--service-name", default="easy-dashboard.service")
    ap.add_argument("--http-timeout", type=float, default=60.0)
    ap.add_argument("--stop-temperature-limit", type=float, default=78.0)
    ap.add_argument("--run-id", default=None)
    args = ap.parse_args()

    run_id = args.run_id or f"endurance-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    out = RUNTIME / run_id
    out.mkdir(parents=True, exist_ok=True)
    pid = main_pid(args.service_name)

    requests_csv = out / "requests.csv"
    samples_csv = out / "samples.csv"
    requests_csv.write_text("index,timestamp,status,latency_ms,error\n")
    samples_csv.write_text("timestamp,elapsed_s,requests,errors,temperature_c,rss_mb,throttled_raw,undervoltage_now,throttled_now\n")

    deadline = time.monotonic() + args.minutes * 60
    next_sample = time.monotonic()
    count = errors = 0
    latencies: list[float] = []
    temps: list[float] = []
    rss: list[float] = []
    started_at = now()
    start = time.monotonic()
    aborted = None

    while time.monotonic() < deadline:
        status, ms, err = post(f"{args.url}/api/inference/run-on-next-frame", args.http_timeout)
        count += 1
        ok = status == 200 and not err
        if not ok:
            errors += 1
        latencies.append(ms)
        with requests_csv.open("a") as fh:
            fh.write(f"{count},{now()},{status},{ms:.1f},{err.replace(',', ';')}\n")

        if time.monotonic() >= next_sample:
            t = temperature_c()
            r = process_tree_rss_mb(pid)
            flags = throttled_flags()
            if t is not None:
                temps.append(t)
            if r is not None:
                rss.append(r)
            with samples_csv.open("a") as fh:
                fh.write(
                    f"{now()},{time.monotonic() - start:.0f},{count},{errors},"
                    f"{'' if t is None else f'{t:.1f}'},{'' if r is None else f'{r:.1f}'},"
                    f"{flags['raw']},{int(flags['undervoltage_now'])},{int(flags['throttled_now'])}\n"
                )
            if t is not None and t >= args.stop_temperature_limit:
                aborted = f"temperature {t:.1f} C reached the {args.stop_temperature_limit} C limit"
                break
            next_sample += args.sample_interval

        time.sleep(args.delay)

    latencies.sort()

    def pct(p: float) -> float | None:
        """Latency percentile in ms (nearest rank), or None without samples."""
        if not latencies:
            return None
        k = max(1, int(round(p / 100 * len(latencies)))) - 1
        return latencies[k]

    summary = {
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": now(),
        "aborted": aborted,
        "duration_minutes": (time.monotonic() - start) / 60,
        "requests": count,
        "errors": errors,
        "latency_ms": {
            "mean": sum(latencies) / len(latencies) if latencies else None,
            "median": pct(50),
            "p95": pct(95),
            "max": latencies[-1] if latencies else None,
        },
        "temperature_c": {"min": min(temps, default=None), "max": max(temps, default=None),
                          "mean": sum(temps) / len(temps) if temps else None},
        "rss_mb": {"first": rss[0] if rss else None, "last": rss[-1] if rss else None,
                   "max": max(rss, default=None)},
        "throttled_end": throttled_flags(),
        "parameters": vars(args),
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 1 if (errors or aborted) else 0


if __name__ == "__main__":
    raise SystemExit(main())

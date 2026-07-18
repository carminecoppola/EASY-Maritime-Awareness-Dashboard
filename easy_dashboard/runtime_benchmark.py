from __future__ import annotations

"""Scientific runtime measurements for EASY on Raspberry Pi.

The collector is intentionally external to Flask. It observes the running
service through its public API and the operating system, so enabling the
benchmark does not change the dashboard runtime or its hardware ownership.
"""

import csv
import hashlib
import json
import math
import os
import platform
import shutil
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import psutil


DEFAULT_API_PATHS = (
    "/health",
    "/api/stream-state",
    "/api/inference/status",
    "/api/system/components",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def percentile(values: Sequence[float], percentile_value: float) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(float(value) for value in values)
    rank = max(0, math.ceil((percentile_value / 100.0) * len(ordered)) - 1)
    return ordered[min(rank, len(ordered) - 1)]


def numeric_summary(values: Iterable[Any]) -> Dict[str, Any]:
    numbers = []
    for value in values:
        if value is None:
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            numbers.append(number)
    if not numbers:
        return {"count": 0, "min": None, "mean": None, "median": None, "p95": None, "max": None, "stddev": None}
    return {
        "count": len(numbers),
        "min": round(min(numbers), 3),
        "mean": round(statistics.fmean(numbers), 3),
        "median": round(statistics.median(numbers), 3),
        "p95": round(float(percentile(numbers, 95) or 0.0), 3),
        "max": round(max(numbers), 3),
        "stddev": round(statistics.pstdev(numbers), 3),
    }


def latex_escape(value: Any) -> str:
    text = str(value)
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
    }
    return "".join(replacements.get(character, character) for character in text)


def sha256_file(path: Path) -> Optional[str]:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run_command(command: Sequence[str], timeout: float = 10.0) -> Dict[str, Any]:
    try:
        completed = subprocess.run(list(command), capture_output=True, text=True, timeout=timeout, check=False)
        return {
            "command": list(command),
            "returncode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"command": list(command), "returncode": None, "stdout": "", "stderr": str(exc)}


def read_cpu_temperature() -> Optional[float]:
    thermal_path = Path("/sys/class/thermal/thermal_zone0/temp")
    try:
        if thermal_path.is_file():
            return round(float(thermal_path.read_text(encoding="utf-8").strip()) / 1000.0, 2)
    except (OSError, ValueError):
        pass
    result = run_command(["vcgencmd", "measure_temp"], timeout=3)
    output = result.get("stdout") or ""
    try:
        return float(output.split("=")[-1].split("'")[0])
    except (ValueError, IndexError):
        return None


class HttpClient:
    def __init__(self, base_url: str, timeout: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def request(self, path: str, method: str = "GET") -> Tuple[Dict[str, Any], float, int, int]:
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            method=method,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = response.read()
                elapsed_ms = (time.perf_counter() - started) * 1000.0
                payload = json.loads(body.decode("utf-8"))
                if not isinstance(payload, dict):
                    raise RuntimeError(f"{path} returned a non-object JSON payload")
                return payload, elapsed_ms, int(response.status), len(body)
        except urllib.error.HTTPError as exc:
            body = exc.read()
            try:
                payload = json.loads(body.decode("utf-8"))
                detail = payload.get("error") or payload.get("message") or body.decode("utf-8", errors="replace")
            except (ValueError, AttributeError):
                detail = body.decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code} from {path}: {detail or exc.reason}") from exc


class ProcessTreeSampler:
    """Calculate CPU and RSS for the systemd service process tree."""

    def __init__(self, pid: int) -> None:
        self.pid = int(pid)
        self.previous_cpu_seconds: Optional[float] = None
        self.previous_timestamp: Optional[float] = None

    def _processes(self) -> List[psutil.Process]:
        try:
            root = psutil.Process(self.pid)
            return [root] + root.children(recursive=True)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return []

    def sample(self, timestamp: float) -> Dict[str, Any]:
        cpu_seconds = 0.0
        rss_bytes = 0
        process_count = 0
        for process in self._processes():
            try:
                cpu_times = process.cpu_times()
                cpu_seconds += float(cpu_times.user + cpu_times.system)
                rss_bytes += int(process.memory_info().rss)
                process_count += 1
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        if process_count == 0:
            self.previous_cpu_seconds = None
            self.previous_timestamp = None
            return {
                "easy_pid": self.pid,
                "easy_process_count": 0,
                "easy_cpu_percent": None,
                "easy_rss_mb": None,
            }
        cpu_percent = None
        if self.previous_cpu_seconds is not None and self.previous_timestamp is not None:
            elapsed = timestamp - self.previous_timestamp
            if elapsed > 0:
                # Process CPU follows top/ps semantics: 100% is one fully used core.
                cpu_percent = max(0.0, (cpu_seconds - self.previous_cpu_seconds) / elapsed * 100.0)
        self.previous_cpu_seconds = cpu_seconds
        self.previous_timestamp = timestamp
        return {
            "easy_pid": self.pid,
            "easy_process_count": process_count,
            "easy_cpu_percent": None if cpu_percent is None else round(cpu_percent, 3),
            "easy_rss_mb": round(rss_bytes / 1024.0 / 1024.0, 3),
        }


def extract_runtime_fields(
    stream_payload: Dict[str, Any],
    inference_payload: Dict[str, Any],
    thermal_payload: Dict[str, Any],
    components_payload: Dict[str, Any],
) -> Dict[str, Any]:
    left = (stream_payload.get("rgb_left") or {}).get("state") or {}
    right = (stream_payload.get("rgb_right") or {}).get("state") or {}
    thermal_runtime = thermal_payload.get("runtime_state") or {}
    components = components_payload.get("components")
    component_states = {}
    if isinstance(components, list):
        for value in components:
            if not isinstance(value, dict):
                continue
            name = value.get("name") or value.get("id") or value.get("component")
            if name:
                component_states[str(name)] = value.get("state") or value.get("status") or value.get("availability")
    elif isinstance(components, dict):
        for name, value in components.items():
            if isinstance(value, dict):
                component_states[str(name)] = value.get("state") or value.get("status") or value.get("availability")
            else:
                component_states[str(name)] = value
    return {
        "rgb_left_fps": left.get("fps"),
        "rgb_right_fps": right.get("fps"),
        "rgb_left_detected": left.get("detected"),
        "rgb_right_detected": right.get("detected"),
        "rgb_left_has_frame": left.get("has_frame"),
        "rgb_right_has_frame": right.get("has_frame"),
        "thermal_status": thermal_payload.get("status"),
        "thermal_availability": thermal_runtime.get("availability"),
        "thermal_frame_seq": thermal_payload.get("frame_seq"),
        "inference_running": inference_payload.get("running"),
        "inference_backend": inference_payload.get("backend"),
        "last_inference_ms": inference_payload.get("last_inference_ms"),
        "inference_fps": inference_payload.get("fps"),
        "component_states": component_states,
    }


class BenchmarkRunner:
    def __init__(self, args: Any, project_root: Path) -> None:
        self.args = args
        self.project_root = project_root.resolve()
        self.client = HttpClient(args.url, args.http_timeout)
        self.run_id = args.run_id or datetime.now().strftime("easy-runtime-%Y%m%d-%H%M%S")
        self.output_dir = (Path(args.output_dir) / self.run_id).resolve()
        self.output_dir.mkdir(parents=True, exist_ok=False)
        self.samples: List[Dict[str, Any]] = []
        self.api_measurements: List[Dict[str, Any]] = []
        self.inference_measurements: List[Dict[str, Any]] = []
        self.startup_measurements: List[Dict[str, Any]] = []
        self.errors: List[Dict[str, Any]] = []
        self.raw_snapshots: List[Dict[str, Any]] = []
        self._sampler: Optional[ProcessTreeSampler] = None
        self._observed_service_pids: set[int] = set()
        psutil.cpu_percent(interval=None)

    def systemctl_command(self, action: str, *extra: str) -> List[str]:
        prefix = [] if os.geteuid() == 0 else ["sudo", "-n"]
        return prefix + ["systemctl", action, self.args.service_name] + list(extra)

    def service_pid(self) -> int:
        explicit_pid = int(getattr(self.args, "pid", 0) or 0)
        if explicit_pid > 0:
            if not psutil.pid_exists(explicit_pid):
                raise RuntimeError(f"Configured EASY PID {explicit_pid} does not exist")
            return explicit_pid
        result = run_command(["systemctl", "show", self.args.service_name, "--property", "MainPID", "--value"], timeout=5)
        try:
            pid = int(str(result.get("stdout") or "0"))
        except ValueError:
            pid = 0
        if pid <= 0:
            raise RuntimeError(f"Unable to resolve MainPID for {self.args.service_name}: {result.get('stderr')}")
        return pid

    def service_status(self) -> Dict[str, Any]:
        explicit_pid = int(getattr(self.args, "pid", 0) or 0)
        if explicit_pid > 0:
            return {
                "main_pid": explicit_pid,
                "active_state": "active" if psutil.pid_exists(explicit_pid) else "inactive",
                "sub_state": "running" if psutil.pid_exists(explicit_pid) else "dead",
                "restart_count": None,
            }
        result = run_command(
            [
                "systemctl",
                "show",
                self.args.service_name,
                "--property",
                "MainPID,ActiveState,SubState,NRestarts",
            ],
            timeout=5,
        )
        values: Dict[str, str] = {}
        for line in str(result.get("stdout") or "").splitlines():
            key, separator, value = line.partition("=")
            if separator:
                values[key] = value
        try:
            main_pid = int(values.get("MainPID") or 0)
        except ValueError:
            main_pid = 0
        try:
            restart_count = int(values.get("NRestarts") or 0)
        except ValueError:
            restart_count = None
        return {
            "main_pid": main_pid,
            "active_state": values.get("ActiveState") or "unknown",
            "sub_state": values.get("SubState") or "unknown",
            "restart_count": restart_count,
            "command_error": result.get("stderr") or "",
        }

    def endpoint_reachable(self, timeout: float = 1.0) -> bool:
        request = urllib.request.Request(f"{self.client.base_url}/health", method="GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                response.read(1)
            return True
        except urllib.error.HTTPError:
            return True
        except (OSError, urllib.error.URLError):
            return False

    def wait_until_stopped(self, timeout: float = 8.0) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            status = self.service_status()
            if status.get("main_pid") == 0 and not self.endpoint_reachable():
                return
            time.sleep(0.2)
        status = self.service_status()
        if self.endpoint_reachable():
            raise RuntimeError(
                "Dashboard still responds after systemd stop; another or orphan process owns port 5000. "
                "Stop that process before benchmarking."
            )
        raise RuntimeError(f"Service did not stop cleanly: {status}")

    def wait_until_ready(self, timeout: float) -> Tuple[float, Dict[str, Any]]:
        deadline = time.monotonic() + timeout
        last_error = "service not queried"
        while time.monotonic() < deadline:
            try:
                payload, _, _, _ = self.client.request("/health")
                orchestrator_status = (payload.get("system_orchestrator") or {}).get("status")
                health_ready = bool(payload.get("ok")) or bool(self.args.allow_unhealthy)
                if payload.get("service") == "easy-dashboard" and orchestrator_status == "RUNNING" and health_ready:
                    return time.monotonic(), payload
                last_error = (
                    f"orchestrator={orchestrator_status or 'unknown'}, health_ok={bool(payload.get('ok'))}"
                )
            except Exception as exc:
                last_error = str(exc)
            time.sleep(0.1)
        raise RuntimeError(f"Dashboard did not become ready within {timeout:.1f}s: {last_error}")

    def measure_startup(self) -> None:
        for run_number in range(1, self.args.startup_runs + 1):
            temperature_before = read_cpu_temperature()
            self.enforce_temperature(temperature_before, "startup")
            stop_result = run_command(self.systemctl_command("stop"), timeout=20)
            if stop_result.get("returncode") != 0:
                raise RuntimeError(f"Unable to stop service: {stop_result.get('stderr')}")
            self.wait_until_stopped()
            time.sleep(self.args.startup_cooldown)
            started = time.monotonic()
            start_result = run_command(self.systemctl_command("start"), timeout=20)
            command_completed = time.monotonic()
            if start_result.get("returncode") != 0:
                raise RuntimeError(f"Unable to start service: {start_result.get('stderr')}")
            ready_at, health = self.wait_until_ready(self.args.startup_timeout)
            ready_status = self.service_status()
            ready_pid = int(ready_status.get("main_pid") or 0)
            if ready_pid <= 0:
                raise RuntimeError(f"Service has no MainPID after readiness: {ready_status}")
            time.sleep(self.args.service_stability_seconds)
            stable_status = self.service_status()
            if (
                int(stable_status.get("main_pid") or 0) != ready_pid
                or stable_status.get("active_state") != "active"
                or stable_status.get("sub_state") != "running"
            ):
                raise RuntimeError(
                    f"Service did not remain stable after readiness: ready={ready_status}, stable={stable_status}"
                )
            temperature_ready = read_cpu_temperature()
            self.enforce_temperature(temperature_ready, "startup readiness")
            self.startup_measurements.append(
                {
                    "run": run_number,
                    "started_at": utc_now(),
                    "systemctl_start_ms": round((command_completed - started) * 1000.0, 3),
                    "ready_ms": round((ready_at - started) * 1000.0, 3),
                    "temperature_before_c": temperature_before,
                    "temperature_ready_c": temperature_ready,
                    "health_ok": bool(health.get("ok")),
                    "main_pid": ready_pid,
                    "restart_count": stable_status.get("restart_count"),
                }
            )

    def enforce_temperature(self, value: Optional[float], stage: str) -> None:
        if value is not None and value >= self.args.stop_temperature_limit:
            # Temperature safety takes precedence over leaving the benchmark
            # target running. The command is best-effort and the failure is
            # still preserved in the generated report.
            run_command(self.systemctl_command("stop"), timeout=20)
            raise RuntimeError(
                f"CPU temperature reached {value:.1f} C during {stage}; safety limit is {self.args.stop_temperature_limit:.1f} C"
            )

    def collect_environment(self) -> Dict[str, Any]:
        model_path = self.project_root / "runtime/models/easy_v1_best_rgb.onnx"
        config_path = self.project_root / "config.yaml"
        requirements_path = self.project_root / "requirements.txt"
        commands = {
            "git_commit": run_command(["git", "rev-parse", "HEAD"], timeout=5),
            "git_status": run_command(["git", "status", "--short"], timeout=5),
            "uname": run_command(["uname", "-a"], timeout=5),
            "os_release": run_command(["cat", "/etc/os-release"], timeout=5),
            "cpu_model": run_command(["sh", "-c", "grep -E 'Model|model name|Hardware|Revision' /proc/cpuinfo"], timeout=5),
            "service_show": run_command(
                ["systemctl", "show", self.args.service_name, "--property", "MainPID,ActiveState,SubState,ExecMainStartTimestamp"], timeout=5
            ),
            "service_unit": run_command(["systemctl", "cat", self.args.service_name], timeout=5),
            "pip_freeze": run_command([sys.executable, "-m", "pip", "freeze"], timeout=20),
        }
        return {
            "schema": "easy.runtime-benchmark.environment.v1",
            "run_id": self.run_id,
            "captured_at": utc_now(),
            "hostname": platform.node(),
            "platform": platform.platform(),
            "machine": platform.machine(),
            "python": sys.version,
            "logical_cpu_count": psutil.cpu_count(logical=True),
            "physical_cpu_count": psutil.cpu_count(logical=False),
            "total_memory_mb": round(psutil.virtual_memory().total / 1024.0 / 1024.0, 3),
            "initial_temperature_c": read_cpu_temperature(),
            "model": {"path": str(model_path.relative_to(self.project_root)), "sha256": sha256_file(model_path)},
            "config_sha256": sha256_file(config_path),
            "requirements_sha256": sha256_file(requirements_path),
            "benchmark_parameters": vars(self.args),
            "commands": commands,
        }

    def _query_runtime(self) -> Dict[str, Any]:
        payloads = {}
        for name, path in (
            ("stream", "/api/stream-state"),
            ("inference", "/api/inference/status"),
            ("thermal", "/thermal/status"),
            ("components", "/api/system/components"),
        ):
            payloads[name], _, _, _ = self.client.request(path)
        return payloads

    def sample_once(self, phase: str, elapsed_seconds: float) -> None:
        timestamp = time.monotonic()
        memory = psutil.virtual_memory()
        load_average = os.getloadavg() if hasattr(os, "getloadavg") else (None, None, None)
        temperature = read_cpu_temperature()
        self.enforce_temperature(temperature, phase)
        service_status = self.service_status()
        current_pid = int(service_status.get("main_pid") or 0)
        if current_pid <= 0:
            raise RuntimeError(f"easy-dashboard.service has no active MainPID during {phase}: {service_status}")
        if self._sampler is None or self._sampler.pid != current_pid:
            if self._observed_service_pids and current_pid not in self._observed_service_pids:
                raise RuntimeError(
                    f"easy-dashboard.service MainPID changed during the benchmark: "
                    f"{sorted(self._observed_service_pids)} -> {current_pid}"
                )
            self._sampler = ProcessTreeSampler(current_pid)
        self._observed_service_pids.add(current_pid)
        process_metrics = self._sampler.sample(timestamp)
        if process_metrics.get("easy_process_count") == 0:
            raise RuntimeError(f"EASY process tree disappeared during {phase} (PID {current_pid})")
        try:
            payloads = self._query_runtime()
            runtime_fields = extract_runtime_fields(
                payloads["stream"], payloads["inference"], payloads["thermal"], payloads["components"]
            )
        except Exception as exc:
            runtime_fields = {"runtime_error": str(exc), "component_states": {}}
            self.errors.append({"timestamp": utc_now(), "phase": phase, "operation": "runtime_sample", "error": str(exc)})
        sample = {
            "timestamp": utc_now(),
            "elapsed_seconds": round(elapsed_seconds, 3),
            "phase": phase,
            "system_cpu_percent": round(psutil.cpu_percent(interval=None), 3),
            "system_memory_percent": round(float(memory.percent), 3),
            "system_memory_used_mb": round(memory.used / 1024.0 / 1024.0, 3),
            "system_memory_available_mb": round(memory.available / 1024.0 / 1024.0, 3),
            "cpu_temperature_c": temperature,
            "load_1m": load_average[0],
            "load_5m": load_average[1],
            "load_15m": load_average[2],
            "service_active_state": service_status.get("active_state"),
            "service_sub_state": service_status.get("sub_state"),
            "service_restart_count": service_status.get("restart_count"),
            **process_metrics,
            **runtime_fields,
        }
        self.samples.append(sample)

    def sample_phase(self, phase: str, duration: float) -> None:
        started = time.monotonic()
        next_sample = started
        while True:
            now = time.monotonic()
            if now >= next_sample:
                self.sample_once(phase, now - started)
                next_sample += self.args.interval
            if now - started >= duration:
                break
            time.sleep(min(0.1, max(0.0, next_sample - time.monotonic())))

    def measure_api_latency(self) -> None:
        for run_number in range(1, self.args.api_runs + 1):
            for path in self.args.api_paths:
                record = {"timestamp": utc_now(), "run": run_number, "endpoint": path, "method": "GET"}
                try:
                    payload, elapsed_ms, status, response_bytes = self.client.request(path)
                    record.update(
                        {
                            "ok": True,
                            "status_code": status,
                            "latency_ms": round(elapsed_ms, 3),
                            "response_bytes": response_bytes,
                            "application_ok": payload.get("ok"),
                            "error": "",
                        }
                    )
                except Exception as exc:
                    record.update({"ok": False, "status_code": None, "latency_ms": None, "response_bytes": None, "error": str(exc)})
                    self.errors.append({"timestamp": utc_now(), "phase": "api", "operation": path, "error": str(exc)})
                self.api_measurements.append(record)
                time.sleep(self.args.request_delay)
            self.sample_once("api", float(run_number))

    def measure_inference(self) -> None:
        if self.args.inference_runs <= 0:
            return
        for run_number in range(1, self.args.inference_runs + 1):
            record = {"timestamp": utc_now(), "run": run_number, "endpoint": "/api/inference/run-on-next-frame"}
            try:
                payload, elapsed_ms, status, response_bytes = self.client.request(
                    "/api/inference/run-on-next-frame", method="POST"
                )
                inference_ms = payload.get("inference_time_ms") or payload.get("last_inference_ms")
                record.update(
                    {
                        "ok": bool(payload.get("ok")),
                        "status_code": status,
                        "wall_latency_ms": round(elapsed_ms, 3),
                        "inference_time_ms": inference_ms,
                        "response_bytes": response_bytes,
                        "source": payload.get("source") or payload.get("source_label"),
                        "detections": len(payload.get("detections") or []),
                        "error": payload.get("error") or "",
                    }
                )
                if not payload.get("ok"):
                    self.errors.append({"timestamp": utc_now(), "phase": "inference", "operation": "run", "error": record["error"]})
            except Exception as exc:
                record.update({"ok": False, "wall_latency_ms": None, "inference_time_ms": None, "error": str(exc)})
                self.errors.append({"timestamp": utc_now(), "phase": "inference", "operation": "run", "error": str(exc)})
            self.inference_measurements.append(record)
            self.sample_once("inference", float(run_number))
            time.sleep(self.args.inference_delay)

    def capture_snapshot(self, label: str) -> None:
        snapshot = {"label": label, "timestamp": utc_now(), "payloads": {}}
        for path in ("/health", "/api/stream-state", "/api/inference/status", "/api/system/components", "/thermal/status"):
            try:
                payload, elapsed, status, size = self.client.request(path)
                snapshot["payloads"][path] = {
                    "status_code": status,
                    "latency_ms": round(elapsed, 3),
                    "response_bytes": size,
                    "body": payload,
                }
            except Exception as exc:
                snapshot["payloads"][path] = {"error": str(exc)}
        self.raw_snapshots.append(snapshot)

    def run(self) -> Dict[str, Any]:
        environment = self.collect_environment()
        self._write_json("environment.json", environment)
        try:
            if self.args.startup_runs:
                self.measure_startup()
            self.wait_until_ready(self.args.startup_timeout)
            self._sampler = ProcessTreeSampler(self.service_pid())
            self._observed_service_pids.add(self._sampler.pid)
            self.capture_snapshot("before_warmup")
            if self.args.warmup_seconds > 0:
                self.sample_phase("warmup", self.args.warmup_seconds)
            self.capture_snapshot("steady_start")
            self.sample_phase("steady", self.args.duration)
            self.measure_api_latency()
            self.measure_inference()
            self.capture_snapshot("completed")
        except Exception as exc:
            self.errors.append({"timestamp": utc_now(), "phase": "benchmark", "operation": "run", "error": str(exc)})
            self.raw_snapshots.append({"label": "aborted", "timestamp": utc_now(), "error": str(exc)})
        summary = self.build_summary(environment)
        self.write_outputs(summary)
        return summary

    def build_summary(self, environment: Dict[str, Any]) -> Dict[str, Any]:
        steady = [sample for sample in self.samples if sample.get("phase") == "steady"]
        metric_names = (
            "system_cpu_percent",
            "easy_cpu_percent",
            "system_memory_percent",
            "system_memory_used_mb",
            "easy_rss_mb",
            "cpu_temperature_c",
            "rgb_left_fps",
            "rgb_right_fps",
        )
        resources = {metric: numeric_summary(sample.get(metric) for sample in steady) for metric in metric_names}
        resources_by_phase = {}
        for phase in ("warmup", "steady", "api", "inference"):
            phase_samples = [sample for sample in self.samples if sample.get("phase") == phase]
            resources_by_phase[phase] = {
                metric: numeric_summary(sample.get(metric) for sample in phase_samples) for metric in metric_names
            }
        api_groups = defaultdict(list)
        for measurement in self.api_measurements:
            if measurement.get("ok") and measurement.get("latency_ms") is not None:
                api_groups[measurement["endpoint"]].append(measurement["latency_ms"])
        component_counts: Dict[str, Counter] = defaultdict(Counter)
        for sample in steady:
            for name, state in (sample.get("component_states") or {}).items():
                component_counts[name][str(state)] += 1
        inference_ok = [item for item in self.inference_measurements if item.get("ok")]
        return {
            "schema": "easy.runtime-benchmark.summary.v1",
            "run_id": self.run_id,
            "generated_at": utc_now(),
            "ok": not self.errors,
            "git_commit": ((environment.get("commands") or {}).get("git_commit") or {}).get("stdout"),
            "environment": {
                "hostname": environment.get("hostname"),
                "platform": environment.get("platform"),
                "machine": environment.get("machine"),
                "python": str(environment.get("python") or "").splitlines()[0],
                "logical_cpu_count": environment.get("logical_cpu_count"),
                "physical_cpu_count": environment.get("physical_cpu_count"),
                "total_memory_mb": environment.get("total_memory_mb"),
                "initial_temperature_c": environment.get("initial_temperature_c"),
                "model_sha256": (environment.get("model") or {}).get("sha256"),
                "config_sha256": environment.get("config_sha256"),
            },
            "sample_count": len(self.samples),
            "steady_sample_count": len(steady),
            "resources": resources,
            "resources_by_phase": resources_by_phase,
            "startup": {
                "runs": len(self.startup_measurements),
                "ready_ms": numeric_summary(item.get("ready_ms") for item in self.startup_measurements),
                "systemctl_start_ms": numeric_summary(item.get("systemctl_start_ms") for item in self.startup_measurements),
            },
            "api_latency_ms": {path: numeric_summary(values) for path, values in sorted(api_groups.items())},
            "inference": {
                "requested_runs": self.args.inference_runs,
                "successful_runs": len(inference_ok),
                "wall_latency_ms": numeric_summary(item.get("wall_latency_ms") for item in inference_ok),
                "engine_time_ms": numeric_summary(item.get("inference_time_ms") for item in inference_ok),
            },
            "component_state_counts": {name: dict(counts) for name, counts in sorted(component_counts.items())},
            "temperature_limit_c": self.args.stop_temperature_limit,
            "errors": self.errors,
            "artifacts": {
                "raw_samples_csv": "raw_samples.csv",
                "raw_samples_json": "raw_samples.json",
                "api_latency_csv": "api_latency.csv",
                "api_latency_json": "api_latency.json",
                "inference_csv": "inference.csv",
                "inference_json": "inference.json",
                "startup_csv": "startup.csv",
                "startup_json": "startup.json",
                "runtime_snapshots_json": "runtime_snapshots.json",
                "summary_csv": "summary.csv",
                "report_markdown": "report.md",
                "tables_latex": "tables.tex",
                "environment_json": "environment.json",
            },
        }

    @staticmethod
    def _csv_value(value: Any) -> Any:
        if isinstance(value, (dict, list)):
            return json.dumps(value, sort_keys=True, separators=(",", ":"))
        return value

    def _write_json(self, name: str, payload: Any) -> None:
        (self.output_dir / name).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    def _write_csv(self, name: str, rows: List[Dict[str, Any]]) -> None:
        path = self.output_dir / name
        if not rows:
            path.write_text("\n", encoding="utf-8")
            return
        fieldnames = sorted({key for row in rows for key in row})
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow({key: self._csv_value(row.get(key)) for key in fieldnames})

    def summary_rows(self, summary: Dict[str, Any]) -> List[Dict[str, Any]]:
        rows = []
        for metric, values in summary.get("resources", {}).items():
            rows.append({"category": "resource_steady", "metric": metric, **values})
        for phase, metrics in summary.get("resources_by_phase", {}).items():
            if phase == "steady":
                continue
            for metric, values in metrics.items():
                rows.append({"category": f"resource_{phase}", "metric": metric, **values})
        for endpoint, values in summary.get("api_latency_ms", {}).items():
            rows.append({"category": "api_latency_ms", "metric": endpoint, **values})
        rows.append({"category": "startup", "metric": "ready_ms", **summary["startup"]["ready_ms"]})
        rows.append({"category": "inference", "metric": "wall_latency_ms", **summary["inference"]["wall_latency_ms"]})
        rows.append({"category": "inference", "metric": "engine_time_ms", **summary["inference"]["engine_time_ms"]})
        return rows

    @staticmethod
    def _format_metric(values: Dict[str, Any], suffix: str = "") -> str:
        if not values or not values.get("count"):
            return "n/a"
        return f"{values['mean']:.2f}{suffix} (median {values['median']:.2f}, p95 {values['p95']:.2f})"

    def markdown_report(self, summary: Dict[str, Any]) -> str:
        resources = summary["resources"]
        lines = [
            "# EASY Raspberry Pi runtime benchmark",
            "",
            f"- Run: `{summary['run_id']}`",
            f"- Commit: `{summary.get('git_commit') or 'unknown'}`",
            f"- Generated: {summary['generated_at']}",
            f"- Result: **{'PASS' if summary['ok'] else 'COMPLETED WITH ERRORS'}**",
            "",
            "## Execution environment",
            "",
            "| Property | Value |",
            "|---|---|",
            f"| Host | {summary['environment'].get('hostname') or 'unknown'} |",
            f"| Platform | {summary['environment'].get('platform') or 'unknown'} |",
            f"| Architecture | {summary['environment'].get('machine') or 'unknown'} |",
            f"| Python | {summary['environment'].get('python') or 'unknown'} |",
            f"| CPU cores | {summary['environment'].get('physical_cpu_count') or 'unknown'} physical / {summary['environment'].get('logical_cpu_count') or 'unknown'} logical |",
            f"| RAM | {summary['environment'].get('total_memory_mb') or 'unknown'} MiB |",
            f"| Initial CPU temperature | {summary['environment'].get('initial_temperature_c') if summary['environment'].get('initial_temperature_c') is not None else 'n/a'} °C |",
            f"| ONNX SHA-256 | `{summary['environment'].get('model_sha256') or 'unavailable'}` |",
            "",
            "## Steady-state runtime resources",
            "",
            "| Metric | Mean | Median | P95 | Maximum | Samples |",
            "|---|---:|---:|---:|---:|---:|",
        ]
        labels = {
            "system_cpu_percent": "System CPU (%)",
            "easy_cpu_percent": "EASY process-tree CPU (%)",
            "system_memory_percent": "System memory (%)",
            "system_memory_used_mb": "System memory used (MiB)",
            "easy_rss_mb": "EASY process-tree RSS (MiB)",
            "cpu_temperature_c": "CPU temperature (°C)",
            "rgb_left_fps": "RGB left FPS",
            "rgb_right_fps": "RGB right FPS",
        }
        def display(value: Any) -> str:
            return "n/a" if value is None else str(value)
        for key, label in labels.items():
            values = resources[key]
            lines.append(
                f"| {label} | {display(values.get('mean'))} | {display(values.get('median'))} | "
                f"{display(values.get('p95'))} | {display(values.get('max'))} | {values.get('count', 0)} |"
            )
        lines.extend(["", "## Startup", ""])
        lines.append(f"Application ready time: {self._format_metric(summary['startup']['ready_ms'], ' ms')}.")
        lines.extend(["", "## REST API latency", "", "| Endpoint | Mean (ms) | Median (ms) | P95 (ms) | Runs |", "|---|---:|---:|---:|---:|"])
        for endpoint, values in summary["api_latency_ms"].items():
            lines.append(f"| `{endpoint}` | {values['mean']} | {values['median']} | {values['p95']} | {values['count']} |")
        lines.extend(["", "## Inference timing", ""])
        lines.append(
            f"Successful runs: {summary['inference']['successful_runs']}/{summary['inference']['requested_runs']}. "
            f"End-to-end API time: {self._format_metric(summary['inference']['wall_latency_ms'], ' ms')}; "
            f"runtime-reported inference time: {self._format_metric(summary['inference']['engine_time_ms'], ' ms')}."
        )
        lines.extend(["", "## Component states", ""])
        if summary["component_state_counts"]:
            lines.extend(["| Component | Observed states |", "|---|---|"])
            for name, counts in summary["component_state_counts"].items():
                formatted = ", ".join(f"{state}: {count}" for state, count in counts.items())
                lines.append(f"| {name} | {formatted} |")
        else:
            lines.append("No component state payload was available.")
        lines.extend(
            [
                "",
                "## Experimental limitations",
                "",
                "- Measurements describe the integrated prototype on this host and commit; they are not detector-accuracy results.",
                "- API calls and monitoring add a small, documented observer load. Sampling and workload phases are kept separate.",
                "- CPU percentages for EASY include its systemd process tree; 100% represents one fully occupied CPU core.",
                "- RSS is summed across the EASY process tree and may include shared pages more than once.",
                "- Inference timing is reported only when the configured runtime source can provide a frame.",
                "- RGB FPS values are those exposed by the runtime; they are not independently reconstructed from network packets.",
                "- Thermal capture is not triggered by this benchmark, avoiding interference with RGB ownership and temperature.",
                "",
                "## Raw artifacts",
                "",
                "All raw samples, request timings, environment metadata, runtime snapshots and generated tables are stored beside this report.",
            ]
        )
        if summary["errors"]:
            lines.extend(["", "## Errors", ""])
            for error in summary["errors"]:
                lines.append(f"- `{error.get('phase')}/{error.get('operation')}`: {error.get('error')}")
        return "\n".join(lines) + "\n"

    def latex_tables(self, summary: Dict[str, Any]) -> str:
        resource_labels = {
            "system_cpu_percent": ("System CPU", r"\%"),
            "easy_cpu_percent": ("EASY CPU", r"\%"),
            "system_memory_percent": ("System RAM", r"\%"),
            "easy_rss_mb": ("EASY RSS", "MiB"),
            "cpu_temperature_c": ("CPU temperature", r"$^\circ$C"),
            "rgb_left_fps": ("RGB left", "FPS"),
            "rgb_right_fps": ("RGB right", "FPS"),
        }
        lines = [
            "% Generated by scripts/benchmark_raspberry_runtime.py",
            r"\begin{table}[t]",
            r"\caption{EASY runtime resource characterization on Raspberry Pi 4.}",
            r"\label{tab:easy-runtime-resources}",
            r"\centering",
            r"\begin{tabular}{llrrrr}",
            r"\hline",
            "Metric & Unit & Mean & Median & P95 & Max \\\\",
            r"\hline",
        ]
        for key, (label, unit) in resource_labels.items():
            values = summary["resources"][key]
            def value(name: str) -> str:
                raw = values.get(name)
                return "--" if raw is None else f"{raw:.2f}"
            lines.append(f"{latex_escape(label)} & {unit} & {value('mean')} & {value('median')} & {value('p95')} & {value('max')} \\\\")
        lines.extend([r"\hline", r"\end{tabular}", r"\end{table}", ""])
        lines.extend(
            [
                r"\begin{table}[t]",
                r"\caption{EASY REST API and inference latency.}",
                r"\label{tab:easy-runtime-latency}",
                r"\centering",
                r"\begin{tabular}{lrrrr}",
                r"\hline",
                "Operation & Mean (ms) & Median (ms) & P95 (ms) & $n$ \\\\",
                r"\hline",
            ]
        )
        latency_rows = [(path, values) for path, values in summary["api_latency_ms"].items()]
        latency_rows.extend(
            [
                ("Startup to ready", summary["startup"]["ready_ms"]),
                ("Inference API", summary["inference"]["wall_latency_ms"]),
                ("Inference engine", summary["inference"]["engine_time_ms"]),
            ]
        )
        for label, values in latency_rows:
            def value(name: str) -> str:
                raw = values.get(name)
                return "--" if raw is None else f"{raw:.2f}"
            lines.append(
                f"{latex_escape(label)} & {value('mean')} & {value('median')} & {value('p95')} & {values.get('count', 0)} \\\\")
        lines.extend([r"\hline", r"\end{tabular}", r"\end{table}", ""])
        return "\n".join(lines)

    def write_outputs(self, summary: Dict[str, Any]) -> None:
        self._write_json("raw_samples.json", self.samples)
        self._write_csv("raw_samples.csv", self.samples)
        self._write_json("api_latency.json", self.api_measurements)
        self._write_csv("api_latency.csv", self.api_measurements)
        self._write_json("inference.json", self.inference_measurements)
        self._write_csv("inference.csv", self.inference_measurements)
        self._write_json("startup.json", self.startup_measurements)
        self._write_csv("startup.csv", self.startup_measurements)
        self._write_json("runtime_snapshots.json", self.raw_snapshots)
        self._write_json("summary.json", summary)
        self._write_csv("summary.csv", self.summary_rows(summary))
        (self.output_dir / "report.md").write_text(self.markdown_report(summary), encoding="utf-8")
        (self.output_dir / "tables.tex").write_text(self.latex_tables(summary), encoding="utf-8")
        checksum_lines = []
        for path in sorted(self.output_dir.iterdir()):
            if path.is_file() and path.name != "checksums.sha256":
                checksum_lines.append(f"{sha256_file(path)}  {path.name}")
        (self.output_dir / "checksums.sha256").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")

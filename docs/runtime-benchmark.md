# Raspberry Pi runtime characterization

This protocol measures the integrated EASY runtime on a Raspberry Pi 4. It is
intended to support the system-performance section of the IEEE paper. It does
not evaluate detector accuracy and does not modify the model, confidence
thresholds, sessions, sources or saved data.

## What is measured

The benchmark records three distinct phases so their costs are not mixed:

1. **Startup:** controlled systemd stop/start cycles and time from `systemctl
   start` to an HTTP-ready Flask service with the System Orchestrator in
   `RUNNING` state.
2. **Steady state:** CPU, memory, temperature, source FPS and component states
   at a fixed sampling interval.
3. **Workloads:** REST API latency followed by explicitly requested inference
   calls on the source already selected by the runtime.

System CPU and memory come from `psutil`. EASY CPU and RSS include the systemd
main process and all of its descendants, including camera and FFmpeg workers.
Process CPU follows `top` semantics: 100% means one fully occupied core.

The benchmark observes the thermal status but does not request a thermal frame.
This avoids interrupting RGB capture and keeps the measurement workload stable.

## Preconditions

- Use the final paper commit and record the commit hash.
- Install and enable `easy-dashboard.service` using the unit in `services/`.
- Close browser tabs or other processes that repeatedly poll the Raspberry API.
- Stop unrelated CPU-intensive workloads.
- Confirm both RGB sources have reached their normal runtime state.
- Select the intended inference source before the run. For reproducible
  inference timing, use the same replay source for every compared run.
- Begin only below 70 °C. The collector aborts at 78 °C.
- Keep the Raspberry power supply, cooling, camera configuration and network
  connection unchanged across repeated runs.

## Complete run

On the Raspberry:

```bash
cd ~/Desktop/carmine/easy-dashboard
git pull --ff-only
sudo install -m 644 services/easy-dashboard.service /etc/systemd/system/easy-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable easy-dashboard.service
./scripts/validate_raspberry_runtime.sh
./scripts/run_raspberry_benchmark.sh
```

The default protocol uses:

- 3 startup repetitions;
- 30 seconds of warm-up after the final start;
- 300 seconds of steady-state sampling at 2-second intervals;
- 30 requests for each REST endpoint;
- 10 inference requests;
- a hard 78 °C stop threshold.

The wrapper asks for `sudo` once because startup characterization must restart
the service. It leaves the service running when the experiment completes.

## Controlled variants

Parameters can be changed only through recorded environment variables. They
are copied into `environment.json` with the complete CLI configuration.

```bash
EASY_BENCHMARK_DURATION=600 \
EASY_BENCHMARK_INTERVAL=2 \
EASY_BENCHMARK_STARTUP_RUNS=5 \
EASY_BENCHMARK_API_RUNS=50 \
EASY_BENCHMARK_INFERENCE_RUNS=20 \
./scripts/run_raspberry_benchmark.sh
```

To measure the idle runtime without inference calls:

```bash
EASY_BENCHMARK_INFERENCE_RUNS=0 ./scripts/run_raspberry_benchmark.sh
```

For a short engineering check, bypass the wrapper and avoid service restarts:

```bash
./.venv/bin/python scripts/benchmark_raspberry_runtime.py \
  --duration 30 \
  --warmup-seconds 5 \
  --startup-runs 0 \
  --api-runs 5 \
  --inference-runs 1
```

This short form is not the paper protocol.

## Output layout

Each run creates an immutable directory under
`runtime/benchmarks/easy-runtime-YYYYMMDD-HHMMSS/`:

| File | Content |
|---|---|
| `environment.json` | Host, OS, Python, dependencies, commit, service unit, hashes and parameters |
| `raw_samples.csv/json` | Timestamped system, process, temperature, FPS and component observations |
| `startup.csv/json` | Every controlled startup measurement |
| `api_latency.csv/json` | Every REST request, response status, size and latency |
| `inference.csv/json` | Every inference wall time and runtime-reported engine time |
| `runtime_snapshots.json` | Full public API payloads before and after the experiment |
| `summary.csv/json` | Aggregated count, minimum, mean, median, P95, maximum and standard deviation |
| `report.md` | Human-readable automatic report and limitations |
| `tables.tex` | Two IEEE-compatible LaTeX tables |
| `checksums.sha256` | SHA-256 integrity record for every generated artifact |

Generated runs are ignored by Git. Copy the complete run directory to the
paper experiment archive without editing individual files.

## Repetition and reporting

Run the complete protocol at least three times from comparable initial
conditions. Keep each run directory. Report per-run results and, if an
aggregate across runs is needed, state the number of runs and aggregation rule
explicitly. Do not select only the fastest run.

Use wall latency for the user-visible inference request and engine time for the
model execution reported by the runtime. These values answer different
questions and must not be merged.

## Experimental limitations

- Results characterize this Raspberry, service configuration and commit; they
  are not general hardware specifications.
- Monitoring and API probes add a small observer load. The fixed interval and
  raw request log make this load repeatable and visible.
- Summed process-tree RSS can count shared memory pages more than once.
- Runtime FPS is used as exposed by EASY; network packet arrival is not
  independently reconstructed.
- Startup includes configured preflight, hardware discovery and orchestrator
  readiness. It does not include Raspberry boot time.
- Inference is measured only if the already selected source can provide a
  frame. Failed requests remain in the raw output and make the run fail.
- Thermal status is observed without forcing a capture, so this protocol does
  not characterize FLIR acquisition latency.

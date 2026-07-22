# Raspberry operations

## Remote model

The Flask service runs on the Raspberry under systemd. Safari connects from the
Mac through an SSH local forward. The browser does not access cameras directly.

Use the Mac launcher for normal operation:

```bash
./scripts/easy_dashboard_mac.sh
```

Optional Mac home launcher:

```bash
./scripts/easy_dashboard_mac.sh --install-home-launcher
~/easy_dashboard_mac.sh
```

The launcher retries transient SSH and tunnel failures automatically. Override the
defaults with `EASY_SSH_RETRIES` and `EASY_SSH_RETRY_DELAY_SECONDS` if the jump host
is temporarily unstable.

Full readiness (`/health/ready`) requires the expected sensors to be operational.
If Flask is reachable through `/health` but a sensor is unavailable, the launcher
opens the dashboard after a short delay and reports that it is running in degraded
mode instead of blocking access to diagnostics.

## Service commands

```bash
sudo systemctl status easy-dashboard.service --no-pager
journalctl -u easy-dashboard.service -n 100 --no-pager
sudo systemctl stop easy-dashboard.service
```

## Temperature policy

- Start controlled hardware validation only below 70 °C.
- Thermal capture is paused at 78 °C.
- Stop the service immediately at or above 78 °C.
- PureThermal uses bounded, on-demand captures and releases `/dev/video0`
  between requests. Do not run a second FFmpeg or `v4l2-ctl` capture while the
  service owns the device.

Read temperature with:

```bash
vcgencmd measure_temp
```

## PureThermal checks

```bash
v4l2-ctl --list-devices
v4l2-ctl -d /dev/video0 --list-formats-ext
curl http://127.0.0.1:5000/thermal/status
curl -o /tmp/easy-thermal.jpg http://127.0.0.1:5000/thermal/frame
curl http://127.0.0.1:5000/thermal/status
```

`detected: true` confirms USB enumeration. The normal idle result is
`runtime_state.availability: READY`, `runtime_state.capture_mode: on_demand`,
and `streaming: false`. A successful request to `/thermal/frame` must return a
JPEG and increase `frame_seq`; the sensor then returns to `READY`. If the frame
request fails while the node is free, inspect the PureThermal firmware and
physical Lepton seating instead of repeatedly restarting FFmpeg.

## Controlled final validation

1. Stop the service and pull with `git pull --ff-only`.
2. Confirm CPU temperature below 70 °C.
3. Start the service once and run `scripts/validate_raspberry_runtime.sh`.
4. The validator requires real RGB frames, captures one thermal JPEG, checks
   that `frame_seq` increases, and waits for RGB to resume.
5. Record temperature and stop immediately on the 78 °C threshold.
6. Stop the service after the short test unless temperature and frames remain stable.

Use `EASY_SKIP_THERMAL_VALIDATION=1` only when deliberately checking RGB without
opening PureThermal. The default validation refuses to begin at 70 °C or above.

## Paper runtime benchmark

After hardware validation, use the dedicated, temperature-aware runtime
protocol. It measures startup, resources, REST latency, inference timing, FPS
and component states without triggering thermal capture:

```bash
./scripts/run_raspberry_benchmark.sh
```

The complete protocol, output schema and experimental limitations are in
[`runtime-benchmark.md`](runtime-benchmark.md).

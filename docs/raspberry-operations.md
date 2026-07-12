# Raspberry operations

## Remote model

The Flask service runs on the Raspberry under systemd. Safari connects from the
Mac through an SSH local forward. The browser does not access cameras directly.

Use the Mac launcher for normal operation:

```bash
./scripts/easy_dashboard_mac.sh
```

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
- A silent PureThermal attempt times out after four seconds and cools down for
  60 seconds before another attempt.

Read temperature with:

```bash
vcgencmd measure_temp
```

## PureThermal checks

```bash
v4l2-ctl --list-devices
v4l2-ctl -d /dev/video0 --list-formats-ext
curl http://127.0.0.1:5000/thermal/status
```

`detected: true` confirms USB enumeration. A working stream also requires
`streaming: true`, an increasing `frame_seq`, and a recent `last_frame_ts`.
If a controlled `usbreset 1e4e:0100` does not restore frames, inspect the
PureThermal firmware and physical Lepton seating instead of repeatedly
restarting FFmpeg.

## Controlled final validation

1. Stop the service and pull with `git pull --ff-only`.
2. Confirm CPU temperature below 70 °C.
3. Start the service once and run `scripts/validate_raspberry_runtime.sh`.
4. Verify RGB, mission capture, inference, export, and thermal status.
5. Record temperature and stop immediately on the 78 °C threshold.
6. Stop the service after the short test unless temperature and frames remain stable.

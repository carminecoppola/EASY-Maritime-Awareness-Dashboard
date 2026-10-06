# Raspberry operations

## Remote model

The Flask service runs on the Raspberry under systemd. A browser on the operator's
Mac reaches it through an SSH local forward (optionally through a jump host); the
browser never talks to the cameras.

### One-command launch (macOS)

```bash
./scripts/easy_dashboard_mac.sh                      # from the repository
./scripts/easy_dashboard_mac.sh --install-home-launcher
~/easy_dashboard_mac.sh                              # from anywhere afterwards
```

The launcher opens **one** authenticated SSH connection and reuses it for every step
(OpenSSH `ControlMaster`), so credentials or a key passphrase are asked for at most
once. It then:

1. starts the service only if `/health/ready` is not already answering (a running
   mission is never interrupted);
2. waits for `/health/ready`, or for `/health` plus a short delay when a sensor is
   unavailable, and opens the interface in degraded mode instead of blocking
   diagnostics;
3. adds a local port forward (from 5500 upwards) to the open connection;
4. opens the browser only when the local endpoint really answers.

Configuration lives in `~/.config/easy/launcher.env` (copy
`scripts/easy_dashboard_mac.env.example`): jump host, Raspberry address, project path
on the Raspberry, browser, timeouts. Environment variables override the file.

```bash
~/easy_dashboard_mac.sh --print-config   # show the effective settings
~/easy_dashboard_mac.sh --stop           # close the shared SSH connection
```

**If nothing opens.** Run the launcher in a terminal and read its step number
(0/4 to 4/4). Step 0 failing means the SSH route is wrong or unreachable (check the
network or VPN to the jump host and `EASY_TARGET_PORT`); step 1 or 2 failing means
the service on the Raspberry did not start (the launcher prints its journal). To
avoid typing the key passphrase, run `ssh-add --apple-use-keychain ~/.ssh/<key>`.

## First installation on the Raspberry

```bash
git clone https://github.com/carminecoppola/EASY-Maritime-Awareness-Dashboard.git ~/easy-dashboard
cd ~/easy-dashboard
./install.sh
sudo systemctl restart easy-dashboard.service
curl http://127.0.0.1:5000/health/ready
```

`install.sh` builds the React frontend (needs Node.js 24 and npm), installs the
Python requirements and registers the service through `scripts/install_service.sh`,
which renders `services/easy-dashboard.service` for this checkout and user. Without
Node.js on the Raspberry, build on the Mac (`cd frontend && npm ci --include=dev &&
npm run build`), copy the whole `frontend/dist/` to the Raspberry and run
`EASY_FRONTEND_PREBUILT=1 ./install.sh`. Do not run `install.sh` from an active
virtual environment.

To update later: `git pull --ff-only`, rebuild or copy `frontend/dist/`, then
`sudo systemctl restart easy-dashboard.service`.

## Service commands

```bash
sudo systemctl status easy-dashboard.service --no-pager
journalctl -u easy-dashboard.service -n 100 --no-pager
sudo systemctl stop easy-dashboard.service
```

## Temperature policy

- Start controlled hardware validation only below 70 °C.
- Thermal capture pauses at 78 °C CPU temperature.
- Stop the service immediately at or above 78 °C.
- `vcgencmd measure_temp` reads the temperature; `vcgencmd get_throttled` reports
  under-voltage and throttling since boot (`0x0` is clean). Use the official 5 V / 3 A
  power supply and a good cable: under-voltage is the most common field problem.

## PureThermal checks

```bash
v4l2-ctl --list-devices
curl http://127.0.0.1:5000/thermal/status
curl -o /tmp/easy-thermal.jpg http://127.0.0.1:5000/thermal/frame
curl http://127.0.0.1:5000/thermal/status
```

`detected: true` confirms USB enumeration. With the default `continuous` capture mode
the normal state is `runtime_state.availability: STREAMING` with an increasing
`frame_seq`; `READY` means detected and waiting for its first frame. Do not run a
second FFmpeg or `v4l2-ctl` capture while the service owns the device. If frames fail
while the node is free, inspect the PureThermal firmware and the Lepton seating
instead of repeatedly restarting FFmpeg.

The automatic pre-flight lists I2C adapters but deliberately does not scan every bus
address: an active `i2cdetect -y` scan can hold the camera control bus low and must be
used only during isolated hardware diagnosis.

## Controlled validation

1. Stop the service, `git pull --ff-only`, confirm the CPU is below 70 °C.
2. Start the service once and run `scripts/validate_raspberry_runtime.sh`.
3. For the camera/thermal runtime run `python scripts/check_raspberry_runtime.py`: it
   requires real RGB frames, one valid thermal JPEG with an increasing `frame_seq`,
   and RGB still streaming afterwards (`--skip-thermal` checks RGB only).
4. Record the temperature and stop at the 78 °C threshold.

## Runtime benchmark

After validation, the temperature-aware protocol measures startup, resources, REST
latency, inference timing, FPS and component states:

```bash
./scripts/run_raspberry_benchmark.sh
```

The protocol, output schema and limitations are in
[`runtime-benchmark.md`](runtime-benchmark.md).

## Recovering an unreadable user database

If the users file is malformed or unreadable, the application refuses to start
instead of reopening first-run setup (which would let anyone create an admin). Stop
the service, keep the damaged file for diagnosis and restore a known-good backup of
`EASY_DASHBOARD_AUTH_USERS_FILE` (default `data/auth_users.json`). Check ownership
and permissions, then restart. `EASY_DASHBOARD_ENABLE_AUTH=0` does not bypass a
damaged database. Never delete the file as routine recovery: a missing file is treated
as first-run setup.

## systemd hardening: what was tried

A hardened drop-in (`NoNewPrivileges`, `ProtectKernel*`, `ProtectControlGroups`,
`RestrictSUIDSGID`, `RestrictRealtime`, `ProtectHostname`, `LockPersonality`,
`ProtectClock`) was bisected directive by directive against the live service. Every
directive passed except `ProtectClock=true`, which makes `libcamera-vid` fail with
"Operation not permitted" on `/dev/media*`. Nine directives are therefore safe
individually; they were not tested in combination. Apply them together without
`ProtectClock` only in an isolated test cycle, never during active use of the
hardware, and verify that RGB returns to `STREAMING`.

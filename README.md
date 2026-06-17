# EASY Local Dashboard

Browser-based local dashboard for Raspberry Pi camera monitoring.

## Install

```bash
cd ~/Desktop/carmine/easy-dashboard
./install.sh
```

## Start

```bash
./start.sh
```

## Access

Open:

```text
http://<Raspberry_IP>:5000
```

When you are connected from the Mac through SSH tunneling, open:

```text
http://127.0.0.1:5000
```

## Debug

```bash
journalctl -u easy-dashboard.service -f
curl http://127.0.0.1:5000/health
curl http://127.0.0.1:5000/cameras
```

## Notes

- RGB feeds are browser-native MJPEG streams.
- Left and right cards represent the logical split of the CamArray feed.
- Thermal mode defaults to `mock` until the real FLIR path is activated.
- Runtime data is stored under `data/`:
  - `data/logs/`
  - `data/reports/`
  - `data/captures/`

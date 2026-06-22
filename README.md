# SEAAI Alert Viewer

Repository for SEAAI alert viewing tools.

The current implementation lives in `lite-viewer/`. It is a lightweight developer
viewer for inspecting live SEAAI detections in a browser. It intentionally keeps
state in memory and avoids production concerns such as persistence, deployment
hardening, user accounts, or durable audit history.

Shared frontend elements live in `components/`. Both `lite-viewer/` and the
future `full-viewer/` should use those same templates, styles, browser behavior,
and assets so viewing experience changes apply to both viewers. Production-only
concerns should be layered around the shared viewer experience rather than
replacing it.

## Repository Layout

```text
components/        Shared viewer templates, styles, JavaScript, and assets
lite-viewer/       Developer-focused FastAPI viewer
full-viewer/       Production-oriented viewer with auth and persisted alerts
requirements.txt   Python dependencies for the current viewer
```

## Full Viewer

Run the production-oriented viewer:

```bash
python3 full-viewer/main.py
```

Then open `http://127.0.0.1:8766` and sign in. The initial admin login is
`admin` / `admin` unless `ADMIN_PASSWORD` or `--admin-password` is set before the
first startup.

Passwords are stored as salted PBKDF2 hashes. Login checks a submitted password
against the stored hash; there is no reversible password decryption path.

The full viewer stores users/settings/alerts in SQLite and snapshot images on
the filesystem under `full-viewer/data/`. Alerts and media older than 90 days are
rotated out by default.

Regular users can see the backend websocket connection status, but only admins
can see or change the upstream websocket URL.

## Mock Websocket Feed

Run a local websocket feed that emits rotating sample alerts every 5 seconds:

```bash
python3 scripts/simulate_alert_websocket.py
```

Then configure the viewer websocket URL as:

```text
ws://127.0.0.1:8899/test
```

## Lite Viewer

## Features

- connects to an upstream SEAAI websocket feed
- keeps all working state in memory only
- renders a live tracking map for recent detections
- renders an alerts panel with thumbnails, metadata, and image modal viewing
- supports runtime websocket URL changes from the UI
- supports alert filtering by bearing and classification
- supports clear-all alerts and a demo alert injector
- plays an alert sound for new alerts that match the active filters
- supports thermal snapshots using `T2`

## UI Overview

### Alerts Panel

- `Push demo alert` cycles through image-backed vessel/swimmer demo paths
- `Clear alerts` removes all alerts from the panel
- websocket URL input lets you change the upstream feed without restarting
- `Connect` applies the websocket URL and triggers an immediate reconnect attempt
- bearing and classification checkboxes filter both the alert list and tracking map
- if no boxes are checked in a filter group, that group allows all values

### Tracking Map

- mouse wheel zoom
- click-drag pan
- double-click reset
- map markers open the image modal
- marker and trail visuals stay visually consistent while zooming

### Image Modal

- opens from either the alert card or the tracking-map marker
- initially frames the bounding box if one exists
- mouse wheel zoom
- click-drag pan
- double-click reset
- can zoom all the way back out to the full image

## Installation

```bash
python3 -m pip install -r requirements.txt
```

## Run

Basic run:

```bash
python3 lite-viewer/main.py
```

Then open `http://127.0.0.1:8765`.

Default upstream websocket URL if nothing is configured:

```text
ws://localhost:8080/test
```

## Command-Line Flags

CLI flags override environment variables.

```bash
python3 lite-viewer/main.py --help
```

Available flags:

```text
--app-title <text>
--host <host>
--port <port>
--seaai-ws-url <ws-url>
--max-panel-alerts <count>
--track-window-seconds <seconds>
--map-max-distance-m <meters>
--dedupe-window-seconds <seconds>
--reconnect-delay-seconds <seconds>
```

Example:

```bash
python3 lite-viewer/main.py \
  --host 0.0.0.0 \
  --port 8765 \
  --seaai-ws-url ws://172.26.0.107:9002/v1/alerts \
  --max-panel-alerts 100 \
  --track-window-seconds 90 \
  --map-max-distance-m 1500
```

## Environment Variables

Environment variables are still supported:

```bash
export APP_TITLE="SEAAI Live Monitor"
export APP_HOST="127.0.0.1"
export APP_PORT="8765"
export SEAAI_WS_URL="ws://172.26.0.107:9002/v1/alerts"
export MAX_PANEL_ALERTS="50"
export TRACK_WINDOW_SECONDS="60"
export MAP_MAX_DISTANCE_M="1000"
export DEDUPE_WINDOW_SECONDS="15"
export RECONNECT_DELAY_SECONDS="5"
```

Precedence:

```text
CLI flags > environment variables > built-in defaults
```

## Testing Without Hardware

### Push a Mock Alert via HTTP

You can post a SEAAI-shaped payload directly into the app:

```bash
curl -X POST http://127.0.0.1:8765/api/mock-alert \
  -H 'Content-Type: application/json' \
  -d '{
    "datetime": "2026-04-10T12:34:56Z",
    "snapshots": {},
    "objects": [
      {
        "track_id": 12,
        "classification": "HUMAN_IN_WATER",
        "confidence_level": 0.91,
        "bearing_identification": "APPROACHING",
        "position": [120, 10],
        "position_history": [[80, 6], [100, 8]]
      }
    ]
  }'
```

The repo includes a 640x480 black/white vertical stripe image for image-bearing
mock payloads:

```text
components/static/assets/sample-striped-640x480.png
```

Use it as a data URL in `snapshots.T2` or `snapshots.RGB1`:

```bash
IMAGE_DATA="data:image/png;base64,$(base64 -w0 components/static/assets/sample-striped-640x480.png)"
```

The UI `Push demo alert` button cycles through dummy cases covering:

- vessel approaching
- vessel lateral crossing left and right
- swimmer approaching
- swimmer lateral crossing left and right

### Grab a Single Frame from Thermal RTSP

Example using `T2`:

```bash
ffmpeg -y -rtsp_transport tcp -i "rtsp://172.26.0.99:8555/T2" -frames:v 1 -update 1 -q:v 2 frame.jpg
```

## Notes

- supported bearings: `APPROACHING`, `DEPARTING`, `LATERAL_CROSSING`, `UNKNOWN`
- supported thermal snapshot key: `T2`
- unsupported detections are ignored during parsing
- `HAZARD` classifications are currently mapped to vessel display behavior

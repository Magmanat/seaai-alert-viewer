# SEAAI Live Monitor

Standalone monolithic Python web app that:

- connects directly to a configured SEAAI WebSocket
- keeps all state in memory only
- renders a live tracking map for the past 60 seconds of detections
- renders an alert panel with the latest 50 detections in FIFO order

## Configuration

Set these environment variables before running:

```bash
export SEAAI_WS_URL="ws://your-seaai-source:8081"
export APP_HOST="127.0.0.1"
export APP_PORT="8765"
```

Optional:

```bash
export MAX_PANEL_ALERTS="50"
export TRACK_WINDOW_SECONDS="60"
export MAP_MAX_DISTANCE_M="1000"
export DEDUPE_WINDOW_SECONDS="15"
export RECONNECT_DELAY_SECONDS="5"
```

## Run

```bash
python3 -m pip install -r requirements.txt
python3 main.py
```

Then open `http://127.0.0.1:8765`.

## Testing Without Hardware

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

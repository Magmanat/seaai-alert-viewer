from __future__ import annotations

import argparse
import asyncio
import base64
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from websockets.asyncio.server import serve


REPO_DIR = Path(__file__).resolve().parent.parent
SAMPLE_IMAGE = REPO_DIR / "components" / "static" / "assets" / "sample-striped-640x480.png"

DEMO_ALERTS: list[dict[str, Any]] = [
    {
        "track_id": "vessel-approaching",
        "classification": "VESSEL",
        "bearing_identification": "APPROACHING",
        "confidence_level": 0.92,
        "position_history": [[800, 2], [700, 1], [600, 0], [500, -1]],
        "position": [400, 0],
        "bounding_boxes": {"T2": [0.3, 0.25, 0.7, 0.75]},
    },
    {
        "track_id": "vessel-lateral-left",
        "classification": "VESSEL",
        "bearing_identification": "LATERAL_CROSSING",
        "confidence_level": 0.88,
        "position_history": [[650, 32], [620, 20], [600, 8], [590, -4]],
        "position": [580, -16],
        "bounding_boxes": {"T2": [0.12, 0.28, 0.42, 0.72]},
    },
    {
        "track_id": "vessel-lateral-right",
        "classification": "VESSEL",
        "bearing_identification": "LATERAL_CROSSING",
        "confidence_level": 0.86,
        "position_history": [[650, -32], [620, -20], [600, -8], [590, 4]],
        "position": [580, 16],
        "bounding_boxes": {"T2": [0.58, 0.28, 0.88, 0.72]},
    },
    {
        "track_id": "swimmer-approaching",
        "classification": "SWIMMER",
        "bearing_identification": "APPROACHING",
        "confidence_level": 0.81,
        "position_history": [[380, -10], [330, -8], [280, -6], [230, -4]],
        "position": [180, -3],
        "bounding_boxes": {"T2": [0.4, 0.18, 0.58, 0.62]},
    },
    {
        "track_id": "swimmer-lateral-left",
        "classification": "SWIMMER",
        "bearing_identification": "LATERAL_CROSSING",
        "confidence_level": 0.79,
        "position_history": [[360, 28], [350, 16], [340, 5], [330, -6]],
        "position": [320, -18],
        "bounding_boxes": {"T2": [0.18, 0.22, 0.36, 0.64]},
    },
    {
        "track_id": "swimmer-lateral-right",
        "classification": "SWIMMER",
        "bearing_identification": "LATERAL_CROSSING",
        "confidence_level": 0.77,
        "position_history": [[360, -28], [350, -16], [340, -5], [330, 6]],
        "position": [320, 18],
        "bounding_boxes": {"T2": [0.64, 0.22, 0.82, 0.64]},
    },
]


def build_payload(alert: dict[str, Any], image_data_url: str) -> str:
    return json.dumps(
        {
            "datetime": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "snapshots": {"T2": image_data_url},
            "objects": [alert],
        }
    )


async def publish_alerts(websocket, interval_seconds: int, image_data_url: str) -> None:
    index = 0
    while True:
        alert = DEMO_ALERTS[index % len(DEMO_ALERTS)]
        await websocket.send(build_payload(alert, image_data_url))
        print(f"sent {alert['track_id']}")
        index += 1
        await asyncio.sleep(interval_seconds)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Serve rotating SEAAI mock alerts over websocket.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8899)
    parser.add_argument("--interval-seconds", type=int, default=5)
    args = parser.parse_args()

    image_data_url = "data:image/png;base64," + base64.b64encode(SAMPLE_IMAGE.read_bytes()).decode("ascii")

    async def handler(websocket) -> None:
        print("client connected")
        try:
            await publish_alerts(websocket, max(1, args.interval_seconds), image_data_url)
        finally:
            print("client disconnected")

    async with serve(handler, args.host, args.port):
        print(f"mock websocket listening at ws://{args.host}:{args.port}/test")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import re
import time
from pathlib import Path
from typing import Any

from config import MEDIA_DIR, Settings
from database import Database
from models import (
    AlertEvent,
    EventInput,
    ParsedMessage,
    PolarPosition,
    SnapshotAsset,
    build_duplicate_key,
    serialize_alert,
    serialize_track,
)


DATA_URL_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$")
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


class PersistentState:
    def __init__(self, settings: Settings, database: Database) -> None:
        self.settings = settings
        self.database = database
        self._lock = asyncio.Lock()
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._duplicate_keys: dict[str, int] = {}
        self._upstream_connected = False
        self._last_error: str | None = None
        self._last_message_at_ms: int | None = None

    async def register_subscriber(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=4)
        async with self._lock:
            self._subscribers.add(queue)
            snapshot = self.build_snapshot_locked(limit=self.settings.alert_page_size)
        self._queue_replace_latest(queue, snapshot)
        return queue

    async def unregister_subscriber(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            self._subscribers.discard(queue)

    async def set_connection_status(self, connected: bool, error: str | None = None) -> None:
        async with self._lock:
            self._upstream_connected = connected
            if error:
                self._last_error = error
            elif connected:
                self._last_error = None
            snapshot = self.build_snapshot_locked(limit=self.settings.alert_page_size)
            subscribers = list(self._subscribers)
        self._broadcast(subscribers, snapshot)

    async def ingest_message(self, parsed_message: ParsedMessage) -> int:
        added_count = 0
        now_ms = _now_ms()
        async with self._lock:
            media_assets = self._store_snapshots(parsed_message.snapshots, parsed_message.timestamp_ms)
            for event_input in parsed_message.events:
                if self._is_duplicate(event_input, now_ms):
                    continue
                self.database.insert_alert(_alert_record(event_input, media_assets))
                added_count += 1
            self._last_message_at_ms = parsed_message.timestamp_ms
            self._last_error = None
            self._prune_duplicate_keys(now_ms)
            self._prune_old_alerts(now_ms)
            snapshot = self.build_snapshot_locked(limit=self.settings.alert_page_size)
            subscribers = list(self._subscribers)
        self._broadcast(subscribers, snapshot)
        return added_count

    async def build_snapshot(self, limit: int | None = None, offset: int = 0) -> dict[str, Any]:
        async with self._lock:
            return self.build_snapshot_locked(limit=limit or self.settings.alert_page_size, offset=offset)

    def build_snapshot_locked(self, limit: int, offset: int = 0) -> dict[str, Any]:
        now_ms = _now_ms()
        rows, total = self.database.list_alerts(limit=limit, offset=offset)
        recent_rows = self.database.recent_alerts(
            now_ms - max(self.settings.track_window_seconds, 600) * 1000
        )
        tracks_by_id: dict[str, AlertEvent] = {}
        for row in recent_rows:
            event = row_to_event(row)
            current = tracks_by_id.get(event.track_id)
            if current is None or event.timestamp_ms >= current.timestamp_ms:
                tracks_by_id[event.track_id] = event
        return {
            "appTitle": self.settings.app_title,
            "viewer": {
                "mode": "full",
                "canDemo": False,
                "canClear": False,
            },
            "status": {
                "connected": self._upstream_connected,
                "lastError": self._last_error,
                "lastMessageAtMs": self._last_message_at_ms,
            },
            "map": {
                "maxDistanceM": self.settings.map_max_distance_m,
                "trackWindowMs": self.settings.track_window_seconds * 1000,
            },
            "alerts": [serialize_alert(row_to_event(row)) for row in rows],
            "alertsTotal": total,
            "alertsOffset": offset,
            "alertsLimit": limit,
            "hasMoreAlerts": offset + len(rows) < total,
            "tracks": [serialize_track(event) for event in tracks_by_id.values()],
        }

    async def list_alerts(
        self,
        limit: int,
        offset: int,
        start_ms: int | None = None,
        end_ms: int | None = None,
    ) -> dict[str, Any]:
        async with self._lock:
            rows, total = self.database.list_alerts(
                limit=limit, offset=offset, start_ms=start_ms, end_ms=end_ms
            )
        return {
            "alerts": [serialize_alert(row_to_event(row)) for row in rows],
            "total": total,
            "offset": offset,
            "limit": limit,
            "hasMore": offset + len(rows) < total,
        }

    async def timeline_tracks(self, start_ms: int, end_ms: int) -> dict[str, Any]:
        async with self._lock:
            rows = self.database.alerts_between(start_ms, end_ms)
        events = [row_to_event(row) for row in rows]
        return {
            "tracks": [serialize_track(event) for event in events],
            "alerts": [serialize_alert(event) for event in events],
            "startMs": start_ms,
            "endMs": end_ms,
            "count": len(events),
        }

    async def timeline_dates(self) -> dict[str, Any]:
        async with self._lock:
            dates = self.database.alert_dates()
        return {"dates": dates}

    async def get_snapshot_asset(self, group_id: str, kind: str) -> SnapshotAsset | None:
        try:
            alert_id = int(group_id)
        except ValueError:
            return None
        row = self.database.get_alert(alert_id)
        if row is None:
            return None
        if kind == "rgb":
            path = row["rgb_media_path"]
            mime_type = row["rgb_mime_type"]
        elif kind == "thermal":
            path = row["thermal_media_path"]
            mime_type = row["thermal_mime_type"]
        else:
            return None
        if not path or not mime_type:
            return None
        media_path = Path(path)
        if not media_path.exists():
            return None
        return SnapshotAsset(mime_type=mime_type, content=media_path.read_bytes())

    def _is_duplicate(self, event_input: EventInput, now_ms: int) -> bool:
        duplicate_key = build_duplicate_key(event_input)
        expires_at = self._duplicate_keys.get(duplicate_key)
        if expires_at and expires_at > now_ms:
            return True
        self._duplicate_keys[duplicate_key] = now_ms + self.settings.dedupe_window_seconds * 1000
        return False

    def _store_snapshots(self, snapshots: dict[str, str], timestamp_ms: int) -> dict[str, tuple[str, str]]:
        MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        stored: dict[str, tuple[str, str]] = {}
        for key, kind in (("RGB1", "rgb"), ("T2", "thermal")):
            asset = _decode_snapshot(snapshots.get(key))
            if asset is None:
                continue
            extension = EXTENSIONS.get(asset.mime_type, ".bin")
            file_name = f"{timestamp_ms}-{kind}-{time.time_ns()}{extension}"
            path = MEDIA_DIR / file_name
            path.write_bytes(asset.content)
            stored[kind] = (str(path), asset.mime_type)
        return stored

    def _prune_old_alerts(self, now_ms: int) -> None:
        cutoff_ms = now_ms - self.settings.retention_days * 24 * 60 * 60 * 1000
        for row in self.database.delete_old_alerts(cutoff_ms):
            for key in ("rgb_media_path", "thermal_media_path"):
                path = row[key]
                if path:
                    Path(path).unlink(missing_ok=True)

    def _prune_duplicate_keys(self, now_ms: int) -> None:
        expired = [key for key, expires_at in self._duplicate_keys.items() if expires_at <= now_ms]
        for key in expired:
            self._duplicate_keys.pop(key, None)

    def _broadcast(self, subscribers: list[asyncio.Queue[dict[str, Any]]], snapshot: dict[str, Any]) -> None:
        for queue in subscribers:
            self._queue_replace_latest(queue, snapshot)

    @staticmethod
    def _queue_replace_latest(queue: asyncio.Queue[dict[str, Any]], snapshot: dict[str, Any]) -> None:
        while queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        queue.put_nowait(snapshot)


def row_to_event(row: Any) -> AlertEvent:
    positions = [PolarPosition(float(item["distance"]), float(item["angle"])) for item in json.loads(row["positions_json"])]
    bounding_boxes = json.loads(row["bounding_boxes_json"])
    return AlertEvent(
        id=str(row["id"]),
        track_id=str(row["track_id"]),
        classification=str(row["classification"]),
        display_type=str(row["display_type"]),
        bearing=str(row["bearing"]),
        confidence_percent=int(row["confidence_percent"]),
        timestamp_ms=int(row["timestamp_ms"]),
        timestamp_iso=str(row["timestamp_iso"]),
        positions=positions,
        bounding_boxes=bounding_boxes,
        snapshot_group_id=str(row["id"]),
        has_rgb_snapshot=bool(row["rgb_media_path"]),
        has_thermal_snapshot=bool(row["thermal_media_path"]),
    )


def _alert_record(event_input: EventInput, media_assets: dict[str, tuple[str, str]]) -> dict[str, Any]:
    current = event_input.current_position
    record = {
        "track_id": event_input.track_id,
        "classification": event_input.classification,
        "display_type": event_input.display_type,
        "bearing": event_input.bearing,
        "confidence_percent": event_input.confidence_percent,
        "timestamp_ms": event_input.timestamp_ms,
        "timestamp_iso": event_input.timestamp_iso,
        "distance_m": current.distance,
        "angle_deg": current.angle,
        "positions": [{"distance": p.distance, "angle": p.angle} for p in event_input.positions],
        "bounding_boxes": event_input.bounding_boxes,
    }
    if "rgb" in media_assets:
        record["rgb_media_path"], record["rgb_mime_type"] = media_assets["rgb"]
    if "thermal" in media_assets:
        record["thermal_media_path"], record["thermal_mime_type"] = media_assets["thermal"]
    return record


def _decode_snapshot(raw_snapshot: str | None) -> SnapshotAsset | None:
    if not raw_snapshot or not raw_snapshot.strip():
        return None
    raw_snapshot = raw_snapshot.strip()
    mime_type = "image/jpeg"
    raw_payload = raw_snapshot
    matched = DATA_URL_RE.match(raw_snapshot)
    if matched:
        mime_type = matched.group(1)
        raw_payload = matched.group(2)
    try:
        return SnapshotAsset(mime_type=mime_type, content=base64.b64decode(raw_payload))
    except (ValueError, binascii.Error):
        return None


def _now_ms() -> int:
    return int(time.time() * 1000)

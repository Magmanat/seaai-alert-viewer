from __future__ import annotations

import asyncio
import base64
import binascii
import itertools
import re
from collections import deque
from time import time
from typing import Any

from config import Settings
from models import (
    AlertEvent,
    EventInput,
    ParsedMessage,
    SnapshotAsset,
    build_duplicate_key,
    serialize_alert,
    serialize_track,
)


DATA_URL_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$")


class MemoryState:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._lock = asyncio.Lock()
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._panel_alerts: deque[AlertEvent] = deque(maxlen=settings.max_panel_alerts)
        self._recent_alerts: deque[AlertEvent] = deque()
        self._snapshot_groups: dict[str, dict[str, SnapshotAsset]] = {}
        self._duplicate_keys: dict[str, int] = {}
        self._sequence = itertools.count(1)
        self._upstream_connected = False
        self._last_error: str | None = None
        self._last_message_at_ms: int | None = None

    async def register_subscriber(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=4)
        async with self._lock:
            self._subscribers.add(queue)
            snapshot = self._build_snapshot_locked()
        self._queue_replace_latest(queue, snapshot)
        return queue

    async def unregister_subscriber(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            self._subscribers.discard(queue)

    async def set_connection_status(
        self, connected: bool, error: str | None = None
    ) -> None:
        async with self._lock:
            self._upstream_connected = connected
            if error:
                self._last_error = error
            elif connected:
                self._last_error = None
            snapshot = self._build_snapshot_locked()
            subscribers = list(self._subscribers)
        self._broadcast(subscribers, snapshot)

    async def ingest_message(self, parsed_message: ParsedMessage) -> int:
        added_count = 0
        now_ms = int(time() * 1000)

        async with self._lock:
            snapshot_group_id, snapshot_kinds = self._store_snapshots_locked(
                parsed_message.snapshots
            )

            for event_input in parsed_message.events:
                if self._is_duplicate_locked(event_input, now_ms):
                    continue

                alert_event = AlertEvent(
                    id=f"alert-{next(self._sequence)}",
                    track_id=event_input.track_id,
                    classification=event_input.classification,
                    display_type=event_input.display_type,
                    bearing=event_input.bearing,
                    confidence_percent=event_input.confidence_percent,
                    timestamp_ms=event_input.timestamp_ms,
                    timestamp_iso=event_input.timestamp_iso,
                    positions=event_input.positions,
                    bounding_boxes=event_input.bounding_boxes,
                    snapshot_group_id=snapshot_group_id,
                    has_rgb_snapshot="rgb" in snapshot_kinds,
                    has_thermal_snapshot="thermal" in snapshot_kinds,
                )
                self._panel_alerts.append(alert_event)
                self._recent_alerts.append(alert_event)
                added_count += 1

            self._last_message_at_ms = parsed_message.timestamp_ms
            self._last_error = None

            self._prune_recent_alerts_locked(now_ms)
            self._prune_duplicate_keys_locked(now_ms)
            self._prune_unused_snapshots_locked()
            snapshot = self._build_snapshot_locked()
            subscribers = list(self._subscribers)

        self._broadcast(subscribers, snapshot)
        return added_count

    async def build_snapshot(self) -> dict[str, Any]:
        async with self._lock:
            return self._build_snapshot_locked()

    async def clear_panel_alerts(self) -> None:
        async with self._lock:
            self._panel_alerts.clear()
            self._prune_unused_snapshots_locked()
            snapshot = self._build_snapshot_locked()
            subscribers = list(self._subscribers)

        self._broadcast(subscribers, snapshot)

    async def get_snapshot_asset(
        self, group_id: str, kind: str
    ) -> SnapshotAsset | None:
        async with self._lock:
            group = self._snapshot_groups.get(group_id)
            if not group:
                return None
            return group.get(kind)

    def _is_duplicate_locked(self, event_input: EventInput, now_ms: int) -> bool:
        duplicate_key = build_duplicate_key(event_input)
        expires_at = self._duplicate_keys.get(duplicate_key)
        if expires_at and expires_at > now_ms:
            return True

        ttl_ms = self.settings.dedupe_window_seconds * 1000
        self._duplicate_keys[duplicate_key] = now_ms + ttl_ms
        return False

    def _store_snapshots_locked(
        self, snapshots: dict[str, str]
    ) -> tuple[str | None, set[str]]:
        if not snapshots:
            return None, set()

        decoded_assets: dict[str, SnapshotAsset] = {}
        rgb_asset = _decode_snapshot(snapshots.get("RGB1"))
        thermal_asset = _decode_snapshot(snapshots.get("T2"))
        if rgb_asset:
            decoded_assets["rgb"] = rgb_asset
        if thermal_asset:
            decoded_assets["thermal"] = thermal_asset
        if not decoded_assets:
            return None, set()

        group_id = f"snap-{next(self._sequence)}"
        self._snapshot_groups[group_id] = decoded_assets
        return group_id, set(decoded_assets.keys())

    def _prune_recent_alerts_locked(self, now_ms: int) -> None:
        window_ms = self.settings.track_window_seconds * 1000
        while (
            self._recent_alerts
            and now_ms - self._recent_alerts[0].timestamp_ms > window_ms
        ):
            self._recent_alerts.popleft()

    def _prune_duplicate_keys_locked(self, now_ms: int) -> None:
        expired_keys = [
            key
            for key, expires_at in self._duplicate_keys.items()
            if expires_at <= now_ms
        ]
        for key in expired_keys:
            self._duplicate_keys.pop(key, None)

    def _prune_unused_snapshots_locked(self) -> None:
        in_use = {
            alert.snapshot_group_id
            for alert in self._panel_alerts
            if alert.snapshot_group_id
        }
        unused = [
            group_id for group_id in self._snapshot_groups if group_id not in in_use
        ]
        for group_id in unused:
            self._snapshot_groups.pop(group_id, None)

    def _build_snapshot_locked(self) -> dict[str, Any]:
        now_ms = int(time() * 1000)
        self._prune_recent_alerts_locked(now_ms)

        tracks_by_id: dict[str, AlertEvent] = {}
        for alert in self._recent_alerts:
            current = tracks_by_id.get(alert.track_id)
            if current is None or alert.timestamp_ms >= current.timestamp_ms:
                tracks_by_id[alert.track_id] = alert

        map_tracks = [
            serialize_track(alert)
            for alert in sorted(
                tracks_by_id.values(),
                key=lambda item: (item.timestamp_ms, item.track_id),
                reverse=True,
            )
        ]
        panel_alerts = [
            serialize_alert(alert) for alert in reversed(self._panel_alerts)
        ]

        return {
            "appTitle": self.settings.app_title,
            "status": {
                "connected": self._upstream_connected,
                "lastError": self._last_error,
                "lastMessageAtMs": self._last_message_at_ms,
            },
            "map": {
                "maxDistanceM": self.settings.map_max_distance_m,
                "trackWindowMs": self.settings.track_window_seconds * 1000,
            },
            "alerts": panel_alerts,
            "tracks": map_tracks,
        }

    def _broadcast(
        self, subscribers: list[asyncio.Queue[dict[str, Any]]], snapshot: dict[str, Any]
    ) -> None:
        for queue in subscribers:
            self._queue_replace_latest(queue, snapshot)

    @staticmethod
    def _queue_replace_latest(
        queue: asyncio.Queue[dict[str, Any]], snapshot: dict[str, Any]
    ) -> None:
        while queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        queue.put_nowait(snapshot)


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

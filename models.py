from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


CLASSIFICATION_MAP = {
    "BOAT": "VESSEL",
    "HAZARD": "VESSEL",
    "HUMAN_IN_WATER": "SWIMMER",
    "HUMAN_ON_LAND": "HUMAN",
    "VESSEL": "VESSEL",
    "SWIMMER": "SWIMMER",
    "HUMAN": "HUMAN",
}

DISPLAY_TYPE_MAP = {
    "VESSEL": "vessel",
    "SWIMMER": "swimmer",
    "HUMAN": "human",
}

DISPLAY_LABELS = {
    "vessel": "Vessel",
    "swimmer": "Swimmer",
    "human": "Human",
}

ALLOWED_BEARINGS = {
    "APPROACHING",
    "DEPARTING",
    "LATERAL_CROSSING",
    "UNKNOWN",
}


@dataclass(frozen=True, slots=True)
class PolarPosition:
    distance: float
    angle: float


@dataclass(frozen=True, slots=True)
class EventInput:
    track_id: str
    classification: str
    display_type: str
    bearing: str
    confidence_percent: int
    timestamp_ms: int
    timestamp_iso: str
    positions: list[PolarPosition]
    bounding_boxes: dict[str, list[float]]

    @property
    def current_position(self) -> PolarPosition:
        return self.positions[-1]


@dataclass(frozen=True, slots=True)
class ParsedMessage:
    timestamp_ms: int
    timestamp_iso: str
    snapshots: dict[str, str]
    events: list[EventInput]


@dataclass(frozen=True, slots=True)
class AlertEvent:
    id: str
    track_id: str
    classification: str
    display_type: str
    bearing: str
    confidence_percent: int
    timestamp_ms: int
    timestamp_iso: str
    positions: list[PolarPosition]
    bounding_boxes: dict[str, list[float]]
    snapshot_group_id: str | None = None
    has_rgb_snapshot: bool = False
    has_thermal_snapshot: bool = False

    @property
    def current_position(self) -> PolarPosition:
        return self.positions[-1]


@dataclass(frozen=True, slots=True)
class SnapshotAsset:
    mime_type: str
    content: bytes


def parse_seaai_message(raw_text: str) -> ParsedMessage:
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON payload") from exc

    objects = payload.get("objects")
    if not isinstance(objects, list) or not objects:
        raise ValueError("Payload does not contain a non-empty objects array")

    timestamp_ms, timestamp_iso = _parse_timestamp(payload.get("datetime"))
    snapshots = (
        payload.get("snapshots") if isinstance(payload.get("snapshots"), dict) else {}
    )

    valid_events: list[EventInput] = []
    for raw_object in objects:
        if not isinstance(raw_object, dict):
            continue
        parsed = _parse_object(raw_object, timestamp_ms, timestamp_iso)
        if parsed is not None:
            valid_events.append(parsed)

    if not valid_events:
        raise ValueError("Payload contains no valid SEAAI detections")

    return ParsedMessage(
        timestamp_ms=timestamp_ms,
        timestamp_iso=timestamp_iso,
        snapshots={
            key: value
            for key, value in snapshots.items()
            if key in {"RGB1", "T2"} and isinstance(value, str) and value.strip()
        },
        events=valid_events,
    )


def build_duplicate_key(event: EventInput) -> str:
    position = event.current_position
    return "|".join(
        [
            str(event.timestamp_ms),
            event.track_id,
            event.classification,
            f"{position.distance:.2f}",
            f"{position.angle:.2f}",
            str(event.confidence_percent),
        ]
    )


def serialize_alert(event: AlertEvent) -> dict[str, Any]:
    group_id = event.snapshot_group_id
    rgb_url = (
        f"/api/snapshots/{group_id}/rgb"
        if group_id and event.has_rgb_snapshot
        else None
    )
    thermal_url = (
        f"/api/snapshots/{group_id}/thermal"
        if group_id and event.has_thermal_snapshot
        else None
    )
    rgb_bounding_box = _serialize_bounding_box(event.bounding_boxes.get("RGB"))
    thermal_bounding_box = _serialize_bounding_box(event.bounding_boxes.get("T2"))
    preferred_view = "thermal" if thermal_url else ("rgb" if rgb_url else None)
    thumbnail_url = thermal_url or rgb_url
    thumbnail_bounding_box = thermal_bounding_box or rgb_bounding_box

    return {
        "id": event.id,
        "trackId": event.track_id,
        "classification": event.classification,
        "type": event.display_type,
        "typeLabel": DISPLAY_LABELS[event.display_type],
        "bearing": event.bearing.replace("_", " ").title(),
        "confidence": event.confidence_percent,
        "distanceM": round(event.current_position.distance),
        "angleDeg": round(event.current_position.angle, 1),
        "timestampMs": event.timestamp_ms,
        "timestampIso": event.timestamp_iso,
        "rgbUrl": rgb_url,
        "thermalUrl": thermal_url,
        "thumbnailUrl": thumbnail_url,
        "boundingBox": thumbnail_bounding_box,
        "rgbBoundingBox": rgb_bounding_box,
        "thermalBoundingBox": thermal_bounding_box,
        "preferredView": preferred_view,
    }


def serialize_track(event: AlertEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "trackId": event.track_id,
        "type": event.display_type,
        "typeLabel": DISPLAY_LABELS[event.display_type],
        "bearing": event.bearing.replace("_", " ").title(),
        "confidence": event.confidence_percent,
        "timestampMs": event.timestamp_ms,
        "timestampIso": event.timestamp_iso,
        "positions": [
            {"distance": round(position.distance, 2), "angle": round(position.angle, 2)}
            for position in event.positions
        ],
    }


def _parse_object(
    raw_object: dict[str, Any], timestamp_ms: int, timestamp_iso: str
) -> EventInput | None:
    track_id = raw_object.get("track_id")
    if track_id in {None, ""}:
        return None

    classification = CLASSIFICATION_MAP.get(
        str(raw_object.get("classification", "")).upper()
    )
    if classification is None:
        return None

    current_position = _parse_position(raw_object.get("position"))
    if current_position is None:
        return None

    history_positions = _parse_history(raw_object.get("position_history"))
    positions = [*history_positions, current_position]

    bearing = str(raw_object.get("bearing_identification", "UNKNOWN")).upper()
    if bearing not in ALLOWED_BEARINGS:
        bearing = "UNKNOWN"

    confidence_percent = _normalize_confidence(raw_object.get("confidence_level"))
    bounding_boxes = _parse_bounding_boxes(raw_object.get("bounding_boxes"))

    return EventInput(
        track_id=str(track_id),
        classification=classification,
        display_type=DISPLAY_TYPE_MAP[classification],
        bearing=bearing,
        confidence_percent=confidence_percent,
        timestamp_ms=timestamp_ms,
        timestamp_iso=timestamp_iso,
        positions=positions,
        bounding_boxes=bounding_boxes,
    )


def _parse_timestamp(raw_timestamp: Any) -> tuple[int, str]:
    if isinstance(raw_timestamp, str) and raw_timestamp.strip():
        candidate = raw_timestamp.strip()
        if candidate.endswith("Z"):
            candidate = candidate[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(candidate)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            utc_timestamp = parsed.astimezone(timezone.utc)
            return int(
                utc_timestamp.timestamp() * 1000
            ), utc_timestamp.isoformat().replace("+00:00", "Z")
        except ValueError:
            pass

    now = datetime.now(timezone.utc)
    return int(now.timestamp() * 1000), now.isoformat().replace("+00:00", "Z")


def _parse_position(raw_position: Any) -> PolarPosition | None:
    if not isinstance(raw_position, list) or len(raw_position) != 2:
        return None
    try:
        distance = float(raw_position[0])
        angle = float(raw_position[1])
    except (TypeError, ValueError):
        return None
    return PolarPosition(distance=max(distance, 0.0), angle=angle)


def _parse_history(raw_history: Any) -> list[PolarPosition]:
    if not isinstance(raw_history, list):
        return []
    positions: list[PolarPosition] = []
    for item in raw_history:
        parsed = _parse_position(item)
        if parsed is not None:
            positions.append(parsed)
    return positions


def _parse_bounding_boxes(raw_boxes: Any) -> dict[str, list[float]]:
    if not isinstance(raw_boxes, dict):
        return {}

    parsed: dict[str, list[float]] = {}
    rgb_box = raw_boxes.get("RGB1")
    thermal_box = raw_boxes.get("T2")

    if isinstance(rgb_box, list) and len(rgb_box) == 4:
        try:
            parsed["RGB"] = [float(value) for value in rgb_box]
        except (TypeError, ValueError):
            pass

    if isinstance(thermal_box, list) and len(thermal_box) == 4:
        try:
            parsed["T2"] = [float(value) for value in thermal_box]
        except (TypeError, ValueError):
            pass

    return parsed


def _normalize_confidence(raw_confidence: Any) -> int:
    try:
        confidence = float(raw_confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    if confidence <= 1:
        confidence *= 100

    return max(0, min(100, int(round(confidence))))


def _serialize_bounding_box(raw_bounding_box: Any) -> list[float] | None:
    if not isinstance(raw_bounding_box, list) or len(raw_bounding_box) != 4:
        return None

    try:
        return [float(value) for value in raw_bounding_box]
    except (TypeError, ValueError):
        return None

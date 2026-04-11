from __future__ import annotations

import os
from dataclasses import dataclass


def _env_str(name: str, default: str) -> str:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else default


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


@dataclass(frozen=True, slots=True)
class Settings:
    app_title: str = _env_str("APP_TITLE", "SEAAI Live Monitor")
    host: str = _env_str("APP_HOST", "127.0.0.1")
    port: int = _env_int("APP_PORT", 8765)
    seaai_ws_url: str = _env_str("SEAAI_WS_URL", "")
    max_panel_alerts: int = _env_int("MAX_PANEL_ALERTS", 50)
    track_window_seconds: int = _env_int("TRACK_WINDOW_SECONDS", 60)
    map_max_distance_m: int = _env_int("MAP_MAX_DISTANCE_M", 1000)
    dedupe_window_seconds: int = _env_int("DEDUPE_WINDOW_SECONDS", 15)
    reconnect_delay_seconds: int = _env_int("RECONNECT_DELAY_SECONDS", 5)


settings = Settings()

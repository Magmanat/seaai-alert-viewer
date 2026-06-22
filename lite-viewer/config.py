from __future__ import annotations

import argparse
import os
import sys
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
    seaai_ws_url: str = _env_str("SEAAI_WS_URL", "ws://localhost:8080/test")
    max_panel_alerts: int = _env_int("MAX_PANEL_ALERTS", 50)
    track_window_seconds: int = _env_int("TRACK_WINDOW_SECONDS", 60)
    map_max_distance_m: int = _env_int("MAP_MAX_DISTANCE_M", 1000)
    dedupe_window_seconds: int = _env_int("DEDUPE_WINDOW_SECONDS", 15)
    reconnect_delay_seconds: int = _env_int("RECONNECT_DELAY_SECONDS", 5)


def _build_parser(defaults: Settings) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the SEAAI live monitor server.",
    )
    parser.add_argument("--app-title", default=defaults.app_title, help="UI application title")
    parser.add_argument("--host", default=defaults.host, help="Host address to bind")
    parser.add_argument("--port", type=int, default=defaults.port, help="Port to bind")
    parser.add_argument(
        "--seaai-ws-url",
        default=defaults.seaai_ws_url,
        help="Upstream SEAAI websocket URL",
    )
    parser.add_argument(
        "--max-panel-alerts",
        type=int,
        default=defaults.max_panel_alerts,
        help="Maximum number of alerts kept in the panel",
    )
    parser.add_argument(
        "--track-window-seconds",
        type=int,
        default=defaults.track_window_seconds,
        help="Seconds of alert history kept for map tracks",
    )
    parser.add_argument(
        "--map-max-distance-m",
        type=int,
        default=defaults.map_max_distance_m,
        help="Maximum map radius in meters",
    )
    parser.add_argument(
        "--dedupe-window-seconds",
        type=int,
        default=defaults.dedupe_window_seconds,
        help="Seconds to suppress duplicate detections",
    )
    parser.add_argument(
        "--reconnect-delay-seconds",
        type=int,
        default=defaults.reconnect_delay_seconds,
        help="Seconds between upstream websocket reconnect attempts",
    )
    return parser


def load_settings(argv: list[str] | None = None) -> Settings:
    defaults = Settings()
    parser = _build_parser(defaults)
    args, _ = parser.parse_known_args(sys.argv[1:] if argv is None else argv)
    return Settings(
        app_title=args.app_title,
        host=args.host,
        port=args.port,
        seaai_ws_url=args.seaai_ws_url,
        max_panel_alerts=args.max_panel_alerts,
        track_window_seconds=args.track_window_seconds,
        map_max_distance_m=args.map_max_distance_m,
        dedupe_window_seconds=args.dedupe_window_seconds,
        reconnect_delay_seconds=args.reconnect_delay_seconds,
    )


settings = load_settings()

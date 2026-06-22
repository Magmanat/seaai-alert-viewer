from __future__ import annotations

import argparse
import os
import secrets
import sys
from dataclasses import dataclass
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
REPO_DIR = APP_DIR.parent
DATA_DIR = APP_DIR / "data"
MEDIA_DIR = DATA_DIR / "media"
DB_PATH = DATA_DIR / "full-viewer.sqlite3"


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


def _jwt_secret() -> str:
    configured = os.getenv("JWT_SECRET")
    if configured and configured.strip():
        return configured.strip()
    secret_file = DATA_DIR / ".jwt-secret"
    if secret_file.exists():
        return secret_file.read_text(encoding="utf-8").strip()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    generated = secrets.token_urlsafe(48)
    secret_file.write_text(generated, encoding="utf-8")
    return generated


@dataclass(frozen=True, slots=True)
class Settings:
    app_title: str = _env_str("APP_TITLE", "SEAAI Full Viewer")
    host: str = _env_str("APP_HOST", "127.0.0.1")
    port: int = _env_int("APP_PORT", 8766)
    seaai_ws_url: str = _env_str("SEAAI_WS_URL", "ws://localhost:8080/test")
    admin_password: str = _env_str("ADMIN_PASSWORD", "admin")
    jwt_secret: str = ""
    jwt_expiry_seconds: int = _env_int("JWT_EXPIRY_SECONDS", 86400)
    max_panel_alerts: int = _env_int("MAX_PANEL_ALERTS", 50)
    alert_page_size: int = _env_int("ALERT_PAGE_SIZE", 30)
    track_window_seconds: int = _env_int("TRACK_WINDOW_SECONDS", 60)
    map_max_distance_m: int = _env_int("MAP_MAX_DISTANCE_M", 1000)
    dedupe_window_seconds: int = _env_int("DEDUPE_WINDOW_SECONDS", 15)
    reconnect_delay_seconds: int = _env_int("RECONNECT_DELAY_SECONDS", 5)
    retention_days: int = _env_int("RETENTION_DAYS", 90)


def _build_parser(defaults: Settings) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the SEAAI full viewer server.")
    parser.add_argument("--app-title", default=defaults.app_title)
    parser.add_argument("--host", default=defaults.host)
    parser.add_argument("--port", type=int, default=defaults.port)
    parser.add_argument("--seaai-ws-url", default=defaults.seaai_ws_url)
    parser.add_argument("--admin-password", default=defaults.admin_password)
    parser.add_argument("--max-panel-alerts", type=int, default=defaults.max_panel_alerts)
    parser.add_argument("--alert-page-size", type=int, default=defaults.alert_page_size)
    parser.add_argument("--track-window-seconds", type=int, default=defaults.track_window_seconds)
    parser.add_argument("--map-max-distance-m", type=int, default=defaults.map_max_distance_m)
    parser.add_argument("--dedupe-window-seconds", type=int, default=defaults.dedupe_window_seconds)
    parser.add_argument("--reconnect-delay-seconds", type=int, default=defaults.reconnect_delay_seconds)
    parser.add_argument("--retention-days", type=int, default=defaults.retention_days)
    return parser


def load_settings(argv: list[str] | None = None) -> Settings:
    defaults = Settings(jwt_secret=_jwt_secret())
    parser = _build_parser(defaults)
    args, _ = parser.parse_known_args(sys.argv[1:] if argv is None else argv)
    return Settings(
        app_title=args.app_title,
        host=args.host,
        port=args.port,
        seaai_ws_url=args.seaai_ws_url,
        admin_password=args.admin_password,
        jwt_secret=defaults.jwt_secret,
        max_panel_alerts=args.max_panel_alerts,
        alert_page_size=args.alert_page_size,
        track_window_seconds=args.track_window_seconds,
        map_max_distance_m=args.map_max_distance_m,
        dedupe_window_seconds=args.dedupe_window_seconds,
        reconnect_delay_seconds=args.reconnect_delay_seconds,
        retention_days=args.retention_days,
    )


settings = load_settings()

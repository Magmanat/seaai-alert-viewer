from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from auth import hash_password


SCHEMA = """
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id TEXT NOT NULL,
  classification TEXT NOT NULL,
  display_type TEXT NOT NULL,
  bearing TEXT NOT NULL,
  confidence_percent INTEGER NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  timestamp_iso TEXT NOT NULL,
  distance_m REAL NOT NULL,
  angle_deg REAL NOT NULL,
  positions_json TEXT NOT NULL,
  bounding_boxes_json TEXT NOT NULL,
  rgb_media_path TEXT,
  rgb_mime_type TEXT,
  thermal_media_path TEXT,
  thermal_mime_type TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp_ms DESC);
"""


class Database:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self, admin_password: str, seaai_ws_url: str) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            admin = connection.execute(
                "SELECT id FROM users WHERE username = ?", ("admin",)
            ).fetchone()
            now_ms = _now_ms()
            if admin is None:
                connection.execute(
                    """
                    INSERT INTO users (username, password_hash, role, created_at_ms)
                    VALUES (?, ?, 'admin', ?)
                    """,
                    ("admin", hash_password(admin_password), now_ms),
                )
            setting = connection.execute(
                "SELECT key FROM settings WHERE key = 'seaai_ws_url'"
            ).fetchone()
            if setting is None:
                connection.execute(
                    "INSERT INTO settings (key, value) VALUES ('seaai_ws_url', ?)",
                    (seaai_ws_url,),
                )

    def get_user_by_username(self, username: str) -> sqlite3.Row | None:
        with self.connect() as connection:
            return connection.execute(
                "SELECT * FROM users WHERE username = ?", (username,)
            ).fetchone()

    def get_user_by_id(self, user_id: int) -> sqlite3.Row | None:
        with self.connect() as connection:
            return connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    def list_users(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT id, username, role, created_at_ms FROM users ORDER BY username"
            ).fetchall()
        return [dict(row) for row in rows]

    def create_user(self, username: str, password: str, role: str = "user") -> dict[str, Any]:
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (username, password_hash, role, created_at_ms)
                VALUES (?, ?, ?, ?)
                """,
                (username, hash_password(password), role, _now_ms()),
            )
            row = connection.execute(
                "SELECT id, username, role, created_at_ms FROM users WHERE id = ?",
                (cursor.lastrowid,),
            ).fetchone()
        return dict(row)

    def delete_user(self, user_id: int) -> bool:
        with self.connect() as connection:
            row = connection.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
            if row is None or row["role"] == "admin":
                return False
            cursor = connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return cursor.rowcount > 0

    def get_setting(self, key: str, default: str = "") -> str:
        with self.connect() as connection:
            row = connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return str(row["value"]) if row else default

    def set_setting(self, key: str, value: str) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, value),
            )

    def insert_alert(self, alert: dict[str, Any]) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO alerts (
                  track_id, classification, display_type, bearing, confidence_percent,
                  timestamp_ms, timestamp_iso, distance_m, angle_deg, positions_json,
                  bounding_boxes_json, rgb_media_path, rgb_mime_type,
                  thermal_media_path, thermal_mime_type, created_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    alert["track_id"],
                    alert["classification"],
                    alert["display_type"],
                    alert["bearing"],
                    alert["confidence_percent"],
                    alert["timestamp_ms"],
                    alert["timestamp_iso"],
                    alert["distance_m"],
                    alert["angle_deg"],
                    json.dumps(alert["positions"]),
                    json.dumps(alert["bounding_boxes"]),
                    alert.get("rgb_media_path"),
                    alert.get("rgb_mime_type"),
                    alert.get("thermal_media_path"),
                    alert.get("thermal_mime_type"),
                    _now_ms(),
                ),
            )
        return int(cursor.lastrowid)

    def list_alerts(self, limit: int, offset: int = 0) -> tuple[list[sqlite3.Row], int]:
        with self.connect() as connection:
            total = connection.execute("SELECT COUNT(*) AS count FROM alerts").fetchone()["count"]
            rows = connection.execute(
                "SELECT * FROM alerts ORDER BY timestamp_ms DESC, id DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return rows, int(total)

    def recent_alerts(self, since_ms: int) -> list[sqlite3.Row]:
        with self.connect() as connection:
            return connection.execute(
                "SELECT * FROM alerts WHERE timestamp_ms >= ? ORDER BY timestamp_ms DESC, id DESC",
                (since_ms,),
            ).fetchall()

    def get_alert(self, alert_id: int) -> sqlite3.Row | None:
        with self.connect() as connection:
            return connection.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()

    def delete_old_alerts(self, cutoff_ms: int) -> list[sqlite3.Row]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT rgb_media_path, thermal_media_path FROM alerts WHERE timestamp_ms < ?",
                (cutoff_ms,),
            ).fetchall()
            connection.execute("DELETE FROM alerts WHERE timestamp_ms < ?", (cutoff_ms,))
        return rows


def _now_ms() -> int:
    import time

    return int(time.time() * 1000)

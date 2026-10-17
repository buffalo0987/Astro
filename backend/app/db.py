"""SQLite (WAL mode) persistence layer for AstroPi."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from .config import CONFIG


SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS site_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    latitude_deg REAL NOT NULL,
    longitude_deg REAL NOT NULL,
    elevation_m REAL NOT NULL DEFAULT 250.0,
    bortle_class INTEGER DEFAULT 4,
    is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dso_catalog (
    id TEXT PRIMARY KEY,
    common_name TEXT NOT NULL,
    catalog_ids TEXT NOT NULL,
    object_type TEXT NOT NULL,
    constellation TEXT NOT NULL,
    ra_hours REAL NOT NULL,
    dec_deg REAL NOT NULL,
    magnitude REAL,
    size_arcmin REAL,
    recommended_focal_mm TEXT DEFAULT '135-200mm',
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sequence_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target_name TEXT NOT NULL,
    target_ra_hours REAL,
    target_dec_deg REAL,
    status TEXT NOT NULL DEFAULT 'IDLE', -- IDLE, RUNNING, PAUSED, AWAITING_INTERLOCK, COMPLETED, ABORTED
    active_step_index INTEGER NOT NULL DEFAULT 0,
    pending_interlock_type TEXT,
    pending_interlock_message TEXT,
    session_id TEXT,
    keep_on_camera_sd INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sequence_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id TEXT NOT NULL REFERENCES sequence_plans(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    frame_type TEXT NOT NULL, -- Light, Dark, Bias, Flat
    exposure_s REAL NOT NULL,
    iso TEXT NOT NULL,
    total_count INTEGER NOT NULL,
    completed_count INTEGER NOT NULL DEFAULT 0,
    cooldown_s REAL NOT NULL DEFAULT 2.0
);

CREATE TABLE IF NOT EXISTS capture_sessions (
    id TEXT PRIMARY KEY,
    target_name TEXT NOT NULL,
    target_slug TEXT NOT NULL,
    session_date TEXT NOT NULL,
    directory_path TEXT NOT NULL,
    offloaded INTEGER NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS captured_frames (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
    plan_id TEXT,
    filename TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    frame_type TEXT NOT NULL, -- Light, Dark, Bias, Flat
    exposure_s REAL NOT NULL,
    iso TEXT NOT NULL,
    sequence_num INTEGER NOT NULL,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    hfr_median REAL,
    fwhm_Arcsec REAL,
    star_count INTEGER DEFAULT 0,
    bg_median_adu REAL DEFAULT 0.0,
    solved_ra_hours REAL,
    solved_dec_deg REAL,
    status TEXT NOT NULL DEFAULT 'accepted', -- accepted, rejected
    reject_reason TEXT DEFAULT '',
    thumbnail_path TEXT,
    captured_at REAL NOT NULL
);
"""


class Database:
    """Thread-safe SQLite WAL database access for AstroPi."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = Path(db_path or CONFIG.db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=15.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_db(self) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.executescript(SCHEMA_SQL)
                conn.commit()
                self._seed_defaults(conn)
            finally:
                conn.close()

    def _seed_defaults(self, conn: sqlite3.Connection) -> None:
        cur = conn.execute("SELECT COUNT(*) AS cnt FROM site_presets")
        if cur.fetchone()["cnt"] == 0:
            conn.executemany(
                """
                INSERT INTO site_presets (name, latitude_deg, longitude_deg, elevation_m, bortle_class, is_default)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    ("Dark Sky Field Site (Default)", 38.8951, -77.0364, 320.0, 3, 1),
                    ("Backyard Observatory", 40.7128, -74.0060, 45.0, 6, 0),
                    ("High Desert Star Party", 34.1184, -116.4197, 1280.0, 2, 0),
                ],
            )
            conn.commit()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            conn = self._connect()
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()

    def get_setting(self, key: str, default: Any = None) -> Any:
        with self.connection() as conn:
            row = conn.execute("SELECT value_json FROM settings WHERE key = ?", (key,)).fetchone()
            if not row:
                return default
            try:
                return json.loads(row["value_json"])
            except Exception:
                return default

    def set_setting(self, key: str, value: Any) -> None:
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
                """,
                (key, json.dumps(value), time.time()),
            )

    def list_site_presets(self) -> List[Dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM site_presets ORDER BY is_default DESC, name ASC").fetchall()
            return [dict(r) for r in rows]

    def save_site_preset(
        self,
        name: str,
        latitude_deg: float,
        longitude_deg: float,
        elevation_m: float = 250.0,
        bortle_class: int = 4,
        make_default: bool = True,
    ) -> Dict[str, Any]:
        with self.connection() as conn:
            if make_default:
                conn.execute("UPDATE site_presets SET is_default = 0")
            conn.execute(
                """
                INSERT INTO site_presets (name, latitude_deg, longitude_deg, elevation_m, bortle_class, is_default)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    latitude_deg = excluded.latitude_deg,
                    longitude_deg = excluded.longitude_deg,
                    elevation_m = excluded.elevation_m,
                    bortle_class = excluded.bortle_class,
                    is_default = excluded.is_default
                """,
                (name, latitude_deg, longitude_deg, elevation_m, bortle_class, 1 if make_default else 0),
            )
            row = conn.execute("SELECT * FROM site_presets WHERE name = ?", (name,)).fetchone()
            return dict(row)


DB = Database()

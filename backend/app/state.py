"""Central real-time state manager and multi-client WebSocket broadcaster."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set

import psutil

from .config import CONFIG
from .db import DB


@dataclass
class ObserverState:
    latitude_deg: float = 38.8951
    longitude_deg: float = -77.0364
    elevation_m: float = 320.0
    pressure_hpa: float = 1010.0
    temperature_c: float = 10.0
    refraction_enabled: bool = True
    clock_offset_s: float = 0.0  # Client UTC - Pi UTC delta when Pi lacks NTP
    sync_source: str = "Preset"  # "Browser GPS", "Preset", "Manual"
    last_synced_at: Optional[float] = None

    def current_utc_timestamp(self) -> float:
        return time.time() + self.clock_offset_s


@dataclass
class CameraTelemetry:
    connected: bool = False
    driver_mode: str = "simulator"  # "gphoto2" or "simulator"
    model: str = "Canon EOS M200"
    battery_pct: int = 100
    image_format: str = "RAW (.CR3)"  # "RAW (.CR3)" or "Small Fine JPEG"
    is_fast_jpg_mode: bool = False
    iso: str = "800"
    shutter_speed: str = "2"
    capture_target: str = "Internal RAM"
    busy: bool = False
    exposing: bool = False
    exposure_total_s: float = 0.0
    exposure_elapsed_s: float = 0.0
    exposure_remaining_s: float = 0.0
    exposure_progress_pct: float = 0.0
    last_error: Optional[str] = None
    usb_reset_count: int = 0


@dataclass
class SystemTelemetry:
    cpu_temp_c: float = 42.0
    cpu_percent: float = 8.0
    ram_used_mb: float = 95.0
    ram_percent: float = 12.0
    disk_free_gb: float = 32.0
    disk_total_gb: float = 64.0
    active_storage_path: str = ""
    usb_drive_mounted: bool = False
    usb_drive_label: str = ""
    usb_drive_path: str = ""
    smb_share_url: str = r"\\astro.local\captures"
    smb_mac_url: str = "smb://astro.local/captures"


class StateManager:
    """Single source of truth for multi-client browser state synchronization."""

    VALID_MODES = ("IDLE", "PA", "FRAME", "FOCUS", "SEQUENCE")

    def __init__(self) -> None:
        self.active_mode: str = "IDLE"
        self.night_vision_default: bool = False
        self.observer = ObserverState()
        self.camera = CameraTelemetry()
        self.system = SystemTelemetry(active_storage_path=str(CONFIG.captures_dir))
        self.pa_state: Dict[str, Any] = {
            "phase": "IDLE",  # IDLE, CALIBRATING, LIVE_ADJUST
            "mode_points": 3,
            "auto_advance": False,
            "refraction_pole": True,
            "points": [],
            "bump_residual_arcmin": 0.0,
            "bump_warning": False,
            "alt_error_arcmin": 0.0,
            "az_error_arcmin": 0.0,
            "total_error_arcmin": 0.0,
            "alt_direction": "HOLD",
            "az_direction": "HOLD",
            "sa2i_knob_turns": 0.0,
            "breadcrumb_trail": [],
            "loop_running": False,
            "last_solve_ms": 0,
        }
        self.framing_state: Dict[str, Any] = {
            "target_id": "NGC7000",
            "target_name": "North America Nebula (NGC 7000)",
            "target_ra_hours": 20.988,
            "target_dec_deg": 44.33,
            "solved": False,
            "current_ra_hours": None,
            "current_dec_deg": None,
            "rotation_pa_deg": None,
            "fov_x_deg": round(CONFIG.optics.fov_width_deg, 2),
            "fov_y_deg": round(CONFIG.optics.fov_height_deg, 2),
            "delta_ra_deg": 0.0,
            "delta_dec_deg": 0.0,
            "delta_alt_deg": 0.0,
            "delta_az_deg": 0.0,
            "camera_dx_deg": 0.0,
            "camera_dy_deg": 0.0,
            "angular_separation_deg": 0.0,
            "instructions_equatorial": [],
            "instructions_ballhead": [],
        }
        self.focus_state: Dict[str, Any] = {
            "loop_running": False,
            "hfr_median": 0.0,
            "fwhm_arcsec": 0.0,
            "star_count": 0,
            "min_hfr_achieved": None,
            "roi": None,  # {"x": float, "y": float, "size": int}
            "history": [],  # [{"timestamp": float, "hfr": float, "fwhm": float, "stars": int}]
            "audio_cues_enabled": True,
        }
        self.latest_preview: Dict[str, Any] = {
            "image_url": None,
            "timestamp": None,
            "width": 1500,
            "height": 1000,
            "source_format": "JPEG",
            "auto_stretched": True,
            "histogram": {"r": [], "g": [], "b": [], "luma": []},
            "stars_overlay": [],
            "meta": {},
        }
        self.sequence_state: Dict[str, Any] = {
            "active_plan_id": None,
            "status": "IDLE",
            "target_name": "",
            "active_step_index": 0,
            "current_frame_type": "Light",
            "current_frame_num": 0,
            "total_step_frames": 0,
            "overall_completed": 0,
            "overall_total": 0,
            "interlock_required": False,
            "interlock_type": None,
            "interlock_message": None,
            "last_saved_file": None,
            "last_frame_hfr": None,
        }
        self._ws_senders: Set[Callable[[str], Any]] = set()
        self._load_persisted_observer()

    def _load_persisted_observer(self) -> None:
        saved = DB.get_setting("observer_state")
        if isinstance(saved, dict):
            for k, v in saved.items():
                if hasattr(self.observer, k):
                    setattr(self.observer, k, v)
        saved_storage = DB.get_setting("active_storage_path")
        if saved_storage and os.path.isdir(str(saved_storage)):
            self.system.active_storage_path = str(saved_storage)

    def save_observer(self) -> None:
        DB.set_setting("observer_state", asdict(self.observer))

    def register_ws_sender(self, sender: Callable[[str], Any]) -> None:
        self._ws_senders.add(sender)

    def unregister_ws_sender(self, sender: Callable[[str], Any]) -> None:
        self._ws_senders.discard(sender)

    def refresh_system_telemetry(self) -> SystemTelemetry:
        try:
            proc = psutil.Process(os.getpid())
            self.system.ram_used_mb = round(proc.memory_info().rss / (1024 * 1024), 1)
            self.system.ram_percent = round(psutil.virtual_memory().percent, 1)
            self.system.cpu_percent = round(psutil.cpu_percent(interval=None), 1)
        except Exception:
            pass

        # Read Pi thermal zone if available
        thermal_file = "/sys/class/thermal/thermal_zone0/temp"
        if os.path.exists(thermal_file):
            try:
                with open(thermal_file, "r", encoding="utf-8") as f:
                    self.system.cpu_temp_c = round(int(f.read().strip()) / 1000.0, 1)
            except Exception:
                pass

        storage_dir = self.system.active_storage_path or str(CONFIG.captures_dir)
        os.makedirs(storage_dir, exist_ok=True)
        try:
            usage = shutil.disk_usage(storage_dir)
            self.system.disk_free_gb = round(usage.free / (1024**3), 2)
            self.system.disk_total_gb = round(usage.total / (1024**3), 2)
        except Exception:
            pass

        return self.system

    def snapshot(self) -> Dict[str, Any]:
        self.refresh_system_telemetry()
        return {
            "active_mode": self.active_mode,
            "server_utc": self.observer.current_utc_timestamp(),
            "observer": asdict(self.observer),
            "camera": asdict(self.camera),
            "system": asdict(self.system),
            "optics": {
                "camera_name": CONFIG.optics.camera_name,
                "lens_name": CONFIG.optics.lens_name,
                "focal_length_mm": CONFIG.optics.focal_length_mm,
                "aperture_f_num": CONFIG.optics.aperture_f_num,
                "fov_width_deg": round(CONFIG.optics.fov_width_deg, 2),
                "fov_height_deg": round(CONFIG.optics.fov_height_deg, 2),
                "pixel_scale_arcsec": round(CONFIG.optics.pixel_scale_arcsec, 2),
            },
            "pa": self.pa_state,
            "framing": self.framing_state,
            "focus": self.focus_state,
            "preview": self.latest_preview,
            "sequence": self.sequence_state,
        }

    async def broadcast(self, event_type: str, payload: Optional[Dict[str, Any]] = None) -> None:
        if not self._ws_senders:
            return
        message = json.dumps(
            {
                "type": event_type,
                "timestamp": time.time(),
                "payload": payload if payload is not None else self.snapshot(),
            }
        )
        dead: List[Callable[[str], Any]] = []
        for sender in list(self._ws_senders):
            try:
                res = sender(message)
                if asyncio.iscoroutine(res):
                    await res
            except Exception:
                dead.append(sender)
        for d in dead:
            self._ws_senders.discard(d)

    def broadcast_sync(self, event_type: str, payload: Optional[Dict[str, Any]] = None) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broadcast(event_type, payload))
        except RuntimeError:
            pass


STATE = StateManager()

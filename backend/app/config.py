"""Centralized configuration and optical/hardware profile for AstroPi."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class OpticalProfile:
    """Default optical profile for Canon EOS M200 + TPO UltraWide 180 (f/4.5)."""

    camera_name: str = "Canon EOS M200"
    lens_name: str = "TPO UltraWide 180 f/4.5"
    focal_length_mm: float = 180.0
    aperture_f_num: float = 4.5
    sensor_width_mm: float = 22.3
    sensor_height_mm: float = 14.9
    sensor_width_px: int = 6000
    sensor_height_px: int = 4000
    pixel_pitch_um: float = 3.72
    sa2i_wedge_deg_per_turn: float = 1.20  # Star Adventurer 2i Altitude screw pitch (~1.2 deg/turn)

    @property
    def fov_width_deg(self) -> float:
        import math
        return math.degrees(2.0 * math.atan(self.sensor_width_mm / (2.0 * self.focal_length_mm)))

    @property
    def fov_height_deg(self) -> float:
        import math
        return math.degrees(2.0 * math.atan(self.sensor_height_mm / (2.0 * self.focal_length_mm)))

    @property
    def pixel_scale_arcsec(self) -> float:
        return 206.264806 * self.pixel_pitch_um / self.focal_length_mm


@dataclass
class AppConfig:
    """Runtime paths and hardware settings for Raspberry Pi 4 deployment."""

    project_root: Path = field(
        default_factory=lambda: Path(
            os.environ.get(
                "ASTROPI_ROOT",
                str(Path(__file__).resolve().parents[2]),
            )
        )
    )
    shm_dir: Path = field(
        default_factory=lambda: Path(
            os.environ.get(
                "ASTROPI_SHM_DIR",
                "/dev/shm/astropi" if os.path.isdir("/dev/shm") else "/tmp/astropi_shm",
            )
        )
    )
    data_dir: Path = field(
        default_factory=lambda: Path(
            os.environ.get(
                "ASTROPI_DATA_DIR",
                str(Path(__file__).resolve().parents[2] / "data"),
            )
        )
    )
    astap_bin: str = field(
        default_factory=lambda: os.environ.get("ASTROPI_ASTAP_BIN", "astap_cli")
    )
    astap_db_dir: str = field(
        default_factory=lambda: os.environ.get("ASTROPI_ASTAP_DB", "/opt/astap")
    )
    astap_downsample: int = 2
    astap_blind_radius_deg: float = 180.0
    astap_seeded_radius_deg: float = 15.0
    force_simulator: bool = field(
        default_factory=lambda: os.environ.get("ASTROPI_SIMULATOR", "0") == "1"
    )
    optics: OpticalProfile = field(default_factory=OpticalProfile)

    def ensure_directories(self) -> None:
        self.shm_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.captures_dir.mkdir(parents=True, exist_ok=True)
        self.certs_dir.mkdir(parents=True, exist_ok=True)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "astropi_state.db"

    @property
    def captures_dir(self) -> Path:
        custom = os.environ.get("ASTROPI_CAPTURES_DIR")
        if custom:
            return Path(custom)
        return self.data_dir / "captures"

    @property
    def certs_dir(self) -> Path:
        return self.data_dir / "certs"

    @property
    def frontend_dist_dir(self) -> Path:
        return self.project_root / "frontend" / "dist"


CONFIG = AppConfig()
CONFIG.ensure_directories()

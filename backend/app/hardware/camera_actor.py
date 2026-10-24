"""Single-Owner Persistent libgphoto2 Camera Actor + Hybrid Bulb Timer & RAW Guards.

Owns the exclusive USB PTP lock for the Canon EOS M200 across all application modes,
guarantees automatic restoration of imageformat=RAW (.CR3) after fast JPEG loops,
and performs hardware USBDEVFS_RESET recovery on transient USB timeouts.
"""

from __future__ import annotations

import asyncio
import fcntl
import glob
import math
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence

from ..astrometry.coordinates import ObserverLocation
from ..config import CONFIG
from ..state import STATE
from .simulated_camera import SIM_RIG

try:
    import gphoto2 as gp  # type: ignore
    HAS_GPHOTO2 = True
except Exception:
    gp = None
    HAS_GPHOTO2 = False


USBDEVFS_RESET = 21780  # 0x5514 (_IO('U', 20))
CANON_VENDOR_ID = "04a9"


def parse_canon_shutter_choice(choice: str) -> Optional[float]:
    """Parse a Canon libgphoto2 shutter speed choice string into exact seconds.

    Handles formats such as:
      - Fractions: '1/4000', '1/1000', '1/4'
      - Quote notation: '0\"5' (0.5s), '3\"2' (3.2s), '15\"' (15s)
      - Standard numbers: '0.5', '1.6', '2', '30', '2.0s'
    """
    s = choice.strip().lower()
    if not s or "bulb" in s or "auto" in s or "sync" in s:
        return None
    if s.endswith("s"):
        s = s[:-1].strip()

    if "/" in s:
        parts = s.split("/", 1)
        try:
            num = float(parts[0].strip())
            den = float(parts[1].strip())
            if num > 0 and den > 0:
                return num / den
        except ValueError:
            return None
        return None

    if '"' in s:
        # e.g. '0"5' -> '0.5', '15"' -> '15'
        q_parts = s.split('"', 1)
        s = f"{q_parts[0]}.{q_parts[1]}" if q_parts[1].strip() else q_parts[0]

    try:
        val = float(s)
        return val if val > 0 else None
    except ValueError:
        return None


def select_best_canon_shutter_choice(choices: Sequence[str], exposure_s: float) -> Optional[str]:
    """Select the closest physical Canon shutter speed choice using logarithmic stop distance."""
    target = max(0.000125, float(exposure_s))
    best_choice: Optional[str] = None
    best_log_dist = float("inf")

    for ch in choices:
        sec = parse_canon_shutter_choice(ch)
        if sec is None or sec <= 0:
            continue
        dist = abs(math.log(sec / target))
        if dist < best_log_dist:
            best_log_dist = dist
            best_choice = ch

    return best_choice


class CameraController:
    """Single-daemon camera controller serialized through a 1-worker thread executor."""

    RAW_FORMAT_CANDIDATES = ("RAW", "CR3", "cRAW", "RAW + Large Fine JPEG")
    FAST_JPEG_CANDIDATES = (
        "Small Fine JPEG",
        "S1 Fine",
        "Small Normal JPEG",
        "S2",
        "Medium Fine JPEG",
        "M Fine",
        "Large Fine JPEG",
    )

    def __init__(self) -> None:
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="CanonM200Actor")
        self._capture_lock = asyncio.Lock()
        self._abort_event = asyncio.Event()
        self._gp_camera: Any = None
        self._gp_context: Any = None
        self._raw_format_label: str = "RAW"
        self._fast_jpeg_label: str = "Small Fine JPEG"
        self._pre_capture_hooks: List[Callable[[], Awaitable[None]]] = []

    def register_pre_capture_hook(self, hook: Callable[[], Awaitable[None]]) -> None:
        """Register an async hook invoked before any still/Bulb capture (e.g., stopping Live View)."""
        if hook not in self._pre_capture_hooks:
            self._pre_capture_hooks.append(hook)

    async def _run_pre_capture_hooks(self) -> None:
        for hook in list(self._pre_capture_hooks):
            try:
                await hook()
            except Exception:
                pass

    # --- SWIG python-gphoto2 version-agnostic helpers ---
    def _gp_get_config(self) -> Any:
        try:
            return self._gp_camera.get_config()
        except TypeError:
            return self._gp_camera.get_config(self._gp_context)

    def _gp_set_config(self, cfg: Any) -> None:
        try:
            self._gp_camera.set_config(cfg)
        except TypeError:
            self._gp_camera.set_config(cfg, self._gp_context)

    def _gp_wait_for_event(self, timeout_ms: int) -> tuple[Any, Any]:
        try:
            return self._gp_camera.wait_for_event(timeout_ms)
        except TypeError:
            return self._gp_camera.wait_for_event(timeout_ms, self._gp_context)

    def _gp_exit(self) -> None:
        if self._gp_camera is None:
            return
        try:
            self._gp_camera.exit()
        except TypeError:
            self._gp_camera.exit(self._gp_context)

    async def initialize(self) -> Dict[str, Any]:
        """Connect to the physical Canon EOS M200 via libgphoto2 or activate simulator fallback."""
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(self._executor, self._init_sync)
        await STATE.broadcast("CAMERA_STATUS", res)
        return res

    def _init_sync(self) -> Dict[str, Any]:
        if HAS_GPHOTO2 and gp is not None and not CONFIG.force_simulator:
            if self._try_reconnect_physical_camera_sync():
                return self.status_dict()

        STATE.camera.connected = False
        STATE.camera.driver_mode = "simulator"
        STATE.camera.model = "Simulator Rig (No Physical Camera Detected)"
        STATE.camera.image_format = "RAW (.CR3)"
        STATE.camera.is_fast_jpg_mode = False
        return self.status_dict()

    def _try_reconnect_physical_camera_sync(self) -> bool:
        if not HAS_GPHOTO2 or gp is None or CONFIG.force_simulator:
            return False
        try:
            subprocess.run(["pkill", "-9", "-f", "gvfs-gphoto2"], capture_output=True, timeout=1.0)
        except Exception:
            pass

        if self._gp_camera is not None:
            try:
                self._gp_exit()
            except Exception:
                pass
            self._gp_camera = None

        try:
            ctx = gp.Context()
            cam = gp.Camera()
            try:
                cam.init()
            except TypeError:
                cam.init(ctx)
            self._gp_context = ctx
            self._gp_camera = cam
            self._set_widget_sync("autopoweroff", ("0", "Off", "Disable"))
            # Critical for cardless Canon EOS M200 operation: default to Internal RAM
            self._set_widget_sync("capturetarget", ("Internal RAM", "RAM"))
            self._discover_format_labels_sync()
            self._set_image_format_sync(fast_jpeg=False)

            STATE.camera.connected = True
            STATE.camera.driver_mode = "gphoto2"
            STATE.camera.model = "Canon EOS M200 (USB PTP)"
            STATE.camera.last_error = None
            return True
        except Exception as exc:
            self._gp_camera = None
            STATE.camera.connected = False
            STATE.camera.driver_mode = "simulator"
            STATE.camera.model = "Simulator Rig (No Physical Camera Detected)"
            STATE.camera.last_error = f"USB PTP: {exc}. Ensure camera is ON in Manual (M) mode."
            return False

    def _discover_format_labels_sync(self) -> None:
        if self._gp_camera is None or gp is None:
            return
        try:
            cfg = self._gp_get_config()
            ok, widget = gp.gp_widget_get_child_by_name(cfg, "imageformat")
            if ok >= gp.GP_OK:
                choices = [widget.get_choice(i) for i in range(widget.count_choices())]
                found_raw = False
                for cand in self.RAW_FORMAT_CANDIDATES:
                    for ch in choices:
                        if cand.lower() == ch.lower():
                            self._raw_format_label = ch
                            found_raw = True
                            break
                    if found_raw:
                        break
                if not found_raw:
                    for ch in choices:
                        if "raw" in ch.lower() and "jpeg" not in ch.lower():
                            self._raw_format_label = ch
                            break

                found_jpg = False
                for cand in self.FAST_JPEG_CANDIDATES:
                    for ch in choices:
                        if cand.lower() == ch.lower() or cand.lower() in ch.lower():
                            self._fast_jpeg_label = ch
                            found_jpg = True
                            break
                    if found_jpg:
                        break
        except Exception:
            pass

    def _set_widget_sync(self, widget_name: str, candidates: tuple[str, ...]) -> bool:
        if self._gp_camera is None or gp is None:
            return False
        try:
            cfg = self._gp_get_config()
            ok, widget = gp.gp_widget_get_child_by_name(cfg, widget_name)
            if ok < gp.GP_OK:
                return False

            choices: List[str] = []
            try:
                choices = [widget.get_choice(i) for i in range(widget.count_choices())]
            except Exception:
                pass

            if choices:
                # 1. Exact case-insensitive match
                for cand in candidates:
                    cand_low = cand.strip().lower()
                    for ch in choices:
                        if cand == ch or cand_low == ch.strip().lower():
                            widget.set_value(ch)
                            self._gp_set_config(cfg)
                            return True
                # 2. Safe substring match ONLY for descriptive labels (>= 3 chars, non-numeric)
                for cand in candidates:
                    cand_clean = cand.strip().lower()
                    if len(cand_clean) < 3 or any(c.isdigit() for c in cand_clean) and "/" in cand_clean:
                        continue
                    if cand_clean.replace(".", "").isdigit():
                        continue
                    for ch in choices:
                        if cand_clean in ch.lower():
                            widget.set_value(ch)
                            self._gp_set_config(cfg)
                            return True
            else:
                for val in candidates:
                    try:
                        widget.set_value(val)
                        self._gp_set_config(cfg)
                        return True
                    except Exception:
                        continue
        except Exception:
            pass
        return False

    def _exit_live_view_sync(self) -> None:
        """Cleanly exit Canon EVF Live View mode so physical/Bulb shutter commands never return Busy."""
        if self._gp_camera is None or gp is None:
            return
        self._set_widget_sync("viewfinder", ("0", "Off", "False"))
        self._drain_events_sync(max_wait_ms=250)

    async def exit_live_view(self) -> None:
        if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(self._executor, self._exit_live_view_sync)

    def _set_iso_sync(self, iso: str) -> bool:
        STATE.camera.iso = str(iso)
        if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None:
            return self._set_widget_sync("iso", (str(iso),))
        return True

    async def set_iso(self, iso: str) -> bool:
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(self._executor, self._set_iso_sync, iso)
        await STATE.broadcast("CAMERA_STATUS", self.status_dict())
        return res

    def _set_shutter_speed_sync(self, exposure_s: float) -> bool:
        if exposure_s > 30.0:
            STATE.camera.shutter_speed = f"BULB ({exposure_s:g}s)"
            if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None:
                return self._set_widget_sync("shutterspeed", ("bulb", "Bulb", "BULB"))
            return True

        STATE.camera.shutter_speed = f"{exposure_s:g}s"
        if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None and gp is not None:
            try:
                cfg = self._gp_get_config()
                ok, widget = gp.gp_widget_get_child_by_name(cfg, "shutterspeed")
                if ok >= gp.GP_OK:
                    choices = [widget.get_choice(i) for i in range(widget.count_choices())]
                    best_ch = select_best_canon_shutter_choice(choices, exposure_s)
                    if best_ch is not None:
                        widget.set_value(best_ch)
                        self._gp_set_config(cfg)
                        STATE.camera.shutter_speed = best_ch
                        return True
            except Exception:
                pass
            return self._set_widget_sync(
                "shutterspeed",
                (f"{exposure_s:g}", str(exposure_s), str(int(round(exposure_s)))),
            )
        return True

    async def set_shutter_speed(self, exposure_s: float) -> bool:
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(self._executor, self._set_shutter_speed_sync, exposure_s)
        await STATE.broadcast("CAMERA_STATUS", self.status_dict())
        return res

    def _set_image_format_sync(self, fast_jpeg: bool) -> str:
        """Switch camera between Small Fine JPEG (fast-solve loop) and RAW (.CR3)."""
        if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None:
            if fast_jpeg:
                self._set_widget_sync("imageformat", (self._fast_jpeg_label,) + self.FAST_JPEG_CANDIDATES)
            else:
                self._set_widget_sync("imageformat", (self._raw_format_label,) + self.RAW_FORMAT_CANDIDATES)
            # Always default capturetarget to Internal RAM so cardless EOS M200 never blocks
            self._set_widget_sync("capturetarget", ("Internal RAM", "RAM"))

        if fast_jpeg:
            STATE.camera.image_format = "Small Fine JPEG"
            STATE.camera.is_fast_jpg_mode = True
        else:
            STATE.camera.image_format = "RAW (.CR3)"
            STATE.camera.is_fast_jpg_mode = False
        return STATE.camera.image_format

    async def set_fast_jpeg_mode(self) -> str:
        loop = asyncio.get_running_loop()
        fmt = await loop.run_in_executor(self._executor, self._set_image_format_sync, True)
        await STATE.broadcast("CAMERA_STATUS", self.status_dict())
        return fmt

    async def ensure_raw_format(self) -> str:
        """Guaranteed state-machine guard that restores the camera to RAW (.CR3)."""
        loop = asyncio.get_running_loop()
        fmt = await loop.run_in_executor(self._executor, self._set_image_format_sync, False)
        await STATE.broadcast("CAMERA_STATUS", self.status_dict())
        return fmt

    def ensure_raw_format_sync(self) -> str:
        return self._set_image_format_sync(False)

    def reset_usb_bus_sync(self) -> bool:
        """Locate the Canon USB device node and issue Linux USBDEVFS_RESET ioctl."""
        STATE.camera.usb_reset_count += 1
        try:
            if self._gp_camera is not None and gp is not None:
                try:
                    self._gp_exit()
                except Exception:
                    pass
                self._gp_camera = None
            # Search /sys/bus/usb/devices for Canon vendor ID 04a9
            for vendor_path in glob.glob("/sys/bus/usb/devices/*/idVendor"):
                try:
                    vid = Path(vendor_path).read_text(encoding="utf-8").strip().lower()
                    if vid == CANON_VENDOR_ID:
                        dev_dir = Path(vendor_path).parent
                        busnum = int((dev_dir / "busnum").read_text(encoding="utf-8").strip())
                        devnum = int((dev_dir / "devnum").read_text(encoding="utf-8").strip())
                        dev_node = f"/dev/bus/usb/{busnum:03d}/{devnum:03d}"
                        if os.path.exists(dev_node):
                            fd = os.open(dev_node, os.O_WRONLY)
                            try:
                                fcntl.ioctl(fd, USBDEVFS_RESET, 0)
                            finally:
                                os.close(fd)
                            time.sleep(1.5)
                except Exception:
                    continue
            self._init_sync()
            return True
        except Exception as exc:
            STATE.camera.last_error = f"USB reset failed: {exc}"
            return False

    async def abort_active_exposure(self) -> None:
        self._abort_event.set()
        if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                self._executor,
                self._release_bulb_sync,
            )
        await self.ensure_raw_format()

    def _release_bulb_sync(self) -> None:
        self._set_widget_sync("eosremoterelease", ("Release Full", "Release 2", "Release 3"))
        self._set_widget_sync("eosremoterelease", ("None",))

    async def capture_frame(
        self,
        output_path: Path,
        exposure_s: float = 2.0,
        iso: str = "800",
        fast_jpeg: bool = False,
        frame_type: str = "Light",
        mode: str = "IDLE",
        keep_on_camera_sd: bool = False,
        max_retries: int = 1,
    ) -> Path:
        """Execute a thread-safe camera exposure (<=30s native or >30s Bulb) with USB auto-retry."""
        # Automatically pause/stop any active EVF Live Viewfinder loop before locking camera
        await self._run_pre_capture_hooks()

        async with self._capture_lock:
            self._abort_event.clear()
            loop = asyncio.get_running_loop()

            # Auto-detect real physical camera if plugged in or turned on after startup
            if STATE.camera.driver_mode == "simulator" and HAS_GPHOTO2 and not CONFIG.force_simulator:
                connected = await loop.run_in_executor(self._executor, self._try_reconnect_physical_camera_sync)
                if connected:
                    await STATE.broadcast("CAMERA_STATUS", self.status_dict())

            if fast_jpeg:
                await self.set_fast_jpeg_mode()
            else:
                await self.ensure_raw_format()

            STATE.camera.iso = str(iso)
            STATE.camera.shutter_speed = f"{exposure_s:g}s" if exposure_s <= 30.0 else f"BULB ({exposure_s:g}s)"
            STATE.camera.busy = True
            STATE.camera.exposing = True
            STATE.camera.exposure_total_s = float(exposure_s)
            STATE.camera.exposure_elapsed_s = 0.0
            STATE.camera.exposure_remaining_s = float(exposure_s)
            STATE.camera.exposure_progress_pct = 0.0
            await STATE.broadcast("EXPOSURE_TICK", self.status_dict())

            last_exc: Optional[Exception] = None
            try:
                for attempt in range(1, max_retries + 1):
                    try:
                        await self._execute_single_exposure(
                            output_path=output_path,
                            exposure_s=exposure_s,
                            iso=iso,
                            fast_jpeg=fast_jpeg,
                            frame_type=frame_type,
                            mode=mode,
                            keep_on_camera_sd=keep_on_camera_sd,
                        )
                        STATE.camera.last_error = None
                        return output_path
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:
                        last_exc = exc
                        STATE.camera.last_error = f"Capture attempt {attempt}/{max_retries} error: {exc}"
                        await STATE.broadcast("CAMERA_STATUS", self.status_dict())
                        if attempt < max_retries:
                            await loop.run_in_executor(self._executor, self.reset_usb_bus_sync)
                            if fast_jpeg:
                                await self.set_fast_jpeg_mode()
                            else:
                                await self.ensure_raw_format()
                raise RuntimeError(f"Capture failed: {last_exc}")
            finally:
                STATE.camera.busy = False
                STATE.camera.exposing = False
                STATE.camera.exposure_elapsed_s = 0.0
                STATE.camera.exposure_remaining_s = 0.0
                STATE.camera.exposure_progress_pct = 100.0
                await STATE.broadcast("EXPOSURE_TICK", self.status_dict())

    async def _execute_single_exposure(
        self,
        output_path: Path,
        exposure_s: float,
        iso: str,
        fast_jpeg: bool,
        frame_type: str,
        mode: str,
        keep_on_camera_sd: bool,
    ) -> None:
        loop = asyncio.get_running_loop()

        if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None and gp is not None:
            # Ensure camera EVF viewfinder is closed before still or Bulb shutter actuation
            await loop.run_in_executor(self._executor, self._exit_live_view_sync)

            # Configure ISO and capturetarget (Internal RAM for cardless operation)
            await loop.run_in_executor(self._executor, self._set_widget_sync, "iso", (str(iso),))
            target_choices = ("Memory card", "SD Card") if keep_on_camera_sd else ("Internal RAM", "RAM")
            await loop.run_in_executor(self._executor, self._set_widget_sync, "capturetarget", target_choices)

            if exposure_s <= 30.0:
                await loop.run_in_executor(self._executor, self._set_shutter_speed_sync, exposure_s)
                capture_future = loop.run_in_executor(
                    self._executor,
                    self._gphoto_standard_capture_sync,
                    output_path,
                    exposure_s,
                )
                t0 = time.monotonic()
                while not capture_future.done():
                    if self._abort_event.is_set():
                        raise RuntimeError("Exposure aborted by user")
                    elapsed = min(exposure_s, time.monotonic() - t0)
                    STATE.camera.exposure_elapsed_s = round(elapsed, 1)
                    STATE.camera.exposure_remaining_s = round(max(0.0, exposure_s - elapsed), 1)
                    STATE.camera.exposure_progress_pct = round(100.0 * elapsed / max(0.01, exposure_s), 1)
                    await STATE.broadcast("EXPOSURE_TICK", self.status_dict())
                    await asyncio.sleep(0.20)
                await capture_future
                return

            # Held Bulb Exposure (> 30s) via eosremoterelease ('Press Full' / 'Press 2' — NEVER 'Immediate'!)
            bulb_ok = await loop.run_in_executor(self._executor, self._set_shutter_speed_sync, exposure_s)
            if not bulb_ok:
                raise RuntimeError(
                    "Camera rejected Bulb mode (>30s). Ensure Canon EOS M200 dial is set to Manual (M) "
                    "and Drive Mode is Single Shot."
                )

            press_ok = await loop.run_in_executor(
                self._executor,
                self._set_widget_sync,
                "eosremoterelease",
                ("Press Full", "Press 2"),
            )
            if not press_ok:
                raise RuntimeError(
                    "Failed to open Bulb shutter via eosremoterelease. Verify camera is in Manual (M) mode."
                )

            t0 = time.monotonic()
            try:
                while True:
                    if self._abort_event.is_set():
                        raise RuntimeError("Bulb exposure aborted by user")
                    elapsed = time.monotonic() - t0
                    if elapsed >= exposure_s:
                        break
                    STATE.camera.exposure_elapsed_s = round(elapsed, 1)
                    STATE.camera.exposure_remaining_s = round(max(0.0, exposure_s - elapsed), 1)
                    STATE.camera.exposure_progress_pct = round(100.0 * elapsed / exposure_s, 1)
                    await STATE.broadcast("EXPOSURE_TICK", self.status_dict())
                    await asyncio.sleep(min(0.25, max(0.02, exposure_s - elapsed)))
            finally:
                await loop.run_in_executor(self._executor, self._release_bulb_sync)

            await loop.run_in_executor(
                self._executor,
                self._gphoto_wait_file_added_sync,
                output_path,
                45.0,
            )
            return

        # Simulator path (caps simulated real-time wait at 0.30s for fast responsiveness)
        sim_wait = min(float(exposure_s), 0.30)
        t0 = time.monotonic()
        while True:
            if self._abort_event.is_set():
                raise RuntimeError("Exposure aborted by user")
            elapsed = time.monotonic() - t0
            if elapsed >= sim_wait:
                break
            ratio = elapsed / max(0.001, sim_wait)
            STATE.camera.exposure_elapsed_s = round(ratio * exposure_s, 1)
            STATE.camera.exposure_remaining_s = round((1.0 - ratio) * exposure_s, 1)
            STATE.camera.exposure_progress_pct = round(ratio * 100.0, 1)
            await STATE.broadcast("EXPOSURE_TICK", self.status_dict())
            await asyncio.sleep(0.08)

        obs = ObserverLocation(
            latitude_deg=STATE.observer.latitude_deg,
            longitude_deg=STATE.observer.longitude_deg,
            elevation_m=STATE.observer.elevation_m,
            pressure_hpa=STATE.observer.pressure_hpa,
            temperature_c=STATE.observer.temperature_c,
            refraction_enabled=STATE.observer.refraction_enabled,
        )
        await loop.run_in_executor(
            self._executor,
            SIM_RIG.render_synthetic_frame,
            output_path,
            not fast_jpeg,
            frame_type,
            exposure_s,
            iso,
            mode,
            obs,
            STATE.observer.current_utc_timestamp(),
        )

    def capture_preview_bytes_sync(self) -> Optional[bytes]:
        """Capture an instant EVF frame in memory without actuating the physical shutter."""
        if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None and gp is not None:
            try:
                camera_file = self._gp_camera.capture_preview()
            except TypeError:
                camera_file = self._gp_camera.capture_preview(self._gp_context)
            file_data = camera_file.get_data_and_size()
            return bytes(file_data)

        # Simulator fallback
        tmp_path = CONFIG.shm_dir / "live_view.jpg"
        obs = ObserverLocation(
            latitude_deg=STATE.observer.latitude_deg,
            longitude_deg=STATE.observer.longitude_deg,
            elevation_m=STATE.observer.elevation_m,
            pressure_hpa=STATE.observer.pressure_hpa,
            temperature_c=STATE.observer.temperature_c,
            refraction_enabled=STATE.observer.refraction_enabled,
        )
        SIM_RIG.render_synthetic_frame(
            tmp_path,
            is_raw_cr3=False,
            frame_type="Light",
            exposure_s=0.1,
            iso="800",
            mode=STATE.active_mode,
            observer=obs,
            utc_timestamp=STATE.observer.current_utc_timestamp(),
        )
        return tmp_path.read_bytes() if tmp_path.is_file() else None

    def capture_preview_frame_sync(self, output_path: Path) -> Path:
        data = self.capture_preview_bytes_sync()
        if data:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(data)
        return output_path

    async def capture_live_view_bytes(self) -> Optional[bytes]:
        """Asynchronously grab one EVF preview frame in memory, skipping if shutter capture holds lock."""
        if self._capture_lock.locked():
            return None
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self.capture_preview_bytes_sync)

    async def capture_live_view(self, output_path: Path) -> Path:
        """Asynchronously stream a live viewfinder frame to output_path without tripping the shutter."""
        if self._capture_lock.locked():
            return output_path
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor,
            self.capture_preview_frame_sync,
            output_path,
        )

    def _drain_events_sync(self, max_wait_ms: int = 300) -> None:
        if self._gp_camera is None or gp is None:
            return
        t_end = time.monotonic() + (max_wait_ms / 1000.0)
        while time.monotonic() < t_end:
            try:
                ev_type, _ = self._gp_wait_for_event(50)
                if ev_type == gp.GP_EVENT_TIMEOUT:
                    break
            except Exception:
                break

    def _gphoto_standard_capture_sync(self, output_path: Path, exposure_s: float = 2.0) -> None:
        # Drain any lingering live view events from the camera's USB FIFO buffer
        self._drain_events_sync(max_wait_ms=250)

        direct_exc = None
        try:
            try:
                file_path = self._gp_camera.capture(gp.GP_CAPTURE_IMAGE)
            except TypeError:
                file_path = self._gp_camera.capture(gp.GP_CAPTURE_IMAGE, self._gp_context)

            camera_file = self._gp_camera.file_get(
                file_path.folder,
                file_path.name,
                gp.GP_FILE_TYPE_NORMAL,
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            camera_file.save(str(output_path))
            try:
                self._gp_camera.file_delete(file_path.folder, file_path.name)
            except Exception:
                pass
            return
        except Exception as exc:
            direct_exc = exc

        # Event-driven wait fallback for Canon cameras (handles asynchronous PTP buffer flush)
        deadline = time.monotonic() + max(25.0, float(exposure_s) + 20.0)
        while time.monotonic() < deadline:
            try:
                ev_type, ev_data = self._gp_wait_for_event(500)
            except Exception:
                break
            if ev_type == gp.GP_EVENT_FILE_ADDED:
                camera_file = self._gp_camera.file_get(
                    ev_data.folder,
                    ev_data.name,
                    gp.GP_FILE_TYPE_NORMAL,
                )
                output_path.parent.mkdir(parents=True, exist_ok=True)
                camera_file.save(str(output_path))
                try:
                    self._gp_camera.file_delete(ev_data.folder, ev_data.name)
                except Exception:
                    pass
                return
        if direct_exc is not None:
            raise direct_exc
        raise TimeoutError("Timed out waiting for image capture from Canon EOS M200")

    def _gphoto_wait_file_added_sync(self, output_path: Path, timeout_s: float = 45.0) -> None:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            ev_type, ev_data = self._gp_wait_for_event(500)
            if ev_type == gp.GP_EVENT_FILE_ADDED:
                camera_file = self._gp_camera.file_get(
                    ev_data.folder,
                    ev_data.name,
                    gp.GP_FILE_TYPE_NORMAL,
                )
                output_path.parent.mkdir(parents=True, exist_ok=True)
                camera_file.save(str(output_path))
                try:
                    self._gp_camera.file_delete(ev_data.folder, ev_data.name)
                except Exception:
                    pass
                return
        raise TimeoutError(
            "Timed out waiting for image file after Bulb release. "
            "Check that In-Camera Long Exposure Noise Reduction is set to OFF."
        )

    def status_dict(self) -> Dict[str, Any]:
        return asdict(STATE.camera)


CAMERA = CameraController()

"""Single-Owner Persistent libgphoto2 Camera Actor + Hybrid Bulb Timer & RAW Guards.

Owns the exclusive USB PTP lock for the Canon EOS M200 across all application modes,
guarantees automatic restoration of imageformat=RAW (.CR3) after fast JPEG loops,
and performs hardware USBDEVFS_RESET recovery on transient USB timeouts.
"""

from __future__ import annotations

import asyncio
import fcntl
import glob
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Dict, Optional

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


class CameraController:
    """Single-daemon camera controller serialized through a 1-worker thread executor."""

    RAW_FORMAT_CANDIDATES = ("RAW", "CR3", "cRAW", "RAW + Large Fine JPEG")
    FAST_JPEG_CANDIDATES = (
        "Small Fine JPEG",
        "S1 Fine",
        "Small Normal JPEG",
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
                self._gp_camera.exit(self._gp_context)
            except Exception:
                pass
            self._gp_camera = None

        try:
            ctx = gp.Context()
            cam = gp.Camera()
            cam.init(ctx)
            self._gp_context = ctx
            self._gp_camera = cam
            self._set_widget_sync("autopoweroff", ("0", "Off", "Disable"))
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
            cfg = self._gp_camera.get_config(self._gp_context)
            ok, widget = gp.gp_widget_get_child_by_name(cfg, "imageformat")
            if ok >= gp.GP_OK:
                choices = [widget.get_choice(i) for i in range(widget.count_choices())]
                for cand in self.RAW_FORMAT_CANDIDATES:
                    for ch in choices:
                        if cand.lower() == ch.lower() or "raw" in ch.lower():
                            self._raw_format_label = ch
                            break
                for cand in self.FAST_JPEG_CANDIDATES:
                    for ch in choices:
                        if cand.lower() in ch.lower():
                            self._fast_jpeg_label = ch
                            break
        except Exception:
            pass

    def _set_widget_sync(self, widget_name: str, candidates: tuple[str, ...]) -> bool:
        if self._gp_camera is None or gp is None:
            return False
        try:
            cfg = self._gp_camera.get_config(self._gp_context)
            ok, widget = gp.gp_widget_get_child_by_name(cfg, widget_name)
            if ok < gp.GP_OK:
                return False

            choices = []
            try:
                choices = [widget.get_choice(i) for i in range(widget.count_choices())]
            except Exception:
                pass

            if choices:
                for cand in candidates:
                    for ch in choices:
                        if cand.lower() == ch.lower() or cand == ch:
                            widget.set_value(ch)
                            self._gp_camera.set_config(cfg, self._gp_context)
                            return True
                for cand in candidates:
                    for ch in choices:
                        if cand in ch:
                            widget.set_value(ch)
                            self._gp_camera.set_config(cfg, self._gp_context)
                            return True
            else:
                for val in candidates:
                    try:
                        widget.set_value(val)
                        self._gp_camera.set_config(cfg, self._gp_context)
                        return True
                    except Exception:
                        continue
        except Exception:
            pass
        return False

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
        if exposure_s <= 30.0:
            STATE.camera.shutter_speed = f"{exposure_s:g}s"
            cands = (str(exposure_s), f"{exposure_s:g}", f"{exposure_s:.1f}", str(int(round(exposure_s))))
            if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None:
                return self._set_widget_sync("shutterspeed", cands)
        else:
            STATE.camera.shutter_speed = f"BULB ({exposure_s}s)"
            if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None:
                return self._set_widget_sync("shutterspeed", ("bulb", "Bulb"))
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
                self._set_widget_sync("capturetarget", ("Internal RAM", "RAM"))
            else:
                self._set_widget_sync("imageformat", (self._raw_format_label,) + self.RAW_FORMAT_CANDIDATES)

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
                    self._gp_camera.exit(self._gp_context)
                except Exception:
                    pass
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
                self._set_widget_sync,
                "eosremoterelease",
                ("Release Full", "None", "Immediate Release"),
            )
        await self.ensure_raw_format()

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
            STATE.camera.shutter_speed = f"{exposure_s}s" if exposure_s <= 30.0 else f"BULB ({exposure_s}s)"
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
                raise RuntimeError(f"Capture failed after {max_retries} attempts: {last_exc}")
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
            # Configure ISO and capturetarget
            await loop.run_in_executor(self._executor, self._set_widget_sync, "iso", (str(iso),))
            target_choices = ("Memory card", "SD Card") if keep_on_camera_sd else ("Internal RAM", "RAM")
            await loop.run_in_executor(self._executor, self._set_widget_sync, "capturetarget", target_choices)

            if exposure_s <= 30.0:
                await loop.run_in_executor(
                    self._executor,
                    self._set_widget_sync,
                    "shutterspeed",
                    (str(exposure_s), f"{exposure_s:.1f}", str(int(round(exposure_s)))),
                )
                capture_future = loop.run_in_executor(
                    self._executor,
                    self._gphoto_standard_capture_sync,
                    output_path,
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

            # Bulb Exposure (> 30s) via eosremoterelease
            await loop.run_in_executor(self._executor, self._set_widget_sync, "shutterspeed", ("bulb", "Bulb"))
            await loop.run_in_executor(
                self._executor,
                self._set_widget_sync,
                "eosremoterelease",
                ("Immediate", "Press Full", "Press 2"),
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
                await loop.run_in_executor(
                    self._executor,
                    self._set_widget_sync,
                    "eosremoterelease",
                    ("Release Full", "None", "Immediate Release"),
                )

            await loop.run_in_executor(self._executor, self._gphoto_wait_file_added_sync, output_path)
            return

        # Simulator path (caps simulated real-time wait at 0.35s for fast responsiveness unless testing ticks)
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

    def capture_preview_frame_sync(self, output_path: Path) -> Path:
        """Capture an instant viewfinder frame directly from Canon live-view stream without actuating the physical shutter."""
        if STATE.camera.driver_mode == "gphoto2" and self._gp_camera is not None and gp is not None:
            try:
                camera_file = self._gp_camera.capture_preview(self._gp_context)
            except TypeError:
                camera_file = self._gp_camera.capture_preview()
            file_data = camera_file.get_data_and_size()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(bytes(file_data))
            return output_path

        # Simulator fallback: render synthetic frame fast
        obs = ObserverLocation(
            latitude_deg=STATE.observer.latitude_deg,
            longitude_deg=STATE.observer.longitude_deg,
            elevation_m=STATE.observer.elevation_m,
            pressure_hpa=STATE.observer.pressure_hpa,
            temperature_c=STATE.observer.temperature_c,
            refraction_enabled=STATE.observer.refraction_enabled,
        )
        SIM_RIG.render_synthetic_frame(
            output_path,
            is_raw=False,
            frame_type="Light",
            exposure_s=0.1,
            iso="800",
            mode=STATE.active_mode,
            observer=obs,
            utc_timestamp=STATE.observer.current_utc_timestamp(),
        )
        return output_path

    async def capture_live_view(self, output_path: Path) -> Path:
        """Asynchronously stream a live viewfinder frame without tripping the shutter."""
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
                ev_type, _ = self._gp_camera.wait_for_event(50, self._gp_context)
                if ev_type == gp.GP_EVENT_TIMEOUT:
                    break
            except Exception:
                break

    def _gphoto_standard_capture_sync(self, output_path: Path) -> None:
        # Drain any lingering live view frames from the camera's USB FIFO buffer
        self._drain_events_sync(max_wait_ms=300)

        direct_exc = None
        try:
            file_path = self._gp_camera.capture(gp.GP_CAPTURE_IMAGE, self._gp_context)
            camera_file = self._gp_camera.file_get(
                file_path.folder,
                file_path.name,
                gp.GP_FILE_TYPE_NORMAL,
                self._gp_context,
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            camera_file.save(str(output_path))
            try:
                self._gp_camera.file_delete(file_path.folder, file_path.name, self._gp_context)
            except Exception:
                pass
            return
        except Exception as exc:
            direct_exc = exc

        # Event-driven wait fallback for Canon cameras (handles asynchronous PTP buffer flush)
        deadline = time.monotonic() + 15.0
        while time.monotonic() < deadline:
            try:
                ev_type, ev_data = self._gp_camera.wait_for_event(500, self._gp_context)
            except Exception:
                break
            if ev_type == gp.GP_EVENT_FILE_ADDED:
                camera_file = self._gp_camera.file_get(
                    ev_data.folder,
                    ev_data.name,
                    gp.GP_FILE_TYPE_NORMAL,
                    self._gp_context,
                )
                output_path.parent.mkdir(parents=True, exist_ok=True)
                camera_file.save(str(output_path))
                try:
                    self._gp_camera.file_delete(ev_data.folder, ev_data.name, self._gp_context)
                except Exception:
                    pass
                return
        if direct_exc is not None:
            raise direct_exc
        raise TimeoutError("Timed out waiting for image capture from Canon EOS M200")

    def _gphoto_wait_file_added_sync(self, output_path: Path) -> None:
        deadline = time.monotonic() + 15.0
        while time.monotonic() < deadline:
            ev_type, ev_data = self._gp_camera.wait_for_event(500, self._gp_context)
            if ev_type == gp.GP_EVENT_FILE_ADDED:
                camera_file = self._gp_camera.file_get(
                    ev_data.folder,
                    ev_data.name,
                    gp.GP_FILE_TYPE_NORMAL,
                    self._gp_context,
                )
                output_path.parent.mkdir(parents=True, exist_ok=True)
                camera_file.save(str(output_path))
                try:
                    self._gp_camera.file_delete(ev_data.folder, ev_data.name, self._gp_context)
                except Exception:
                    pass
                return
        raise TimeoutError("Timed out waiting for GP_EVENT_FILE_ADDED after Bulb release")

    def status_dict(self) -> Dict[str, Any]:
        from dataclasses import asdict
        return asdict(STATE.camera)


CAMERA = CameraController()

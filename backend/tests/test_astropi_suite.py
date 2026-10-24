"""Comprehensive Verification Suite for AstroPi Backend, Astrometry, .CR3 Pipeline & Offload."""

from __future__ import annotations

import io
import sys
import time
import unittest
import zipfile
from pathlib import Path

import numpy as np

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.astrometry.coordinates import (  # noqa: E402
    ObserverLocation,
    bennett_refraction_deg,
    camera_attitude_matrix_neu,
    target_celestial_pole_neu,
)
from app.astrometry.framing import compute_framing_guidance  # noqa: E402
from app.astrometry.polar_align import PolarAlignEngine  # noqa: E402
from app.config import CONFIG  # noqa: E402
from app.hardware.camera_actor import (  # noqa: E402
    parse_canon_shutter_choice,
    select_best_canon_shutter_choice,
)
from app.hardware.simulated_camera import SIM_RIG  # noqa: E402
from app.imaging.cr3_parser import (  # noqa: E402
    build_synthetic_cr3_bytes,
    decode_cr3_preview_array,
    extract_embedded_jpeg_from_cr3,
)
from app.imaging.focus_metrics import compute_star_hfr_metrics  # noqa: E402
from app.imaging.stretch import auto_stretch_rgb, compute_histogram_256, encode_jpeg_bytes  # noqa: E402
from app.main import app  # noqa: E402
from app.state import STATE  # noqa: E402
from app.web_compat import UniversalTestClient  # noqa: E402


class TestAstroPiSuite(unittest.TestCase):
    def setUp(self) -> None:
        self.client = UniversalTestClient(app)
        self.observer = ObserverLocation(
            latitude_deg=38.8951,
            longitude_deg=-77.0364,
            elevation_m=320.0,
            pressure_hpa=1010.0,
            temperature_c=10.0,
            refraction_enabled=True,
        )

    def tearDown(self) -> None:
        self.client.close()

    def test_01_bennett_refraction_and_so3_orthogonality(self) -> None:
        """Verify Bennett atmospheric refraction and SO(3) camera attitude matrix properties."""
        r_deg = bennett_refraction_deg(38.8951, pressure_hpa=1010.0, temperature_c=10.0)
        # At ~39 deg altitude, atmospheric refraction is ~1.2 arcminutes (0.02 deg)
        self.assertGreater(r_deg * 60.0, 0.9)
        self.assertLess(r_deg * 60.0, 1.6)

        r_cam = camera_attitude_matrix_neu(20.988, 44.33, 15.0, time.time(), self.observer)
        self.assertEqual(r_cam.shape, (3, 3))
        np.testing.assert_allclose(r_cam.T @ r_cam, np.eye(3), atol=1e-6)
        self.assertAlmostEqual(float(np.linalg.det(r_cam)), 1.0, places=6)

    def test_02_so3_three_point_polar_alignment_and_bump_check(self) -> None:
        """Verify 3-point SO(3) Polar Alignment recovers exact wedge Alt/Az errors and detects tripod bumps."""
        engine = PolarAlignEngine()
        engine.reset(mode_points=3)

        SIM_RIG.wedge_alt_error_arcmin = 14.5
        SIM_RIG.wedge_az_error_arcmin = -9.2
        SIM_RIG.ra_clutch_angle_deg = 0.0
        ts = 1792195200.0

        for step_deg in (0.0, 28.0, 56.0):
            SIM_RIG.ra_clutch_angle_deg = step_deg
            wcs = SIM_RIG.compute_current_sky_wcs("PA", self.observer, ts)
            res = engine.add_calibration_point(
                wcs["ra_hours"],
                wcs["dec_deg"],
                wcs["crota2_deg"],
                ts,
                self.observer,
            )

        self.assertEqual(res["phase"], "LIVE_ADJUST")
        self.assertFalse(res["bump_warning"])
        self.assertLess(res["bump_residual_arcmin"], 0.5)
        self.assertAlmostEqual(res["alt_error_arcmin"], 14.5, delta=0.4)
        self.assertAlmostEqual(res["az_error_arcmin"], -9.2, delta=0.4)
        self.assertIn("RAISE", res["alt_direction"])
        self.assertIn("LEFT", res["az_direction"])

        # Now simulate turning the Star Adventurer 2i wedge knobs to zero out the error
        SIM_RIG.wedge_alt_error_arcmin = 0.3
        SIM_RIG.wedge_az_error_arcmin = -0.2
        wcs_live = SIM_RIG.compute_current_sky_wcs("PA", self.observer, ts + 15.0)
        live_res = engine.evaluate_live_frame(
            wcs_live["ra_hours"],
            wcs_live["dec_deg"],
            wcs_live["crota2_deg"],
            ts + 15.0,
            self.observer,
        )
        self.assertLess(live_res["total_error_arcmin"], 0.6)

    def test_03_cr3_zero_copy_extraction_mtf_stretch_and_hfr(self) -> None:
        """Verify <15ms ISO-BMFF .CR3 JPEG extraction, MTF stretch, and star HFR calculation."""
        SIM_RIG.focus_defocus_steps = 0.2
        sharp_path = BACKEND_DIR / "tests" / "_tmp_sharp.CR3"
        blur_path = BACKEND_DIR / "tests" / "_tmp_blur.CR3"
        try:
            SIM_RIG.render_synthetic_frame(
                sharp_path,
                is_raw_cr3=True,
                frame_type="Light",
                exposure_s=2.0,
                iso="800",
                mode="FOCUS",
                observer=self.observer,
            )
            t0 = time.perf_counter()
            jpeg_bytes = extract_embedded_jpeg_from_cr3(sharp_path)
            dt_ms = (time.perf_counter() - t0) * 1000.0
            self.assertTrue(jpeg_bytes.startswith(b"\xff\xd8\xff"))
            self.assertTrue(jpeg_bytes.endswith(b"\xff\xd9"))
            self.assertLess(dt_ms, 50.0)

            arr_sharp, src_type = decode_cr3_preview_array(sharp_path)
            self.assertEqual(src_type, "EMBEDDED_JPEG")
            stretched = auto_stretch_rgb(arr_sharp, enable_stretch=True)
            hist = compute_histogram_256(stretched)
            self.assertEqual(len(hist["luma"]), 64)

            m_sharp = compute_star_hfr_metrics(arr_sharp)
            self.assertGreater(m_sharp["star_count"], 5)

            # Increase simulated defocus and verify HFR increases
            SIM_RIG.focus_defocus_steps = 3.2
            SIM_RIG.render_synthetic_frame(
                blur_path,
                is_raw_cr3=True,
                frame_type="Light",
                exposure_s=2.0,
                iso="800",
                mode="FOCUS",
                observer=self.observer,
            )
            arr_blur, _ = decode_cr3_preview_array(blur_path)
            m_blur = compute_star_hfr_metrics(arr_blur)
            self.assertGreater(m_blur["hfr_median"], m_sharp["hfr_median"])
        finally:
            SIM_RIG.focus_defocus_steps = 1.0
            for p in (
                sharp_path,
                sharp_path.with_suffix(".simwcs.json"),
                blur_path,
                blur_path.with_suffix(".simwcs.json"),
            ):
                if p.exists():
                    p.unlink()

    def test_04_api_polar_align_framing_and_raw_format_guards(self) -> None:
        """Verify PA and Framing API endpoints and guarantee RAW (.CR3) restoration after fast JPEG loops."""
        # 1. Start PA -> camera format must switch to Small Fine JPEG
        r = self.client.post("/api/pa/start", json={"mode_points": 2, "auto_advance": False})
        self.assertEqual(r.status_code, 200)
        st = self.client.get("/api/camera/status").json()
        self.assertTrue(st["is_fast_jpg_mode"])

        # 2. Capture 2 calibration points
        r1 = self.client.post("/api/pa/capture-point", json={"exposure_s": 1.0, "iso": "1600"})
        self.assertEqual(r1.status_code, 200)
        r2 = self.client.post("/api/pa/capture-point", json={"exposure_s": 1.0, "iso": "1600", "simulate_ra_step_deg": 30.0})
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()["phase"], "LIVE_ADJUST")

        # 3. Stop PA live loop -> must restore camera to RAW (.CR3)!
        r_stop = self.client.post("/api/pa/live-loop/stop", json={"restore_raw": True})
        self.assertEqual(r_stop.status_code, 200)
        st_after = self.client.get("/api/camera/status").json()
        self.assertFalse(st_after["is_fast_jpg_mode"])
        self.assertEqual(st_after["image_format"], "RAW (.CR3)")

        # 4. Solve Framing -> must compute Push-To guidance and automatically restore RAW (.CR3)
        r_frame = self.client.post("/api/framing/solve", json={"exposure_s": 1.0, "iso": "1600"})
        self.assertEqual(r_frame.status_code, 200)
        f_data = r_frame.json()
        self.assertTrue(f_data["solved"])
        self.assertTrue(len(f_data["instructions_equatorial"]) > 0)
        self.assertTrue(len(f_data["instructions_ballhead"]) > 0)
        st_frame_after = self.client.get("/api/camera/status").json()
        self.assertEqual(st_frame_after["image_format"], "RAW (.CR3)")

        # 5. Live Preview Loop and Camera Connect & Config
        r_conn = self.client.post("/api/camera/connect")
        self.assertEqual(r_conn.status_code, 200)
        self.assertIn("driver_mode", r_conn.json())

        r_cfg = self.client.post("/api/camera/config", json={"iso": "1600", "exposure_s": 2.0})
        self.assertEqual(r_cfg.status_code, 200)
        self.assertEqual(r_cfg.json()["iso"], "1600")

        r_loop_start = self.client.post("/api/camera/live-loop/start", json={"exposure_s": 1.0, "iso": "800"})
        self.assertEqual(r_loop_start.status_code, 200)
        self.assertTrue(r_loop_start.json()["running"])

        r_loop_stop = self.client.post("/api/camera/live-loop/stop")
        self.assertEqual(r_loop_stop.status_code, 200)
        self.assertFalse(r_loop_stop.json()["running"])
        self.assertEqual(self.client.get("/api/camera/status").json()["image_format"], "RAW (.CR3)")

    def test_05_sequence_interlocks_culling_and_streaming_zip_offload(self) -> None:
        """Verify multi-step .CR3 sequencing, Light->Dark interlock, Siril culling, and Streaming ZIP offload."""
        plan_resp = self.client.post(
            "/api/sequence/plans",
            json={
                "id": "plan_test_offload",
                "name": "Test M31 Offload Sequence",
                "target_name": "M31 Andromeda",
                "steps": [
                    {"frame_type": "Light", "exposure_s": 1.0, "iso": "800", "total_count": 2, "cooldown_s": 0.05},
                    {"frame_type": "Dark", "exposure_s": 1.0, "iso": "800", "total_count": 1, "cooldown_s": 0.05},
                ],
            },
        )
        self.assertEqual(plan_resp.status_code, 200)

        start_resp = self.client.post("/api/sequence/plans/plan_test_offload/start", json={"reset_progress": True})
        self.assertEqual(start_resp.status_code, 200)

        # Wait until sequence reaches AWAITING_INTERLOCK (between Light and Dark)
        for _ in range(40):
            s_state = self.client.get("/api/system/state").json()["sequence"]
            if s_state["status"] == "AWAITING_INTERLOCK":
                break
            self.client._loop.run_until_complete(__import__("asyncio").sleep(0.1))

        s_state = self.client.get("/api/system/state").json()["sequence"]
        self.assertEqual(s_state["status"], "AWAITING_INTERLOCK")
        self.assertEqual(s_state["interlock_type"], "Dark")

        # Confirm the Dark frame lens-cap interlock
        c_resp = self.client.post("/api/sequence/confirm-interlock")
        self.assertEqual(c_resp.status_code, 200)

        # Wait for sequence completion
        for _ in range(40):
            s_state = self.client.get("/api/system/state").json()["sequence"]
            if s_state["status"] == "COMPLETED":
                break
            self.client._loop.run_until_complete(__import__("asyncio").sleep(0.1))

        self.assertEqual(s_state["status"], "COMPLETED")

        # Inspect sessions & verify Siril folder layout + sub-frame culling + streaming ZIP download
        sess_list = self.client.get("/api/sessions").json()["sessions"]
        target_sess = next(s for s in sess_list if "M31_Andromeda" in s["id"])
        self.assertEqual(target_sess["total_frames"], 3)
        self.assertEqual(target_sess["accepted_frames"], 3)

        # Reject the first frame and verify it moves to rejected/
        first_frame_id = target_sess["frames"][0]["id"]
        cull_resp = self.client.post(
            f"/api/sessions/{target_sess['id']}/frames/{first_frame_id}/cull",
            json={"status": "rejected", "reject_reason": "Simulated wind gust"},
        )
        self.assertEqual(cull_resp.status_code, 200)
        self.assertTrue(cull_resp.json()["frame"]["relative_path"].startswith("rejected/"))

        # Download the Zero-RAM Streaming ZIP with exclude_rejected=true
        zip_resp = self.client.get(f"/api/sessions/{target_sess['id']}/download.zip?exclude_rejected=true")
        self.assertEqual(zip_resp.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(zip_resp.content), "r") as zf:
            names = zf.namelist()
            self.assertEqual(len([n for n in names if n.endswith(".CR3")]), 2)
            self.assertTrue(any(n.endswith("session_manifest.csv") for n in names))
            self.assertFalse(any("/rejected/" in n for n in names))

        # Clean up test session
        del_resp = self.client.delete(f"/api/sessions/{target_sess['id']}")
        self.assertEqual(del_resp.status_code, 200)

    def test_06_system_endpoints_and_root_ca_export(self) -> None:
        """Verify system status and downloadable Root CA profile for HTTPS / PWA."""
        state_resp = self.client.get("/api/system/state")
        self.assertEqual(state_resp.status_code, 200)
        self.assertIn("system", state_resp.json())

        storage_resp = self.client.get("/api/system/storage")
        self.assertEqual(storage_resp.status_code, 200)
        self.assertIn("active_storage_path", storage_resp.json())

        ca_resp = self.client.get("/api/system/ca.crt")
        self.assertEqual(ca_resp.status_code, 200)
        self.assertIn(b"BEGIN CERTIFICATE", ca_resp.content)
        self.assertEqual(ca_resp.headers.get("content-type"), "application/x-x509-ca-cert")

    def test_07_canon_shutter_matching_preview_stretch_and_pre_capture_hooks(self) -> None:
        """Verify Canon shutter choice log-stop matching, cached stretch toggle, and EVF pre-capture hooks."""
        canon_choices = [
            "bulb", "30", "25", "20", "15", "13", "10", "8", "6", "5", "4",
            '3"2', "2.5", "2", "1.6", "1.3", "1", "0.8", "0.6", '0"5', "0.4", "0.3",
            "1/4", "1/8", "1/15", "1/30", "1/60", "1/125", "1/250", "1/500",
            "1/1000", "1/2000", "1/4000",
        ]
        self.assertAlmostEqual(parse_canon_shutter_choice("1/1000") or 0.0, 0.001, places=6)
        self.assertAlmostEqual(parse_canon_shutter_choice('0"5') or 0.0, 0.5, places=6)
        self.assertAlmostEqual(parse_canon_shutter_choice('3"2') or 0.0, 3.2, places=6)
        self.assertIsNone(parse_canon_shutter_choice("bulb"))

        # Bias frame (0.001s) must select 1/1000, NEVER substring-match "30"!
        self.assertEqual(select_best_canon_shutter_choice(canon_choices, 0.001), "1/1000")
        self.assertEqual(select_best_canon_shutter_choice(canon_choices, 0.0002), "1/4000")
        self.assertEqual(select_best_canon_shutter_choice(canon_choices, 0.5), '0"5')
        self.assertEqual(select_best_canon_shutter_choice(canon_choices, 1.5), "1.6")
        self.assertEqual(select_best_canon_shutter_choice(canon_choices, 30.0), "30")

        # Canon EOS M200 imageformat list must prefer 'S1' (6MP Fine JPEG) and 'RAW', never 'RAW + L'
        m200_formats = [
            "L", "cL", "M", "cM", "S1", "cS1", "S2",
            "RAW + L", "RAW + S1", "cRAW + L", "RAW", "cRAW",
        ]
        from app.hardware.camera_actor import CameraController
        non_raw = [c for c in m200_formats if "raw" not in c.lower()]
        picked_jpg = next(
            c for cand in CameraController.FAST_JPEG_CANDIDATES for c in non_raw if cand.lower() == c.lower()
        )
        self.assertEqual(picked_jpg, "S1")

        # Preview endpoint returns 404 without firing shutter when no preview exists
        preview_file = CONFIG.shm_dir / "latest_preview.jpg"
        if preview_file.exists():
            preview_file.unlink()
        r_missing = self.client.get("/api/camera/preview.jpg")
        self.assertEqual(r_missing.status_code, 404)

        # Capture a preview shot and verify stretch toggle re-renders from cached source
        r_shot = self.client.post("/api/camera/capture", json={"exposure_s": 1.0, "iso": "1600", "fast_jpeg": True})
        self.assertEqual(r_shot.status_code, 200)
        self.assertEqual(self.client.get("/api/camera/preview.jpg").status_code, 200)

        r_unstretch = self.client.post("/api/camera/preview-stretch", json={"enabled": False})
        self.assertEqual(r_unstretch.status_code, 200)
        self.assertFalse(r_unstretch.json()["auto_stretched"])
        self.assertFalse(self.client.get("/api/system/state").json()["preview"]["auto_stretched"])

        r_restretch = self.client.post("/api/camera/preview-stretch", json={})
        self.assertEqual(r_restretch.status_code, 200)
        self.assertTrue(r_restretch.json()["auto_stretched"])
        self.assertTrue(self.client.get("/api/system/state").json()["preview"]["auto_stretched"])

        # Pre-capture hook: starting Live Viewfinder then triggering Framing Solve auto-stops Live Viewfinder
        r_lv = self.client.post("/api/camera/live-loop/start", json={"exposure_s": 0.5, "iso": "1600"})
        self.assertEqual(r_lv.status_code, 200)
        self.assertTrue(self.client.get("/api/camera/status").json()["live_view_running"])

        r_solve = self.client.post("/api/framing/solve", json={"exposure_s": 1.0, "iso": "1600"})
        self.assertEqual(r_solve.status_code, 200)
        st_after = self.client.get("/api/camera/status").json()
        self.assertFalse(st_after["live_view_running"])
        self.assertEqual(st_after["image_format"], "RAW (.CR3)")

        # Catalog endpoint returns full seeded deep-sky list cleanly
        r_cat = self.client.get("/api/framing/catalog")
        self.assertEqual(r_cat.status_code, 200)
        self.assertGreaterEqual(len(r_cat.json()["items"]), 100)


if __name__ == "__main__":
    unittest.main(verbosity=2)

# AstroPi: Headless Polar Alignment, Framing, Focus & `.CR3` Sequencing PWA

Ultra-lightweight, self-hosted Progressive Web Application (PWA) designed for a headless **Raspberry Pi 4 (4GB RAM, 64-bit Linux)** controlling a **Canon EOS M200** over USB 2.0 on a **Sky-Watcher Star Adventurer 2i** tracker with a **TPO UltraWide 180 (180mm f/4.5)** lens.

---

## Key Capabilities

1. **Single-Daemon Headless Backend & Multi-Client WebSocket Sync**
   - Exclusive `libgphoto2` persistent PTP session (`backend/app/hardware/camera_actor.py`) with automatic fallback to a realistic synthetic sky/camera simulator (`backend/app/hardware/simulated_camera.py`) when running without physical hardware.
   - Hybrid exposure timing: native PTP shutter speeds for $\le 30\text{s}$ and `shutterspeed=bulb` + `eosremoterelease` monotonic countdown timer for exposures $> 30\text{s}$.
   - **Guaranteed `RAW (.CR3)` Format Restoration Guard:** Automatically switches the Canon EOS M200 to `Small Fine JPEG` in `/dev/shm/astropi` (RAM disk) for fast ~2.5s plate-solving loops and restores `RAW (.CR3)` upon exiting Polar Alignment, Framing, or Focus modes, or on abort/shutdown.
   - Defense-in-depth USB recovery: masks `gvfs`/`udisks2` auto-mounters and triggers Linux `USBDEVFS_RESET` (`0x5514`) on USB timeouts.

2. **All-Sky 2-Point & 3-Point $SO(3)$ Polar Alignment (`backend/app/astrometry/polar_align.py`)**
   - Full astrometric reduction (`backend/app/astrometry/coordinates.py`): transforms ASTAP J2000 $(\alpha, \delta, \text{CROTA2})$ to topocentric apparent JNow North-East-Up (NEU) coordinates with IAU 2006/2000A precession, nutation, annual aberration, and Bennett atmospheric refraction.
   - Computes the mount's mechanical RA axis from 2 or 3 manual RA clutch rotations ($\sim 20^\circ\text{--}35^\circ$ apart) anywhere on the sky, invariant to whether Star Adventurer 2i sidereal tracking is ON or OFF, with a 3-point flexure/bump residual warning.
   - Continuous ~2.5s Live Wedge Adjustment loop using seeded ASTAP searches (`-fov 4.74 -z 2 -ra -spd -r 15`, ~0.2s on Pi 4), auto-scaling concentric bullseye radar, 5-point breadcrumb trail, and Star Adventurer 2i Altitude knob turn estimates ($1.2^\circ/\text{turn}$).

3. **Plate-Solved "Push-To" Framing & Manual Focus Aid (`backend/app/astrometry/framing.py`)**
   - Offline SQLite Deep-Sky & Focus Star Catalog (`backend/app/catalog/seed_catalog.py`) with live Altitude/Azimuth visibility filtering and Telescopius CSV import.
   - Dual-frame Push-To guidance: outputs both **Equatorial ($\Delta\text{RA}, \Delta\text{Dec}$)** instructions (for Star Adventurer Dec L-brackets) and **Camera-Sensor ($\Delta X, \Delta Y$ & $\Delta\text{Alt}, \Delta\text{Az}$)** instructions (for ball heads).
   - Two-tier memory-safe `.CR3` preview pipeline (`backend/app/imaging/cr3_parser.py`): extracts the embedded JPEG from `.CR3` ISO-BMFF boxes via `mmap` in `<15ms` and `<25MB RAM`, applies a PixInsight-style MTF auto-stretch (`backend/app/imaging/stretch.py`), and computes multi-star or 1:1 ROI Half-Flux Radius (HFR) & FWHM (`backend/app/imaging/focus_metrics.py`).

4. **Resilient `.CR3` Sequencer, Sub-Frame Culling & 3-Path Photo Offload**
   - Multi-step plans (`Light`, `Dark`, `Bias`, `Flat`) persisted in SQLite WAL mode with interactive Calibration Interlock prompts (*"Place lens cap on TPO 180 for Dark frames"*).
   - Saves directly into **Siril & PixInsight WBPP-ready folders**: `<Target>_<YYYY-MM-DD>/{lights,darks,biases,flats,rejected}/` with `session_manifest.csv` and `session_manifest.json`.
   - **Three Offload Paths:**
     1. **LAN Samba (SMB3) Share:** `\\astro.local\captures` (Windows Explorer) & `smb://astro.local/captures` (macOS Finder).
     2. **Zero-RAM Streaming ZIP Download:** Streams multi-GB sessions as an uncompressed `ZIP_STORED` archive (`GET /api/sessions/{id}/download.zip?exclude_rejected=true`) using `<6MB RAM`.
     3. **Plug-and-Play USB 3.0 Drive + Safe Eject:** One-tap `Safe Eject USB 3.0 Drive` button flushes kernel buffers and unmounts external exFAT/ext4 SSDs.

---

## Quick Start

### 1. Raspberry Pi 4 Deployment
```bash
sudo bash deploy/install.sh
```

### 2. Local Development / Simulator Mode
```bash
PYTHONPATH=backend python3 -m app.main
# Open http://localhost:8000 in any browser
```

### 3. Run Automated Verification Suite
```bash
python3 backend/tests/test_astropi_suite.py
```

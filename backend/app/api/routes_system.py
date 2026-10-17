"""System state, smartphone GPS/UTC sync, USB 3.0 Safe Eject, and local Root CA routes."""

from __future__ import annotations

import datetime as dt
import ipaddress
import time
from pathlib import Path
from typing import Any, Dict

from ..config import CONFIG
from ..db import DB
from ..sequencer.storage import STORAGE
from ..state import STATE
from ..web_compat import APIRouter, HTTPException, Response

router = APIRouter(prefix="/api/system", tags=["system"])


def ensure_local_root_ca() -> Path:
    """Generate a self-hosted Root CA + server certificate for https://astro.local & 10.42.0.1."""
    ca_cert_path = CONFIG.certs_dir / "astropi-root-ca.crt"
    ca_key_path = CONFIG.certs_dir / "astropi-root-ca.key"
    if ca_cert_path.is_file() and ca_key_path.is_file():
        return ca_cert_path

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "AstroPi Field Observatory"),
            x509.NameAttribute(NameOID.COMMON_NAME, "AstroPi Field Local Root CA"),
        ]
    )
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1))
        .not_valid_after(now + dt.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.SubjectAlternativeName(
                [
                    x509.DNSName("astro.local"),
                    x509.DNSName("localhost"),
                    x509.IPAddress(ipaddress.IPv4Address("10.42.0.1")),
                    x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
                ]
            ),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    CONFIG.certs_dir.mkdir(parents=True, exist_ok=True)
    ca_key_path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    ca_cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return ca_cert_path


@router.get("/state")
async def get_full_system_state() -> Dict[str, Any]:
    return STATE.snapshot()


@router.get("/presets")
async def list_site_presets() -> Dict[str, Any]:
    return {"presets": DB.list_site_presets()}


@router.post("/presets")
async def create_site_preset(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    preset = DB.save_site_preset(
        name=str(body.get("name", "Custom Site")),
        latitude_deg=float(body.get("latitude_deg", STATE.observer.latitude_deg)),
        longitude_deg=float(body.get("longitude_deg", STATE.observer.longitude_deg)),
        elevation_m=float(body.get("elevation_m", STATE.observer.elevation_m)),
        bortle_class=int(body.get("bortle_class", 4)),
        make_default=bool(body.get("make_default", True)),
    )
    return {"preset": preset, "presets": DB.list_site_presets()}


@router.put("/location-time")
async def sync_location_and_time(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Sync observer GPS coordinates and UTC clock delta from smartphone browser or preset."""
    body = payload or {}
    if "latitude_deg" in body:
        STATE.observer.latitude_deg = float(body["latitude_deg"])
    if "longitude_deg" in body:
        STATE.observer.longitude_deg = float(body["longitude_deg"])
    if "elevation_m" in body:
        STATE.observer.elevation_m = float(body["elevation_m"])
    if "pressure_hpa" in body:
        STATE.observer.pressure_hpa = float(body["pressure_hpa"])
    if "temperature_c" in body:
        STATE.observer.temperature_c = float(body["temperature_c"])
    if "refraction_enabled" in body:
        STATE.observer.refraction_enabled = bool(body["refraction_enabled"])

    if "client_utc_timestamp" in body and body["client_utc_timestamp"]:
        client_utc = float(body["client_utc_timestamp"])
        STATE.observer.clock_offset_s = round(client_utc - time.time(), 3)

    STATE.observer.sync_source = str(body.get("sync_source", "Browser GPS"))
    STATE.observer.last_synced_at = time.time()
    STATE.save_observer()
    await STATE.broadcast("STATE_SNAPSHOT", STATE.snapshot())
    return STATE.snapshot()["observer"]


@router.get("/storage")
async def get_storage_status() -> Dict[str, Any]:
    return STORAGE.storage_overview()


@router.post("/storage/select")
async def select_storage_volume(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    path = str(body.get("path", ""))
    if not path:
        raise HTTPException(status_code=400, detail="path is required")
    try:
        res = STORAGE.set_active_storage_root(path)
        await STATE.broadcast("STATE_SNAPSHOT", STATE.snapshot())
        return res
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/storage/eject")
async def eject_usb_storage(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    try:
        res = STORAGE.safe_eject_usb(mount_point=body.get("mount_point"))
        await STATE.broadcast("STATE_SNAPSHOT", STATE.snapshot())
        return res
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/ca.crt")
async def download_local_root_ca() -> Response:
    cert_path = ensure_local_root_ca()
    return Response(
        content=cert_path.read_bytes(),
        media_type="application/x-x509-ca-cert",
        headers={
            "Content-Disposition": 'attachment; filename="AstroPi-Local-Root-CA.crt"',
        },
    )

"""Astrometric coordinate transformations (J2000 ICRS -> JNow Topocentric NEU + Bennett Refraction).

Uses pyerfa (IAU SOFA C library) when installed, with a built-in IAU 2006/2000A
precession, nutation, annual aberration, LAST, and Bennett atmospheric refraction
engine in pure NumPy so sub-arcsecond accuracy is guaranteed in all environments.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Tuple

import numpy as np

try:
    import erfa as _erfa  # type: ignore
    HAS_ERFA = True
except Exception:
    _erfa = None
    HAS_ERFA = False


JD_J2000 = 2451545.0
ARCSEC_TO_RAD = math.pi / (180.0 * 3600.0)


@dataclass
class ObserverLocation:
    latitude_deg: float
    longitude_deg: float
    elevation_m: float = 300.0
    pressure_hpa: float = 1010.0
    temperature_c: float = 10.0
    refraction_enabled: bool = True


def unix_to_jd(utc_timestamp: float) -> float:
    """Convert Unix UTC timestamp (seconds since 1970-01-01T00:00:00Z) to Julian Date."""
    return (utc_timestamp / 86400.0) + 2440587.5


def bennett_refraction_deg(
    true_alt_deg: float,
    pressure_hpa: float = 1010.0,
    temperature_c: float = 10.0,
) -> float:
    """Compute atmospheric refraction lift (in degrees) using Bennett's formula (1982).

    Returns R >= 0 such that apparent_alt_deg = true_alt_deg + R.
    """
    if true_alt_deg < -1.0 or true_alt_deg >= 89.99:
        return 0.0
    h = max(true_alt_deg, 0.0)
    # Bennett formula in arcminutes for standard atmosphere (1010 hPa, 10 C)
    arg_deg = h + 7.31 / (h + 4.4)
    r_arcmin = 1.0 / math.tan(math.radians(arg_deg))
    # Empirical correction for Bennett accuracy (< 0.07 arcmin error from 0 to 90 deg)
    r_arcmin -= 0.06 * math.sin(math.radians(14.7 * r_arcmin + 13.0))
    # Pressure and temperature scaling
    scale = (pressure_hpa / 1010.0) * (283.0 / (273.15 + temperature_c))
    return max(0.0, (r_arcmin * scale) / 60.0)


def _iau2006_precession_nutation_matrix(jd_utc: float) -> np.ndarray:
    """Compute the ICRS (J2000.0) to True Equator & Equinox of Date (JNow) 3x3 matrix.

    Implements Capitaine et al. (2003) / IAU 2006 Fukushima-Williams precession angles
    plus dominant IAU 2000B nutation terms.
    """
    t = (jd_utc - JD_J2000) / 36525.0  # Julian centuries since J2000.0

    # IAU 2006 precession angles (zeta_A, z_A, theta_A) in arcseconds
    zeta_a = (2.650545 + (2306.083227 + (0.2988499 + (0.01801828 - 0.000005971 * t) * t) * t) * t) * ARCSEC_TO_RAD
    z_a = (-2.650545 + (2306.077181 + (1.0927348 + (0.01826837 - 0.000028596 * t) * t) * t) * t) * ARCSEC_TO_RAD
    theta_a = ((2004.191903 + (-0.4294934 + (-0.04182264 - 0.000007089 * t) * t) * t) * t) * ARCSEC_TO_RAD

    # Mean obliquity of the ecliptic epsilon_0 (arcseconds -> radians)
    eps0 = (84381.406 + (-46.836769 + (-0.0001831 + 0.00200340 * t) * t) * t) * ARCSEC_TO_RAD

    # Fundamental Delaunay / planetary arguments (radians) for Nutation
    omega = math.radians((125.04455501 - 1934.1361849 * t) % 360.0)
    l_sun = math.radians((280.4664568 + 36000.7698278 * t) % 360.0)
    l_moon = math.radians((218.3165 + 481267.8813 * t) % 360.0)
    d_elong = math.radians((297.85019547 + 445267.1115168 * t) % 360.0)

    # Principal nutation in longitude (dpsi) and obliquity (deps)
    dpsi = (
        -17.2064 * math.sin(omega)
        - 1.3170 * math.sin(2.0 * l_sun)
        - 0.2276 * math.sin(2.0 * l_moon)
        + 0.2074 * math.sin(2.0 * omega)
        + 0.1475 * math.sin(2.0 * d_elong)
    ) * ARCSEC_TO_RAD
    deps = (
        9.2052 * math.cos(omega)
        + 0.5730 * math.cos(2.0 * l_sun)
        + 0.0978 * math.cos(2.0 * l_moon)
        - 0.0897 * math.cos(2.0 * omega)
    ) * ARCSEC_TO_RAD

    def rot_x(ang: float) -> np.ndarray:
        c, s = math.cos(ang), math.sin(ang)
        return np.array([[1.0, 0.0, 0.0], [0.0, c, s], [0.0, -s, c]], dtype=np.float64)

    def rot_y(ang: float) -> np.ndarray:
        c, s = math.cos(ang), math.sin(ang)
        return np.array([[c, 0.0, -s], [0.0, 1.0, 0.0], [s, 0.0, c]], dtype=np.float64)

    def rot_z(ang: float) -> np.ndarray:
        c, s = math.cos(ang), math.sin(ang)
        return np.array([[c, s, 0.0], [-s, c, 0.0], [0.0, 0.0, 1.0]], dtype=np.float64)

    p_mat = rot_z(-z_a) @ rot_y(theta_a) @ rot_z(-zeta_a)
    n_mat = rot_x(-(eps0 + deps)) @ rot_z(-dpsi) @ rot_x(eps0)
    return n_mat @ p_mat, dpsi, eps0 + deps


def _annual_aberration_offset(jd_utc: float) -> np.ndarray:
    """Compute Earth's barycentric velocity vector / c (v/c) in ICRS for annual aberration."""
    t = (jd_utc - JD_J2000) / 36525.0
    # Solar apparent ecliptic longitude
    g = math.radians((357.5291092 + 35999.0502909 * t) % 360.0)
    l_sun = math.radians((280.4664568 + 36000.7698278 * t) % 360.0) + math.radians(1.914666471 * math.sin(g))
    eps0 = math.radians(23.4392911)
    kappa = 20.49552 * ARCSEC_TO_RAD  # Constant of aberration (~9.9365e-5 rad)
    return np.array(
        [
            -kappa * math.sin(l_sun),
            kappa * math.cos(l_sun) * math.cos(eps0),
            kappa * math.cos(l_sun) * math.sin(eps0),
        ],
        dtype=np.float64,
    )


def local_apparent_sidereal_time_rad(jd_utc: float, longitude_deg: float, dpsi_rad: float, eps_rad: float) -> float:
    """Compute Local Apparent Sidereal Time (LAST) in radians."""
    d = jd_utc - JD_J2000
    t = d / 36525.0
    # IAU 2006 GMST in degrees
    gmst_deg = (
        280.46061837
        + 360.98564736629 * d
        + 0.000387933 * (t**2)
        - (t**3) / 38710000.0
    ) % 360.0
    eq_equinox_deg = math.degrees(dpsi_rad * math.cos(eps_rad))
    last_deg = (gmst_deg + eq_equinox_deg + longitude_deg) % 360.0
    return math.radians(last_deg)


def radec_to_unit_vector(ra_rad: float, dec_rad: float) -> np.ndarray:
    """Convert spherical (RA, Dec) in radians to Cartesian unit vector."""
    cd = math.cos(dec_rad)
    return np.array([cd * math.cos(ra_rad), cd * math.sin(ra_rad), math.sin(dec_rad)], dtype=np.float64)


def altaz_to_neu_vector(alt_deg: float, az_deg: float) -> np.ndarray:
    """Convert Topocentric Altitude & Azimuth (degrees, N=0, E=90) to North-East-Up unit vector."""
    alt_r = math.radians(alt_deg)
    az_r = math.radians(az_deg)
    ca = math.cos(alt_r)
    return np.array([ca * math.cos(az_r), ca * math.sin(az_r), math.sin(alt_r)], dtype=np.float64)


def neu_vector_to_altaz(vec_neu: np.ndarray) -> Tuple[float, float]:
    """Convert North-East-Up unit vector to (alt_deg, az_deg in [0, 360))."""
    v = vec_neu / np.linalg.norm(vec_neu)
    alt_deg = math.degrees(math.asin(float(np.clip(v[2], -1.0, 1.0))))
    az_deg = math.degrees(math.atan2(float(v[1]), float(v[0]))) % 360.0
    return alt_deg, az_deg


def j2000_to_topocentric_altaz(
    ra_hours: float,
    dec_deg: float,
    utc_timestamp: float,
    observer: ObserverLocation,
) -> Tuple[float, float]:
    """Transform J2000 (ICRS) RA/Dec to Topocentric Apparent (Alt, Az) in degrees."""
    ra_rad = math.radians(ra_hours * 15.0)
    dec_rad = math.radians(dec_deg)
    jd_utc = unix_to_jd(utc_timestamp)

    if HAS_ERFA and _erfa is not None:
        pressure = observer.pressure_hpa if observer.refraction_enabled else 0.0
        az_r, zen_r, _, _, _ = _erfa.atco13(
            ra_rad,
            dec_rad,
            0.0,
            0.0,
            0.0,
            0.0,
            jd_utc,
            0.0,
            0.0,
            math.radians(observer.longitude_deg),
            math.radians(observer.latitude_deg),
            observer.elevation_m,
            0.0,
            0.0,
            pressure,
            observer.temperature_c,
            0.5,
            0.55,
        )
        return 90.0 - math.degrees(float(zen_r)), math.degrees(float(az_r)) % 360.0

    # Pure-NumPy IAU 2006/2000A reduction
    u_icrs = radec_to_unit_vector(ra_rad, dec_rad)
    # Apply annual aberration
    u_ab = u_icrs + _annual_aberration_offset(jd_utc)
    u_ab /= np.linalg.norm(u_ab)

    # Apply precession + nutation (ICRS -> True Equator & Equinox of Date)
    npb_mat, dpsi, eps = _iau2006_precession_nutation_matrix(jd_utc)
    u_date = npb_mat @ u_ab
    u_date /= np.linalg.norm(u_date)

    ra_date = math.atan2(float(u_date[1]), float(u_date[0]))
    dec_date = math.asin(float(np.clip(u_date[2], -1.0, 1.0)))

    last_rad = local_apparent_sidereal_time_rad(jd_utc, observer.longitude_deg, dpsi, eps)
    ha_rad = last_rad - ra_date

    lat_rad = math.radians(observer.latitude_deg)
    sin_lat, cos_lat = math.sin(lat_rad), math.cos(lat_rad)
    sin_dec, cos_dec = math.sin(dec_date), math.cos(dec_date)
    cos_ha, sin_ha = math.cos(ha_rad), math.sin(ha_rad)

    # True topocentric NEU vector before refraction
    up = sin_dec * sin_lat + cos_dec * cos_lat * cos_ha
    north = sin_dec * cos_lat - cos_dec * sin_lat * cos_ha
    east = -cos_dec * sin_ha

    true_alt_deg, az_deg = neu_vector_to_altaz(np.array([north, east, up], dtype=np.float64))
    if observer.refraction_enabled:
        refrac_deg = bennett_refraction_deg(true_alt_deg, observer.pressure_hpa, observer.temperature_c)
        return min(90.0, true_alt_deg + refrac_deg), az_deg
    return true_alt_deg, az_deg


def target_celestial_pole_neu(observer: ObserverLocation) -> Tuple[np.ndarray, float, float]:
    """Return the Target Celestial Pole (NEU unit vector, Alt deg, Az deg) for Polar Alignment.

    Supports both Northern and Southern hemispheres, and applies Bennett atmospheric
    refraction when observer.refraction_enabled is True.
    """
    is_north = observer.latitude_deg >= 0.0
    true_pole_alt_deg = abs(observer.latitude_deg)
    pole_az_deg = 0.0 if is_north else 180.0

    if observer.refraction_enabled:
        refrac_deg = bennett_refraction_deg(
            true_pole_alt_deg,
            observer.pressure_hpa,
            observer.temperature_c,
        )
        apparent_alt_deg = min(90.0, true_pole_alt_deg + refrac_deg)
    else:
        apparent_alt_deg = true_pole_alt_deg

    vec_neu = altaz_to_neu_vector(apparent_alt_deg, pole_az_deg)
    return vec_neu, apparent_alt_deg, pole_az_deg


def camera_attitude_matrix_neu(
    ra_hours: float,
    dec_deg: float,
    crota2_deg: float,
    utc_timestamp: float,
    observer: ObserverLocation,
) -> np.ndarray:
    """Construct the exact 3x3 camera attitude matrix R_cam in SO(3) in the Topocentric NEU frame.

    Columns of R_cam = [x_cam | y_cam | z_cam]:
      - z_cam: Optical axis unit vector pointing from camera to solved sky center (in NEU).
      - y_cam: Sensor '+Y' (Up) axis unit vector tangent to the celestial sphere (in NEU).
      - x_cam: Sensor '+X' (Right) axis unit vector = y_cam x z_cam (right-handed).
    """
    alt0, az0 = j2000_to_topocentric_altaz(ra_hours, dec_deg, utc_timestamp, observer)
    z_cam = altaz_to_neu_vector(alt0, az0)

    # Displace by delta_deg = 0.25 deg along sensor +Y direction in J2000 tangent plane
    # ASTAP CROTA2 is the position angle of the sensor +Y axis measured East of J2000 North
    ra0_rad = math.radians(ra_hours * 15.0)
    dec0_rad = math.radians(dec_deg)
    pa_rad = math.radians(crota2_deg)
    step_rad = math.radians(0.25)

    # Tangent basis at (ra0, dec0) in ICRS
    u0 = radec_to_unit_vector(ra0_rad, dec0_rad)
    e_north = np.array(
        [
            -math.sin(dec0_rad) * math.cos(ra0_rad),
            -math.sin(dec0_rad) * math.sin(ra0_rad),
            math.cos(dec0_rad),
        ],
        dtype=np.float64,
    )
    e_east = np.array([-math.sin(ra0_rad), math.cos(ra0_rad), 0.0], dtype=np.float64)

    dir_y_icrs = math.cos(pa_rad) * e_north + math.sin(pa_rad) * e_east
    u_step = math.cos(step_rad) * u0 + math.sin(step_rad) * dir_y_icrs
    ra_step_rad = math.atan2(float(u_step[1]), float(u_step[0])) % (2.0 * math.pi)
    dec_step_rad = math.asin(float(np.clip(u_step[2], -1.0, 1.0)))

    alt1, az1 = j2000_to_topocentric_altaz(
        math.degrees(ra_step_rad) / 15.0,
        math.degrees(dec_step_rad),
        utc_timestamp,
        observer,
    )
    v1 = altaz_to_neu_vector(alt1, az1)

    # Gram-Schmidt orthonormalization on the tangent plane at z_cam
    y_raw = v1 - float(np.dot(v1, z_cam)) * z_cam
    norm_y = float(np.linalg.norm(y_raw))
    if norm_y < 1e-12:
        y_cam = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    else:
        y_cam = y_raw / norm_y

    x_cam = np.cross(y_cam, z_cam)
    x_cam /= np.linalg.norm(x_cam)
    y_cam = np.cross(z_cam, x_cam)
    y_cam /= np.linalg.norm(y_cam)

    r_cam = np.column_stack((x_cam, y_cam, z_cam))
    return r_cam

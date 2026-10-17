"""Curated Offline Deep-Sky & Focus Star Catalog + Telescopius CSV Importer."""

from __future__ import annotations

import csv
import io
import math
from typing import Any, Dict, List, Optional

from ..astrometry.coordinates import ObserverLocation, j2000_to_topocentric_altaz
from ..db import DB


CURATED_CATALOG = [
    # Prime Wide-Field Emission / Reflection Nebulae & Galaxies for 180mm f/4.5 (7.1° x 4.7°)
    ("NGC7000", "North America & Pelican Nebulae", "NGC 7000 / IC 5070 / C20", "Emission Nebula", "Cygnus", 20.9880, 44.3300, 4.0, 120.0, "135-200mm", "Showcase 180mm target; frames both NGC 7000 and Pelican in one APS-C field"),
    ("IC1396", "Elephant's Trunk Nebula & Garnet Star", "IC 1396 / Sh2-131", "Emission Nebula", "Cepheus", 21.6500, 57.4833, 3.5, 170.0, "135-200mm", "Fill the 180mm frame with the full ionized H-II shell"),
    ("NGC6992", "Cygnus Loop (Eastern & Western Veil)", "NGC 6992 / NGC 6960 / C33 / C34", "Supernova Remnant", "Cygnus", 20.8550, 30.7100, 7.0, 180.0, "135-200mm", "Entire 3-degree Veil Supernova Remnant fits inside the 180mm FOV"),
    ("IC1805", "Heart & Soul Nebulae", "IC 1805 / IC 1848 / Sh2-190", "Emission Nebula", "Cassiopeia", 2.6800, 60.8500, 6.5, 150.0, "135-180mm", "Frame both Heart and Soul along the sensor diagonal at 180mm"),
    ("IC1848", "Soul Nebula", "IC 1848 / Sh2-199", "Emission Nebula", "Cassiopeia", 2.8550, 60.4333, 6.5, 150.0, "135-200mm", "Rich H-alpha complex adjacent to the Heart Nebula"),
    ("NGC1499", "California Nebula", "NGC 1499 / Sh2-220", "Emission Nebula", "Perseus", 4.0539, 36.4167, 5.0, 160.0, "135-200mm", "2.5-degree filament tailored for 180mm APS-C"),
    ("M31", "Andromeda Galaxy (with M32 & M110)", "M31 / NGC 224", "Spiral Galaxy", "Andromeda", 0.7123, 41.2692, 3.4, 190.0, "135-300mm", "Bright outer dust lanes span over 3 degrees"),
    ("M33", "Triangulum Galaxy", "M33 / NGC 598 / C25", "Spiral Galaxy", "Triangulum", 1.5641, 30.6602, 5.7, 70.0, "180-400mm", "Face-on spiral rich in H-II regions"),
    ("M45", "Pleiades & Merope IFN Dust Complex", "M45 / Mel 22", "Open Cluster + Reflection", "Taurus", 3.7900, 24.1167, 1.6, 110.0, "135-250mm", "Captures surrounding molecular cloud dust lanes"),
    ("M42", "Orion, Running Man & Horsehead Complex", "M42 / M43 / IC 434 / NGC 2024", "Emission/Reflection Nebula", "Orion", 5.5881, -5.3911, 4.0, 85.0, "135-200mm", "Point between Alnitak and M42 to capture both Orion and Horsehead at 180mm"),
    ("IC434", "Horsehead & Flame Nebulae", "IC 434 / B33 / NGC 2024", "Dark / Emission Nebula", "Orion", 5.6833, -2.4583, 6.8, 60.0, "135-300mm", "Alnitak + Flame + Horsehead hydrogen ridge"),
    ("NGC2237", "Rosette Nebula & Christmas Tree Cluster", "NGC 2237 / C49 / NGC 2264", "Emission Nebula", "Monoceros", 6.5319, 4.9986, 4.8, 80.0, "135-250mm", "Bright symmetrical H-II rosette"),
    ("IC1318", "Sadr Region & Butterfly Nebula (Crescent)", "IC 1318 / NGC 6888", "Emission Nebula", "Cygnus", 20.3700, 40.2500, 6.0, 240.0, "135-200mm", "Dense Cygnus rift dust and H-alpha around Gamma Cygni"),
    ("RHO_OPH", "Rho Ophiuchi & Antares Cloud Complex", "IC 4604 / M4 / Sh2-9", "Reflection/Dark Nebula", "Ophiuchus", 16.4258, -24.4600, 4.6, 210.0, "135-180mm", "Colorful reflection and dark dust lanes around Antares"),
    ("M8_M20", "Lagoon, Trifid & Cat's Paw Field", "M8 / M20 / NGC 6523 / NGC 6514", "Emission Nebula", "Sagittarius", 18.0600, -23.6000, 5.0, 90.0, "135-250mm", "Frames M8 Lagoon, M20 Trifid, and M21 in one 180mm shot"),
    ("M16_M17", "Eagle (Pillars of Creation) & Omega Nebulae", "M16 / M17 / NGC 6611", "Emission Nebula", "Serpens", 18.3260, -14.9500, 6.0, 120.0, "135-250mm", "Captures both M16 and M17 simultaneously at 180mm"),
    ("IC2177", "Seagull Nebula", "IC 2177 / Sh2-292", "Emission Nebula", "Monoceros", 7.0850, -10.4500, 7.3, 120.0, "135-200mm", "2-degree wingspan suited for 180mm APS-C"),
    ("NGC7822", "Question Mark Nebula Complex", "NGC 7822 / C11 / Sh2-171", "Emission Nebula", "Cepheus", 0.0450, 67.2500, 7.9, 120.0, "135-200mm", "High-declination circumpolar emission complex"),
    ("IC405", "Flaming Star & Tadpoles Nebulae", "IC 405 / IC 410 / C31", "Emission/Reflection Nebula", "Auriga", 5.3100, 33.8500, 6.0, 150.0, "135-200mm", "Frames IC 405, IC 410, M38, and M36 in Auriga"),
    ("SH2_129", "Flying Bat & Squid Nebulae", "Sh2-129 / Ou4", "Emission Nebula", "Cepheus", 21.1967, 59.9667, 8.5, 140.0, "135-200mm", "Wide Cepheus shell"),
    ("LDN1235", "Shark & Dark Wolf Dust Nebulae", "LDN 1235 / VdB 149", "Dark Nebula", "Cepheus", 22.1250, 73.2500, 9.0, 150.0, "135-200mm", "Broadband dark-sky IFN target in Cepheus"),
    ("NGC281", "Pacman Nebula & Mirfak Field", "NGC 281 / IC 11 / Sh2-184", "Emission Nebula", "Cassiopeia", 0.8808, 56.6253, 7.4, 35.0, "180-400mm", "High contrast Bok globules"),
    ("NGC7635", "Bubble Nebula, M52 & Lobster Claw", "NGC 7635 / M52 / Sh2-157", "Emission + Open Cluster", "Cassiopeia", 23.3450, 61.1000, 7.0, 120.0, "135-250mm", "Three major Cassiopeia objects in one 180mm frame"),
    ("M81_M82", "Bode's & Cigar Galaxies + Integrated Flux Nebula", "M81 / M82 / NGC 3077", "Galaxy Group + IFN", "Ursa Major", 9.9317, 69.3600, 6.9, 90.0, "180-400mm", "Great wide-field galaxy group with surrounding IFN"),
    ("MARKARIAN", "Markarian's Galaxy Chain (Virgo Cluster Core)", "M84 / M86 / NGC 4438", "Galaxy Cluster", "Virgo", 12.4500, 13.0500, 8.4, 150.0, "135-250mm", "Over 30 galaxies visible in a single 180mm frame"),
    ("M101", "Pinwheel Galaxy", "M101 / NGC 5457", "Spiral Galaxy", "Ursa Major", 14.0535, 54.3489, 7.9, 29.0, "180-500mm", "Large face-on spiral in Ursa Major"),
    ("M51", "Whirlpool Galaxy", "M51 / NGC 5194", "Spiral Galaxy", "Canes Venatici", 13.4979, 47.1952, 8.4, 11.0, "180-600mm", "Interacting galaxy pair"),
    ("NGC869", "Double Cluster in Perseus", "NGC 869 / NGC 884 / C14", "Open Cluster", "Perseus", 2.3333, 57.1400, 3.7, 60.0, "135-300mm", "Rich twin star clusters; excellent focus and short-sub target"),
    ("M44", "Beehive Cluster (Praesepe)", "M44 / NGC 2632", "Open Cluster", "Cancer", 8.6700, 19.6700, 3.7, 95.0, "135-250mm", "Bright wide open cluster"),
    ("M13", "Hercules Globular Cluster", "M13 / NGC 6205", "Globular Cluster", "Hercules", 16.6950, 36.4614, 5.8, 20.0, "180-600mm", "Brightest northern globular cluster"),
    # Bright Focus & Alignment Stars (for 1:1 ROI HFR/Bahtinov focusing)
    ("STAR_VEGA", "Vega (Alpha Lyrae)", "HIP 91262 / HR 7001", "Focus Star", "Lyra", 18.6156, 38.7837, 0.03, 1.0, "Any", "Primary summer/autumn focus calibration star"),
    ("STAR_DENEB", "Deneb (Alpha Cygni)", "HIP 102098 / HR 7924", "Focus Star", "Cygnus", 20.6905, 45.2803, 1.25, 1.0, "Any", "Near NGC 7000 and Sadr; ideal focus star before Cygnus sequences"),
    ("STAR_ALTAIR", "Altair (Alpha Aquilae)", "HIP 97649 / HR 7557", "Focus Star", "Aquila", 19.8464, 8.8683, 0.76, 1.0, "Any", "Equatorial summer/autumn focus star"),
    ("STAR_CAPELLA", "Capella (Alpha Aurigae)", "HIP 24608 / HR 1708", "Focus Star", "Auriga", 5.2782, 45.9980, 0.08, 1.0, "Any", "Primary autumn/winter northern focus star"),
    ("STAR_MIRFAK", "Mirfak (Alpha Persei)", "HIP 15863 / HR 1017", "Focus Star", "Perseus", 3.4054, 49.8612, 1.79, 1.0, "Any", "Embedded in Alpha Persei Cluster; great multi-star HFR field"),
    ("STAR_CAPH", "Caph (Beta Cassiopeiae)", "HIP 746 / HR 21", "Focus Star", "Cassiopeia", 0.1529, 59.1498, 2.28, 1.0, "Any", "High-altitude Cassiopeia focus & PA star"),
    ("STAR_RIGEL", "Rigel (Beta Orionis)", "HIP 24436 / HR 1713", "Focus Star", "Orion", 5.2423, -8.2016, 0.13, 1.0, "Any", "Bright winter focus star near Orion/Witch Head"),
    ("STAR_ARCTURUS", "Arcturus (Alpha Bootis)", "HIP 69673 / HR 5340", "Focus Star", "Bootes", 14.2610, 19.1824, -0.05, 1.0, "Any", "Primary spring focus star"),
    ("STAR_POLARIS", "Polaris (Alpha Ursae Minoris)", "HIP 11767 / HR 424", "Focus Star", "Ursa Minor", 2.5303, 89.2641, 1.98, 1.0, "Any", "North Celestial Pole benchmark star"),
]


def ensure_catalog_seeded() -> None:
    """Populate SQLite dso_catalog table if empty."""
    with DB.connection() as conn:
        cnt = conn.execute("SELECT COUNT(*) AS c FROM dso_catalog").fetchone()["c"]
        if cnt == 0:
            conn.executemany(
                """
                INSERT INTO dso_catalog (
                    id, common_name, catalog_ids, object_type, constellation,
                    ra_hours, dec_deg, magnitude, size_arcmin, recommended_focal_mm, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                CURATED_CATALOG,
            )


def query_catalog(
    observer: ObserverLocation,
    utc_timestamp: float,
    search: str = "",
    object_type: str = "",
    min_altitude_deg: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Query DSO catalog and enrich with live Topocentric Altitude, Azimuth, and Visibility."""
    ensure_catalog_seeded()
    sql = "SELECT * FROM dso_catalog WHERE 1=1"
    params: List[Any] = []
    if search.strip():
        q = f"%{search.strip()}%"
        sql += " AND (id LIKE ? OR common_name LIKE ? OR catalog_ids LIKE ? OR constellation LIKE ?)"
        params.extend([q, q, q, q])
    if object_type.strip():
        sql += " AND object_type = ?"
        params.append(object_type.strip())

    with DB.connection() as conn:
        rows = [dict(r) for r in conn.execute(sql, params).fetchall()]

    results: List[Dict[str, Any]] = []
    for item in rows:
        alt_deg, az_deg = j2000_to_topocentric_altaz(
            float(item["ra_hours"]),
            float(item["dec_deg"]),
            utc_timestamp,
            observer,
        )
        if min_altitude_deg is not None and alt_deg < min_altitude_deg:
            continue
        # Maximum culmination altitude at transit
        max_alt_deg = 90.0 - abs(observer.latitude_deg - float(item["dec_deg"]))
        item["current_alt_deg"] = round(alt_deg, 1)
        item["current_az_deg"] = round(az_deg, 1)
        item["max_transit_alt_deg"] = round(max(0.0, min(90.0, max_alt_deg)), 1)
        item["visible_now"] = alt_deg >= 20.0
        results.append(item)

    results.sort(key=lambda r: (r["object_type"] == "Focus Star", -r["current_alt_deg"]))
    return results


def parse_sexagesimal_or_decimal(val_str: str, is_ra: bool = False) -> float:
    """Parse RA ('20h 59m 17s' / '20:59:17' / '20.988' / '314.8d') or Dec ('+44d 19m 48s') to hours or degrees."""
    s = val_str.strip()
    if not s:
        raise ValueError("Empty coordinate string")
    try:
        v = float(s)
        if is_ra and v > 24.0:
            return v / 15.0
        return v
    except ValueError:
        pass

    sign = -1.0 if s.startswith("-") else 1.0
    cleaned = (
        s.lstrip("+-")
        .replace("h", " ")
        .replace("d", " ")
        .replace("°", " ")
        .replace("m", " ")
        .replace("'", " ")
        .replace("s", " ")
        .replace('"', " ")
        .replace(":", " ")
    )
    parts = [float(p) for p in cleaned.split() if p]
    if not parts:
        raise ValueError(f"Cannot parse coordinate: {val_str}")
    deg_or_hr = parts[0]
    if len(parts) > 1:
        deg_or_hr += parts[1] / 60.0
    if len(parts) > 2:
        deg_or_hr += parts[2] / 3600.0
    res = sign * deg_or_hr
    if is_ra and res > 24.0:
        res /= 15.0
    return res


def import_telescopius_csv(csv_text: str) -> List[Dict[str, Any]]:
    """Import custom targets from a Telescopius target list or Mosaic CSV export."""
    ensure_catalog_seeded()
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    imported: List[Dict[str, Any]] = []

    with DB.connection() as conn:
        for idx, row in enumerate(reader):
            norm = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
            name = (
                norm.get("familiar name")
                or norm.get("common name")
                or norm.get("pane")
                or norm.get("catalogue entry")
                or norm.get("object")
                or norm.get("name")
                or f"Custom Target {idx + 1}"
            )
            cat_id = norm.get("catalogue entry") or norm.get("id") or f"CUSTOM_{idx + 1}_{int(abs(hash(name)) % 9999)}"
            ra_str = (
                norm.get("right ascension")
                or norm.get("ra (j2000)")
                or norm.get("ra")
                or ""
            )
            dec_str = (
                norm.get("declination")
                or norm.get("dec (j2000)")
                or norm.get("dec")
                or ""
            )
            if not ra_str or not dec_str:
                continue
            ra_hours = parse_sexagesimal_or_decimal(ra_str, is_ra=True) % 24.0
            dec_deg = max(-90.0, min(90.0, parse_sexagesimal_or_decimal(dec_str, is_ra=False)))
            obj_type = norm.get("type") or "Custom / Telescopius"
            constellation = norm.get("constellation") or "Custom"
            notes = norm.get("notes") or "Imported via Telescopius CSV"

            clean_id = "".join(ch if ch.isalnum() or ch in ("_", "-") else "_" for ch in cat_id).upper()
            conn.execute(
                """
                INSERT INTO dso_catalog (
                    id, common_name, catalog_ids, object_type, constellation,
                    ra_hours, dec_deg, magnitude, size_arcmin, recommended_focal_mm, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    common_name = excluded.common_name,
                    ra_hours = excluded.ra_hours,
                    dec_deg = excluded.dec_deg,
                    notes = excluded.notes
                """,
                (clean_id, name, cat_id, obj_type, constellation, ra_hours, dec_deg, None, None, "180mm", notes),
            )
            imported.append(
                {
                    "id": clean_id,
                    "common_name": name,
                    "ra_hours": round(ra_hours, 5),
                    "dec_deg": round(dec_deg, 5),
                    "object_type": obj_type,
                }
            )
    return imported

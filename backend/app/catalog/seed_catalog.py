"""Curated Offline Deep-Sky (Complete 110 Messier + TPO 180mm Wide-Field Showcase) & Focus Star Catalog."""

from __future__ import annotations

import csv
import io
import math
from typing import Any, Dict, List, Optional

from ..astrometry.coordinates import ObserverLocation, j2000_to_topocentric_altaz
from ..db import DB

# Format:
# (id, common_name, catalog_ids, object_type, constellation, ra_hours, dec_deg, magnitude, size_arcmin, recommended_focal_mm, notes)
# Note: Objects with "TPO 180mm Pick" in recommended_focal_mm are highlighted with a ★ TPO 180 PICK badge in the UI.
CURATED_CATALOG = [
    # ==========================================================================
    # PART 1: NON-MESSIER WIDE-FIELD SHOWCASE TARGETS HAND-PICKED FOR TPO 180mm
    # ==========================================================================
    ("NGC7000", "North America & Pelican Nebulae", "NGC 7000 / IC 5070 / C20", "Emission Nebula", "Cygnus", 20.9880, 44.3300, 4.0, 180.0, "TPO 180mm Pick", "Showcase 180mm target; frames both NGC 7000 and Pelican in one APS-C field"),
    ("IC1396", "Elephant's Trunk Nebula & Garnet Star", "IC 1396 / Sh2-131", "Emission Nebula", "Cepheus", 21.6500, 57.4833, 3.5, 170.0, "TPO 180mm Pick", "Fills the 180mm frame with the full 3-degree ionized H-II shell"),
    ("NGC6992", "Cygnus Loop (Eastern & Western Veil)", "NGC 6992 / NGC 6960 / C33 / C34", "Supernova Remnant", "Cygnus", 20.8550, 30.7100, 7.0, 180.0, "TPO 180mm Pick", "Entire 3-degree Veil Supernova Remnant fits inside the 180mm FOV"),
    ("IC1805", "Heart Nebula (with Fishhead)", "IC 1805 / Sh2-190 / Mel 15", "Emission Nebula", "Cassiopeia", 2.5450, 61.4500, 6.5, 150.0, "TPO 180mm Pick", "Frame both Heart and Soul along the sensor diagonal at 180mm"),
    ("IC1848", "Soul Nebula", "IC 1848 / Sh2-199", "Emission Nebula", "Cassiopeia", 2.8550, 60.4333, 6.5, 150.0, "TPO 180mm Pick", "Rich H-alpha complex adjacent to the Heart Nebula"),
    ("NGC1499", "California Nebula", "NGC 1499 / Sh2-220", "Emission Nebula", "Perseus", 4.0539, 36.4167, 5.0, 160.0, "TPO 180mm Pick", "2.5-degree hydrogen filament tailored for 180mm APS-C"),
    ("IC434", "Horsehead & Flame Nebulae", "IC 434 / B33 / NGC 2024", "Dark / Emission Nebula", "Orion", 5.6833, -2.4583, 6.8, 90.0, "TPO 180mm Pick", "Alnitak + Flame + Horsehead hydrogen ridge; fits with M42 in 180mm frame"),
    ("NGC2237", "Rosette Nebula & Christmas Tree Cluster", "NGC 2237 / C49 / NGC 2264", "Emission Nebula", "Monoceros", 6.5319, 4.9986, 4.8, 120.0, "TPO 180mm Pick", "Bright symmetrical H-II rosette; pairs with Cone/Christmas Tree in wide field"),
    ("IC1318", "Sadr Region & Butterfly Nebula (Crescent)", "IC 1318 / NGC 6888 / Sh2-108", "Emission Nebula", "Cygnus", 20.3700, 40.2500, 6.0, 240.0, "TPO 180mm Pick", "Dense Cygnus rift dust and H-alpha around Gamma Cygni"),
    ("RHO_OPH", "Rho Ophiuchi & Antares Cloud Complex", "IC 4604 / Sh2-9", "Reflection/Dark Nebula", "Ophiuchus", 16.4258, -24.4600, 4.6, 240.0, "TPO 180mm Pick", "Colorful reflection nebulae, dark dust lanes, and M4 around Antares"),
    ("IC2177", "Seagull Nebula", "IC 2177 / Sh2-292", "Emission Nebula", "Monoceros", 7.0850, -10.4500, 7.3, 140.0, "TPO 180mm Pick", "2.3-degree wingspan suited for 180mm APS-C"),
    ("NGC7822", "Question Mark Nebula Complex", "NGC 7822 / C11 / Sh2-171", "Emission Nebula", "Cepheus", 0.0450, 67.2500, 7.9, 150.0, "TPO 180mm Pick", "High-declination circumpolar emission complex in Cepheus"),
    ("IC405", "Flaming Star & Tadpoles Nebulae", "IC 405 / IC 410 / C31", "Emission/Reflection Nebula", "Auriga", 5.3100, 33.8500, 6.0, 160.0, "TPO 180mm Pick", "Frames both Flaming Star (IC 405) and Tadpoles (IC 410) in one 180mm field"),
    ("SH2_129", "Flying Bat & Squid Nebulae", "Sh2-129 / Ou4", "Emission Nebula", "Cepheus", 21.1967, 59.9667, 8.5, 140.0, "TPO 180mm Pick", "Wide Cepheus H-II shell surrounding the giant Squid bipolar nebula"),
    ("LDN1235", "Shark & Dark Wolf Dust Nebulae", "LDN 1235 / VdB 149", "Dark Nebula", "Cepheus", 22.1250, 73.2500, 9.0, 150.0, "TPO 180mm Pick", "Broadband dark-sky IFN molecular dust target in Cepheus"),
    ("NGC281", "Pacman Nebula & Mirfak Field", "NGC 281 / IC 11 / Sh2-184", "Emission Nebula", "Cassiopeia", 0.8808, 56.6253, 7.4, 35.0, "TPO 180mm Pick", "High-contrast H-II cloud with Bok globules"),
    ("NGC7635", "Bubble Nebula, Lobster Claw & M52", "NGC 7635 / Sh2-157 / M52", "Emission + Open Cluster", "Cassiopeia", 23.3450, 61.1000, 7.0, 120.0, "TPO 180mm Pick", "Three major Cassiopeia objects in one 180mm frame"),
    ("MARKARIAN", "Markarian's Galaxy Chain (Virgo Core)", "M84 / M86 / NGC 4438", "Galaxy Cluster", "Virgo", 12.4500, 13.0500, 8.4, 150.0, "TPO 180mm Pick", "Over 30 galaxies visible simultaneously in a single 180mm frame"),
    ("NGC869", "Double Cluster in Perseus", "NGC 869 / NGC 884 / C14", "Open Cluster", "Perseus", 2.3333, 57.1400, 3.7, 60.0, "TPO 180mm Pick", "Rich twin star clusters; ideal wide-field cluster and focus target"),
    ("IC2118", "Witch Head Nebula", "IC 2118 / NGC 1909", "Reflection Nebula", "Eridanus", 5.1150, -7.2100, 9.0, 180.0, "TPO 180mm Pick", "3-degree blue reflection nebula illuminated by nearby Rigel"),
    ("SH2_264", "Lambda Orionis Ring (Angelfish Nebula)", "Sh2-264 / Cr 69", "Emission Nebula", "Orion", 5.5850, 9.9300, 5.0, 300.0, "TPO 180mm Pick", "Giant ionized H-alpha ring filling the entire 180mm FOV"),
    ("IC5146", "Cocoon Nebula & Barnard 168 Dark Tail", "IC 5146 / B168 / C19", "Emission + Dark Nebula", "Cygnus", 21.8911, 47.2667, 7.2, 120.0, "TPO 180mm Pick", "Glowing Cocoon Nebula at the end of the 2-degree B168 dark dust lane"),

    # ==========================================================================
    # PART 2: COMPLETE 110-OBJECT MESSIER CATALOG (M1 – M110)
    # ==========================================================================
    ("M1", "M1 — Crab Nebula", "M1 / NGC 1952", "Supernova Remnant", "Taurus", 5.5755, 22.0145, 8.4, 6.0, "400-1000mm", "Compact supernova remnant in Taurus"),
    ("M2", "M2 — Globular Cluster in Aquarius", "M2 / NGC 7089", "Globular Cluster", "Aquarius", 21.5575, -0.8233, 6.5, 16.0, "300-800mm", "Rich, compact globular cluster"),
    ("M3", "M3 — Globular Cluster in Canes Venatici", "M3 / NGC 5272", "Globular Cluster", "Canes Venatici", 13.7032, 28.3772, 6.2, 18.0, "300-800mm", "Half a million stars in Canes Venatici"),
    ("M4", "M4 — Spider Globular Cluster (Rho Ophiuchi)", "M4 / NGC 6121", "Globular Cluster", "Scorpius", 16.3931, -26.5258, 5.6, 36.0, "TPO 180mm Pick", "Nearest globular cluster; frames beside Antares & Rho Ophiuchi dust at 180mm"),
    ("M5", "M5 — Rose Globular Cluster", "M5 / NGC 5904", "Globular Cluster", "Serpens", 15.3092, 2.0811, 5.6, 23.0, "300-800mm", "One of the largest northern globular clusters"),
    ("M6", "M6 — Butterfly Cluster", "M6 / NGC 6405", "Open Cluster", "Scorpius", 17.6689, -32.2533, 4.2, 25.0, "TPO 180mm Pick", "Pairs with M7 Ptolemy Cluster in a rich Scorpius Milky Way field at 180mm"),
    ("M7", "M7 — Ptolemy Cluster", "M7 / NGC 6475", "Open Cluster", "Scorpius", 17.8975, -34.7933, 3.3, 80.0, "TPO 180mm Pick", "Huge 1.3-degree open cluster against dense Scorpius star clouds"),
    ("M8", "M8 — Lagoon Nebula (& Trifid M20 Field)", "M8 / NGC 6523", "Emission Nebula", "Sagittarius", 18.0631, -24.3867, 4.6, 90.0, "TPO 180mm Pick", "Frames M8 Lagoon, M20 Trifid, and M21 together in one 180mm shot"),
    ("M9", "M9 — Globular Cluster near Barnard 64", "M9 / NGC 6333", "Globular Cluster", "Ophiuchus", 17.3199, -18.5161, 7.7, 12.0, "300-800mm", "Flanked by the dark nebula Barnard 64"),
    ("M10", "M10 — Globular Cluster in Ophiuchus", "M10 / NGC 6254", "Globular Cluster", "Ophiuchus", 16.9525, -4.1003, 6.6, 20.0, "300-800mm", "Can be framed alongside M12 in a wide 180mm field"),
    ("M11", "M11 — Wild Duck Cluster (& Scutum Star Cloud)", "M11 / NGC 6705", "Open Cluster", "Scutum", 18.8514, -6.2700, 5.8, 14.0, "TPO 180mm Pick", "Embedded in the dramatic Scutum Star Cloud and Barnard dark lanes at 180mm"),
    ("M12", "M12 — Gumball Globular Cluster", "M12 / NGC 6218", "Globular Cluster", "Ophiuchus", 16.7872, -1.9486, 6.7, 16.0, "300-800mm", "3.4 degrees from M10"),
    ("M13", "M13 — Great Hercules Globular Cluster", "M13 / NGC 6205", "Globular Cluster", "Hercules", 16.6949, 36.4614, 5.8, 20.0, "TPO 180mm Pick", "Showpiece northern globular cluster with nearby galaxy NGC 6207"),
    ("M14", "M14 — Globular Cluster in Ophiuchus", "M14 / NGC 6402", "Globular Cluster", "Ophiuchus", 17.6267, -3.2458, 7.6, 11.0, "400-800mm", "Luminous Ophiuchus globular cluster"),
    ("M15", "M15 — Great Pegasus Cluster (with IFN)", "M15 / NGC 7078", "Globular Cluster", "Pegasus", 21.4995, 12.1670, 6.2, 18.0, "300-800mm", "Dense core globular surrounded by faint Pegasus IFN dust"),
    ("M16", "M16 — Eagle Nebula (Pillars of Creation)", "M16 / NGC 6611", "Emission Nebula", "Serpens", 18.3133, -13.7917, 6.0, 35.0, "TPO 180mm Pick", "Captures both M16 Eagle and M17 Omega Nebulae together in one 180mm frame"),
    ("M17", "M17 — Omega / Swan Nebula", "M17 / NGC 6618", "Emission Nebula", "Sagittarius", 18.3464, -16.1717, 6.0, 45.0, "TPO 180mm Pick", "Bright H-II region; pairs with M16 and M18 in 180mm FOV"),
    ("M18", "M18 — Black Swan Open Cluster", "M18 / NGC 6613", "Open Cluster", "Sagittarius", 18.3328, -17.1017, 7.5, 9.0, "TPO 180mm Pick", "Sits right between M17 and M24 in the 180mm field"),
    ("M19", "M19 — Oblate Globular Cluster", "M19 / NGC 6273", "Globular Cluster", "Ophiuchus", 17.0439, -26.2678, 6.8, 17.0, "300-800mm", "Most oblate known globular cluster"),
    ("M20", "M20 — Trifid Nebula", "M20 / NGC 6514", "Emission/Reflection Nebula", "Sagittarius", 18.0450, -23.0300, 6.3, 28.0, "TPO 180mm Pick", "Red emission and blue reflection lobes; frames with M8 Lagoon at 180mm"),
    ("M21", "M21 — Webb's Cross Open Cluster", "M21 / NGC 6531", "Open Cluster", "Sagittarius", 18.0703, -22.4900, 5.9, 13.0, "TPO 180mm Pick", "Adjacent to M20 Trifid Nebula"),
    ("M22", "M22 — Great Sagittarius Cluster", "M22 / NGC 6656", "Globular Cluster", "Sagittarius", 18.6067, -23.9047, 5.1, 32.0, "TPO 180mm Pick", "One of the brightest and largest globular clusters in the sky"),
    ("M23", "M23 — Open Cluster in Sagittarius", "M23 / NGC 6494", "Open Cluster", "Sagittarius", 17.9483, -18.9850, 5.5, 27.0, "TPO 180mm Pick", "Wide, rich star cluster bordered by dark nebulae"),
    ("M24", "M24 — Sagittarius Star Cloud (Delle Caustiche)", "M24 / IC 4715", "Milky Way Star Cloud", "Sagittarius", 18.2800, -18.5500, 4.6, 90.0, "TPO 180mm Pick", "Massive 1.5-degree Milky Way window framed by Barnard 92 & 93 dark nebulae"),
    ("M25", "M25 — Open Cluster in Sagittarius", "M25 / IC 4725", "Open Cluster", "Sagittarius", 18.5292, -19.1167, 4.6, 32.0, "TPO 180mm Pick", "Wide half-degree cluster near M24"),
    ("M26", "M26 — Open Cluster in Scutum", "M26 / NGC 6694", "Open Cluster", "Scutum", 18.7550, -9.3833, 8.0, 15.0, "300-600mm", "Located in the southern Scutum Star Cloud"),
    ("M27", "M27 — Dumbbell Nebula", "M27 / NGC 6853", "Planetary Nebula", "Vulpecula", 19.9934, 22.7211, 7.4, 8.0, "300-800mm", "Brightest planetary nebula; teal/red bowtie visible in 180mm starfield"),
    ("M28", "M28 — Globular Cluster in Sagittarius", "M28 / NGC 6626", "Globular Cluster", "Sagittarius", 18.4097, -24.8697, 6.8, 11.0, "300-800mm", "Near Lambda Sagittarii and M22"),
    ("M29", "M29 — Cooling Tower Cluster (Sadr Field)", "M29 / NGC 6913", "Open Cluster", "Cygnus", 20.3989, 38.5233, 7.1, 7.0, "TPO 180mm Pick", "Embedded inside the glowing H-alpha clouds of the Sadr Region at 180mm"),
    ("M30", "M30 — Jellyfish Globular Cluster", "M30 / NGC 7099", "Globular Cluster", "Capricornus", 21.6728, -23.1797, 7.2, 12.0, "300-800mm", "Core-collapsed globular cluster in Capricornus"),
    ("M31", "M31 — Andromeda Galaxy (with M32 & M110)", "M31 / NGC 224", "Spiral Galaxy", "Andromeda", 0.7123, 41.2692, 3.4, 190.0, "TPO 180mm Pick", "Signature 180mm target; outer dust disks span over 3 degrees"),
    ("M32", "M32 — Andromeda Companion Elliptical", "M32 / NGC 221", "Elliptical Galaxy", "Andromeda", 0.7117, 40.8653, 8.1, 8.0, "TPO 180mm Pick", "Captured automatically alongside M31"),
    ("M33", "M33 — Triangulum Galaxy", "M33 / NGC 598 / C25", "Spiral Galaxy", "Triangulum", 1.5641, 30.6602, 5.7, 70.0, "TPO 180mm Pick", "Over 1 degree across; face-on spiral rich in pink H-II knots"),
    ("M34", "M34 — Spiral Open Cluster", "M34 / NGC 1039", "Open Cluster", "Perseus", 2.7014, 42.7617, 5.5, 35.0, "TPO 180mm Pick", "Bright half-degree open cluster in Perseus"),
    ("M35", "M35 — Shoe-Buckle Cluster (& NGC 2158)", "M35 / NGC 2168", "Open Cluster", "Gemini", 6.1483, 24.3333, 5.3, 28.0, "TPO 180mm Pick", "Frames M35, golden cluster NGC 2158, and Jellyfish Nebula IC 443 at 180mm"),
    ("M36", "M36 — Pinwheel Cluster in Auriga", "M36 / NGC 1960", "Open Cluster", "Auriga", 5.6033, 34.1400, 6.3, 12.0, "TPO 180mm Pick", "Forms the Auriga cluster chain with M37, M38, and IC 410 at 180mm"),
    ("M37", "M37 — Salt-and-Pepper Cluster", "M37 / NGC 2099", "Open Cluster", "Auriga", 5.8725, 32.5533, 6.2, 24.0, "TPO 180mm Pick", "Richest open cluster in Auriga"),
    ("M38", "M38 — Starfish Cluster in Auriga", "M38 / NGC 1912", "Open Cluster", "Auriga", 5.4781, 35.8550, 7.4, 21.0, "TPO 180mm Pick", "Frames alongside Flaming Star (IC 405) and M36 at 180mm"),
    ("M39", "M39 — Open Cluster in Cygnus", "M39 / NGC 7092", "Open Cluster", "Cygnus", 21.5297, 48.4333, 4.6, 32.0, "TPO 180mm Pick", "Loose, bright cluster near the Cocoon Nebula and B168 dark lane"),
    ("M40", "M40 — Winnecke 4 Double Star (& NGC 4290)", "M40 / WNC 4", "Double Star + Galaxies", "Ursa Major", 12.3706, 58.0828, 8.4, 1.0, "400-1000mm", "Optical double star flanked by barred spiral NGC 4290"),
    ("M41", "M41 — Little Beehive Cluster (near Sirius)", "M41 / NGC 2287", "Open Cluster", "Canis Major", 6.7667, -20.7567, 4.5, 38.0, "TPO 180mm Pick", "4 degrees south of Sirius; rich in red/orange giants"),
    ("M42", "M42 — Great Orion Nebula (& Running Man)", "M42 / NGC 1976", "Emission/Reflection Nebula", "Orion", 5.5881, -5.3911, 4.0, 85.0, "TPO 180mm Pick", "Point between M42 and Alnitak to frame Orion + Horsehead together at 180mm"),
    ("M43", "M43 — De Mairan's Nebula", "M43 / NGC 1982", "Emission Nebula", "Orion", 5.5928, -5.2667, 9.0, 20.0, "TPO 180mm Pick", "Part of the M42 Orion Nebula complex"),
    ("M44", "M44 — Beehive Cluster (Praesepe)", "M44 / NGC 2632", "Open Cluster", "Cancer", 8.6700, 19.6700, 3.7, 95.0, "TPO 180mm Pick", "Sprawling 1.5-degree cluster ideal for 180mm wide field"),
    ("M45", "M45 — Pleiades & Merope IFN Dust Complex", "M45 / Mel 22", "Open Cluster + Reflection", "Taurus", 3.7900, 24.1167, 1.6, 110.0, "TPO 180mm Pick", "Showcase 180mm target; captures surrounding molecular cloud dust lanes"),
    ("M46", "M46 — Open Cluster (with NGC 2438 Planetary)", "M46 / NGC 2437", "Open Cluster", "Puppis", 7.6967, -14.8100, 6.1, 27.0, "TPO 180mm Pick", "Pairs with M47 in a single stunning 180mm twin-cluster frame"),
    ("M47", "M47 — Open Cluster in Puppis", "M47 / NGC 2422", "Open Cluster", "Puppis", 7.6097, -14.4833, 4.2, 30.0, "TPO 180mm Pick", "1.3 degrees from M46; great twin cluster composition at 180mm"),
    ("M48", "M48 — Open Cluster in Hydra", "M48 / NGC 2548", "Open Cluster", "Hydra", 8.2286, -5.7500, 5.8, 54.0, "TPO 180mm Pick", "Large 54-arcminute open cluster"),
    ("M49", "M49 — Giant Elliptical in Virgo", "M49 / NGC 4472", "Elliptical Galaxy", "Virgo", 12.4964, 8.0006, 8.4, 10.0, "300-800mm", "Brightest galaxy in the southern Virgo Cluster"),
    ("M50", "M50 — Heart-Shaped Open Cluster", "M50 / NGC 2323", "Open Cluster", "Monoceros", 7.0465, -8.3378, 5.9, 16.0, "TPO 180mm Pick", "Near the Seagull Nebula in Monoceros"),
    ("M51", "M51 — Whirlpool Galaxy", "M51 / NGC 5194", "Spiral Galaxy", "Canes Venatici", 13.4979, 47.1952, 8.4, 11.0, "TPO 180mm Pick", "Classic interacting spiral pair with tidal bridge"),
    ("M52", "M52 — Salt-and-Pepper Cluster (& Bubble Nebula)", "M52 / NGC 7654", "Open Cluster", "Cassiopeia", 23.4067, 61.5933, 6.9, 13.0, "TPO 180mm Pick", "35 arcminutes from the Bubble Nebula (NGC 7635)"),
    ("M53", "M53 — Globular Cluster in Coma Berenices", "M53 / NGC 5024", "Globular Cluster", "Coma Berenices", 13.2153, 18.1683, 7.6, 13.0, "300-800mm", "1 degree from the loose globular NGC 5053"),
    ("M54", "M54 — Extragalactic Globular Cluster", "M54 / NGC 6715", "Globular Cluster", "Sagittarius", 18.9176, -30.4799, 7.6, 12.0, "400-800mm", "Belongs to the Sagittarius Dwarf Elliptical Galaxy"),
    ("M55", "M55 — Summer Rose Star Globular", "M55 / NGC 6809", "Globular Cluster", "Sagittarius", 19.6666, -30.9647, 6.3, 19.0, "300-600mm", "Large, loose southern globular cluster"),
    ("M56", "M56 — Globular Cluster in Lyra", "M56 / NGC 6779", "Globular Cluster", "Lyra", 19.2765, 30.1833, 8.3, 9.0, "400-800mm", "Halfway between Albireo and Sulafat"),
    ("M57", "M57 — Ring Nebula", "M57 / NGC 6720", "Planetary Nebula", "Lyra", 18.8931, 33.0292, 8.8, 1.5, "600-1500mm", "Small planetary ring; appears as a tiny turquoise disk at 180mm"),
    ("M58", "M58 — Barred Spiral in Virgo", "M58 / NGC 4579", "Spiral Galaxy", "Virgo", 12.6288, 11.8181, 9.7, 6.0, "300-800mm", "Part of the wide Virgo Cluster field"),
    ("M59", "M59 — Elliptical Galaxy in Virgo", "M59 / NGC 4621", "Elliptical Galaxy", "Virgo", 12.7006, 11.6469, 9.6, 5.0, "300-800mm", "Forms an eastern Virgo group with M60 and M58"),
    ("M60", "M60 — Elliptical Galaxy (& NGC 4647 Pair)", "M60 / NGC 4649", "Elliptical Galaxy", "Virgo", 12.7278, 11.5525, 8.8, 7.0, "300-800mm", "Interacting visual pair with spiral NGC 4647"),
    ("M61", "M61 — Swelling Spiral in Virgo", "M61 / NGC 4303", "Spiral Galaxy", "Virgo", 12.3653, 4.4736, 9.7, 6.5, "400-800mm", "Starburst face-on spiral galaxy"),
    ("M62", "M62 — Flickering Globular Cluster", "M62 / NGC 6266", "Globular Cluster", "Ophiuchus", 17.0202, -30.1125, 6.5, 15.0, "300-800mm", "Near the galactic center border"),
    ("M63", "M63 — Sunflower Galaxy", "M63 / NGC 5055", "Spiral Galaxy", "Canes Venatici", 13.2637, 42.0294, 8.6, 12.6, "300-800mm", "Flocculent spiral galaxy in Canes Venatici"),
    ("M64", "M64 — Black Eye Galaxy", "M64 / NGC 4826", "Spiral Galaxy", "Coma Berenices", 12.9455, 21.6828, 8.5, 10.7, "300-800mm", "Prominent dark dust band across its bright nucleus"),
    ("M65", "M65 — Leo Triplet Spiral", "M65 / NGC 3623", "Spiral Galaxy", "Leo", 11.3155, 13.0922, 9.3, 9.8, "TPO 180mm Pick", "Frames the entire Leo Triplet (M65, M66, NGC 3628) together at 180mm"),
    ("M66", "M66 — Leo Triplet Asymmetric Spiral", "M66 / NGC 3627", "Spiral Galaxy", "Leo", 11.3375, 12.9917, 8.9, 9.1, "TPO 180mm Pick", "Centerpiece of the Leo Triplet galaxy group"),
    ("M67", "M67 — King Cobra / Golden Eye Cluster", "M67 / NGC 2682", "Open Cluster", "Cancer", 8.8550, 11.8000, 6.1, 30.0, "TPO 180mm Pick", "One of the oldest known open clusters"),
    ("M68", "M68 — Globular Cluster in Hydra", "M68 / NGC 4590", "Globular Cluster", "Hydra", 12.6578, -26.7442, 7.8, 11.0, "300-800mm", "Southern Hydra globular south of Corvus"),
    ("M69", "M69 — Globular Cluster in Sagittarius", "M69 / NGC 6637", "Globular Cluster", "Sagittarius", 18.5231, -32.3481, 7.6, 10.0, "400-800mm", "Metal-rich Sagittarius teapot globular"),
    ("M70", "M70 — Globular Cluster in Sagittarius", "M70 / NGC 6681", "Globular Cluster", "Sagittarius", 18.7202, -32.2922, 7.9, 8.0, "400-800mm", "2.5 degrees from M69"),
    ("M71", "M71 — Angelfish Globular Cluster", "M71 / NGC 6838", "Globular Cluster", "Sagitta", 19.8962, 18.7792, 8.2, 7.2, "300-800mm", "Loose globular in a dense Milky Way starfield"),
    ("M72", "M72 — Globular Cluster in Aquarius", "M72 / NGC 6981", "Globular Cluster", "Aquarius", 20.8910, -12.5372, 9.3, 6.6, "400-800mm", "Remote halo globular cluster"),
    ("M73", "M73 — Aquarius Y-Asterism", "M73 / NGC 6994", "Asterism", "Aquarius", 20.9831, -12.6333, 9.0, 2.8, "400-800mm", "1.5 degrees east of M72 and Saturn Nebula"),
    ("M74", "M74 — Phantom Galaxy", "M74 / NGC 628", "Spiral Galaxy", "Pisces", 1.6116, 15.7836, 9.4, 10.5, "300-800mm", "Grand-design face-on spiral galaxy"),
    ("M75", "M75 — Globular Cluster in Sagittarius", "M75 / NGC 6864", "Globular Cluster", "Sagittarius", 20.1013, -21.9211, 8.5, 6.8, "400-800mm", "Highly concentrated class I globular"),
    ("M76", "M76 — Little Dumbbell Nebula", "M76 / NGC 650 / NGC 651", "Planetary Nebula", "Perseus", 1.7055, 51.5753, 10.1, 2.7, "500-1200mm", "Bipolar planetary nebula in Perseus"),
    ("M77", "M77 — Cetus A Seyfert Spiral", "M77 / NGC 1068", "Spiral Galaxy", "Cetus", 2.7113, -0.0133, 8.9, 7.1, "300-800mm", "Pairs with NGC 1055 in a wide field"),
    ("M78", "M78 — Casper the Friendly Ghost (& Barnard's Loop)", "M78 / NGC 2068", "Reflection Nebula", "Orion", 5.7794, 0.0500, 8.3, 8.0, "TPO 180mm Pick", "Embedded in dark dust and the northern arc of Barnard's Loop at 180mm"),
    ("M79", "M79 — Winter Globular Cluster in Lepus", "M79 / NGC 1904", "Globular Cluster", "Lepus", 5.4029, -24.5242, 7.7, 9.6, "300-800mm", "Rare winter-sky globular cluster below Orion"),
    ("M80", "M80 — Globular Cluster in Scorpius", "M80 / NGC 6093", "Globular Cluster", "Scorpius", 16.2840, -22.9761, 7.3, 10.0, "TPO 180mm Pick", "Bordering the dark dust streams of the Rho Ophiuchi complex"),
    ("M81", "M81 — Bode's Galaxy (& M82 + IFN)", "M81 / NGC 3031", "Spiral Galaxy", "Ursa Major", 9.9259, 69.0653, 6.9, 27.0, "TPO 180mm Pick", "Frames M81, M82, NGC 3077, and surrounding Integrated Flux Nebula at 180mm"),
    ("M82", "M82 — Cigar Starburst Galaxy", "M82 / NGC 3034", "Starburst Galaxy", "Ursa Major", 9.9312, 69.6797, 8.4, 11.2, "TPO 180mm Pick", "37 arcminutes from M81; glowing H-alpha superwind"),
    ("M83", "M83 — Southern Pinwheel Galaxy", "M83 / NGC 5236", "Spiral Galaxy", "Hydra", 13.6169, -29.8658, 7.5, 12.9, "200-600mm", "Bright, ruby-knotted barred spiral in Hydra"),
    ("M84", "M84 — Markarian's Chain Lenticular", "M84 / NGC 4374", "Lenticular Galaxy", "Virgo", 12.4177, 12.8869, 9.1, 6.5, "TPO 180mm Pick", "Western anchor of Markarian's Galaxy Chain"),
    ("M85", "M85 — Lenticular Galaxy (& NGC 4394 Pair)", "M85 / NGC 4382", "Lenticular Galaxy", "Coma Berenices", 12.4233, 18.1911, 9.1, 7.1, "300-800mm", "Northernmost Virgo Cluster Messier galaxy"),
    ("M86", "M86 — Markarian's Chain Giant Elliptical", "M86 / NGC 4406", "Elliptical Galaxy", "Virgo", 12.4366, 12.9461, 8.9, 8.9, "TPO 180mm Pick", "Heart of Markarian's Chain alongside the Eyes Galaxies"),
    ("M87", "M87 — Virgo A Supergiant Elliptical", "M87 / NGC 4486", "Elliptical Galaxy", "Virgo", 12.5137, 12.3911, 8.6, 8.3, "TPO 180mm Pick", "Included in wide Markarian's Chain / Virgo Core 180mm framing"),
    ("M88", "M88 — Multi-Arm Virgo Spiral", "M88 / NGC 4501", "Spiral Galaxy", "Coma Berenices", 12.5331, 14.4203, 9.6, 6.9, "300-800mm", "Symmetrical spiral near Markarian's Chain"),
    ("M89", "M89 — Spherical Elliptical in Virgo", "M89 / NGC 4552", "Elliptical Galaxy", "Virgo", 12.5944, 12.5564, 9.8, 5.1, "300-800mm", "Part of the extended Virgo Cluster core"),
    ("M90", "M90 — Virgo Cluster Spiral", "M90 / NGC 4569", "Spiral Galaxy", "Virgo", 12.6138, 13.1628, 9.5, 9.5, "300-800mm", "Large blue-shifted spiral in Virgo"),
    ("M91", "M91 — Barred Spiral in Coma Berenices", "M91 / NGC 4548", "Spiral Galaxy", "Coma Berenices", 12.5914, 14.4964, 10.2, 5.4, "400-800mm", "Distinct theta-shaped barred spiral"),
    ("M92", "M92 — Second Hercules Globular Cluster", "M92 / NGC 6341", "Globular Cluster", "Hercules", 17.2854, 43.1358, 6.4, 14.0, "300-800mm", "Bright, ancient globular cluster north of M13"),
    ("M93", "M93 — Critter Open Cluster", "M93 / NGC 2447", "Open Cluster", "Puppis", 7.7433, -23.8567, 6.2, 22.0, "TPO 180mm Pick", "Arrowhead-shaped open cluster in Puppis Milky Way"),
    ("M94", "M94 — Cat's Eye / Croc's Eye Galaxy", "M94 / NGC 4736", "Spiral Galaxy", "Canes Venatici", 12.8481, 41.1203, 8.2, 11.2, "300-800mm", "Double-ringed starburst spiral galaxy"),
    ("M95", "M95 — Leo I Group Barred Spiral", "M95 / NGC 3351", "Spiral Galaxy", "Leo", 10.7327, 11.7036, 9.7, 7.4, "TPO 180mm Pick", "Frames together with M96 and M105 in a single 180mm galaxy group shot"),
    ("M96", "M96 — Leo I Group Spiral", "M96 / NGC 3368", "Spiral Galaxy", "Leo", 10.7794, 11.8200, 9.2, 7.6, "TPO 180mm Pick", "Dominant member of the M96/M95/M105 Leo I group"),
    ("M97", "M97 — Owl Nebula (& M108 Surfboard Pair)", "M97 / NGC 3587", "Planetary Nebula", "Ursa Major", 11.2466, 55.0192, 9.9, 3.4, "300-800mm", "48 arcminutes from edge-on spiral galaxy M108"),
    ("M98", "M98 — Edge-On Virgo Spiral", "M98 / NGC 4192", "Spiral Galaxy", "Coma Berenices", 12.2299, 14.9003, 10.1, 9.8, "300-800mm", "Near 6 Comae Berenices"),
    ("M99", "M99 — Coma Pinwheel Galaxy", "M99 / NGC 4254", "Spiral Galaxy", "Coma Berenices", 12.3138, 14.4164, 9.9, 5.4, "300-800mm", "Bright three-armed spiral in northern Virgo cluster"),
    ("M100", "M100 — Mirror / Blowdryer Galaxy", "M100 / NGC 4321", "Spiral Galaxy", "Coma Berenices", 12.3819, 15.8222, 9.3, 7.4, "300-800mm", "Grand-design spiral surrounded by dwarf companions"),
    ("M101", "M101 — Pinwheel Galaxy", "M101 / NGC 5457", "Spiral Galaxy", "Ursa Major", 14.0535, 54.3489, 7.9, 29.0, "TPO 180mm Pick", "Large half-degree face-on spiral surrounded by companion galaxies"),
    ("M102", "M102 — Spindle Galaxy (NGC 5866)", "M102 / NGC 5866", "Lenticular Galaxy", "Draco", 15.1082, 55.7633, 9.9, 4.7, "400-800mm", "Edge-on lenticular galaxy with crisp dust lane"),
    ("M103", "M103 — Fan Open Cluster in Cassiopeia", "M103 / NGC 581", "Open Cluster", "Cassiopeia", 1.5561, 60.6583, 7.4, 6.0, "TPO 180mm Pick", "Frames with NGC 663 and NGC 654 in a rich Cassiopeia field at 180mm"),
    ("M104", "M104 — Sombrero Galaxy", "M104 / NGC 4594", "Spiral Galaxy", "Virgo", 12.6665, -11.6231, 8.0, 9.0, "300-800mm", "Iconic equator-on dust lane and luminous halo"),
    ("M105", "M105 — Leo I Elliptical (& NGC 3384 Trio)", "M105 / NGC 3379", "Elliptical Galaxy", "Leo", 10.7971, 12.5817, 9.3, 5.4, "TPO 180mm Pick", "Forms a tight galaxy trio with NGC 3384 and NGC 3389 near M95/M96"),
    ("M106", "M106 — Active Spiral (& NGC 4217 Pair)", "M106 / NGC 4258", "Spiral Galaxy", "Canes Venatici", 12.3160, 47.3039, 8.4, 18.6, "TPO 180mm Pick", "Large 19-arcminute spiral framed with edge-on NGC 4217 at 180mm"),
    ("M107", "M107 — Crucifix Globular Cluster", "M107 / NGC 6171", "Globular Cluster", "Ophiuchus", 16.5422, -13.0536, 7.9, 13.0, "300-800mm", "South of Zeta Ophiuchi"),
    ("M108", "M108 — Surfboard Galaxy", "M108 / NGC 3556", "Spiral Galaxy", "Ursa Major", 11.1919, 55.6742, 10.0, 8.7, "300-800mm", "Mottled edge-on spiral paired with M97 Owl Nebula"),
    ("M109", "M109 — Vacuum Cleaner Barred Spiral", "M109 / NGC 3992", "Spiral Galaxy", "Ursa Major", 11.9600, 53.3744, 9.8, 7.6, "300-800mm", "40 arcminutes southeast of Phecda (Gamma Ursae Majoris)"),
    ("M110", "M110 — Andromeda Outer Satellite Galaxy", "M110 / NGC 205", "Elliptical Galaxy", "Andromeda", 0.6728, 41.6853, 8.5, 17.0, "TPO 180mm Pick", "Captured automatically alongside M31 and M32 in the 180mm field"),

    # ==========================================================================
    # PART 3: BRIGHT FOCUS & ALIGNMENT CALIBRATION STARS
    # ==========================================================================
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
    """Populate or upgrade SQLite dso_catalog table with all curated & Messier objects."""
    with DB.connection() as conn:
        conn.executemany(
            """
            INSERT OR REPLACE INTO dso_catalog (
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
    tpo180_only: bool = False,
) -> List[Dict[str, Any]]:
    """Query DSO catalog and enrich with live Topocentric Altitude, Azimuth, and TPO 180mm Pick badge."""
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
        rec_focal = str(item.get("recommended_focal_mm") or "")
        is_tpo180_pick = "TPO 180" in rec_focal or "135-200" in rec_focal
        if tpo180_only and not is_tpo180_pick:
            continue

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
        item["is_tpo180_pick"] = is_tpo180_pick
        if alt_deg > 5.0:
            item["airmass"] = round(1.0 / math.sin(math.radians(max(5.0, alt_deg))), 2)
        else:
            item["airmass"] = None

        otype = str(item.get("object_type") or "")
        mag = float(item["magnitude"]) if item.get("magnitude") is not None else 8.0
        if "Emission" in otype or "Supernova" in otype or "Planetary" in otype:
            item["bortle8_badge"] = "Bortle 8: Dual-Band / Hα★"
        elif "Dark" in otype or "Reflection" in otype:
            item["bortle8_badge"] = "Bortle 8: Broadband (M45/M42)" if mag <= 5.0 else "Dark Sky Preferred"
        elif "Cluster" in otype or "Star" in otype or mag <= 7.0:
            item["bortle8_badge"] = "Bortle 8: Great (Short Subs)"
        else:
            item["bortle8_badge"] = "Bortle 8: Moderate (High Alt)"

        results.append(item)

    # Sort: TPO 180mm Picks first (when not searching), then DSOs before Focus Stars, then highest altitude
    results.sort(
        key=lambda r: (
            r["object_type"] == "Focus Star",
            not r["is_tpo180_pick"],
            -r["current_alt_deg"],
        )
    )
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
                (clean_id, name, cat_id, obj_type, constellation, ra_hours, dec_deg, None, None, "TPO 180mm Pick", notes),
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

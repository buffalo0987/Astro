/**
 * AstroPi Production Static PWA Bundle (Zero-Dependency ES2020 Client)
 * Synchronizes in real time over WebSocket (/ws) across all connected devices.
 */
(() => {
  const DEFAULT_TARGETS = [{"id":"NGC7000","common_name":"North America & Pelican Nebulae","catalog_ids":"NGC 7000 / IC 5070 / C20","object_type":"Emission Nebula","constellation":"Cygnus","ra_hours":20.988,"dec_deg":44.33,"magnitude":4.0,"size_arcmin":180.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Showcase 180mm target; frames both NGC 7000 and Pelican in one APS-C field","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"IC1396","common_name":"Elephant's Trunk Nebula & Garnet Star","catalog_ids":"IC 1396 / Sh2-131","object_type":"Emission Nebula","constellation":"Cepheus","ra_hours":21.65,"dec_deg":57.4833,"magnitude":3.5,"size_arcmin":170.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Fills the 180mm frame with the full 3-degree ionized H-II shell","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"NGC6992","common_name":"Cygnus Loop (Eastern & Western Veil)","catalog_ids":"NGC 6992 / NGC 6960 / C33 / C34","object_type":"Supernova Remnant","constellation":"Cygnus","ra_hours":20.855,"dec_deg":30.71,"magnitude":7.0,"size_arcmin":180.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Entire 3-degree Veil Supernova Remnant fits inside the 180mm FOV","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"IC1805","common_name":"Heart Nebula (with Fishhead)","catalog_ids":"IC 1805 / Sh2-190 / Mel 15","object_type":"Emission Nebula","constellation":"Cassiopeia","ra_hours":2.545,"dec_deg":61.45,"magnitude":6.5,"size_arcmin":150.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Frame both Heart and Soul along the sensor diagonal at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"IC1848","common_name":"Soul Nebula","catalog_ids":"IC 1848 / Sh2-199","object_type":"Emission Nebula","constellation":"Cassiopeia","ra_hours":2.855,"dec_deg":60.4333,"magnitude":6.5,"size_arcmin":150.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Rich H-alpha complex adjacent to the Heart Nebula","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"NGC1499","common_name":"California Nebula","catalog_ids":"NGC 1499 / Sh2-220","object_type":"Emission Nebula","constellation":"Perseus","ra_hours":4.0539,"dec_deg":36.4167,"magnitude":5.0,"size_arcmin":160.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"2.5-degree hydrogen filament tailored for 180mm APS-C","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"IC434","common_name":"Horsehead & Flame Nebulae","catalog_ids":"IC 434 / B33 / NGC 2024","object_type":"Dark / Emission Nebula","constellation":"Orion","ra_hours":5.6833,"dec_deg":-2.4583,"magnitude":6.8,"size_arcmin":90.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Alnitak + Flame + Horsehead hydrogen ridge; fits with M42 in 180mm frame","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"NGC2237","common_name":"Rosette Nebula & Christmas Tree Cluster","catalog_ids":"NGC 2237 / C49 / NGC 2264","object_type":"Emission Nebula","constellation":"Monoceros","ra_hours":6.5319,"dec_deg":4.9986,"magnitude":4.8,"size_arcmin":120.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Bright symmetrical H-II rosette; pairs with Cone/Christmas Tree in wide field","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"IC1318","common_name":"Sadr Region & Butterfly Nebula (Crescent)","catalog_ids":"IC 1318 / NGC 6888 / Sh2-108","object_type":"Emission Nebula","constellation":"Cygnus","ra_hours":20.37,"dec_deg":40.25,"magnitude":6.0,"size_arcmin":240.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Dense Cygnus rift dust and H-alpha around Gamma Cygni","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"RHO_OPH","common_name":"Rho Ophiuchi & Antares Cloud Complex","catalog_ids":"IC 4604 / Sh2-9","object_type":"Reflection/Dark Nebula","constellation":"Ophiuchus","ra_hours":16.4258,"dec_deg":-24.46,"magnitude":4.6,"size_arcmin":240.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Broadband (M45/M42)","notes":"Colorful reflection nebulae, dark dust lanes, and M4 around Antares","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"IC2177","common_name":"Seagull Nebula","catalog_ids":"IC 2177 / Sh2-292","object_type":"Emission Nebula","constellation":"Monoceros","ra_hours":7.085,"dec_deg":-10.45,"magnitude":7.3,"size_arcmin":140.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"2.3-degree wingspan suited for 180mm APS-C","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"NGC7822","common_name":"Question Mark Nebula Complex","catalog_ids":"NGC 7822 / C11 / Sh2-171","object_type":"Emission Nebula","constellation":"Cepheus","ra_hours":0.045,"dec_deg":67.25,"magnitude":7.9,"size_arcmin":150.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"High-declination circumpolar emission complex in Cepheus","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"IC405","common_name":"Flaming Star & Tadpoles Nebulae","catalog_ids":"IC 405 / IC 410 / C31","object_type":"Emission/Reflection Nebula","constellation":"Auriga","ra_hours":5.31,"dec_deg":33.85,"magnitude":6.0,"size_arcmin":160.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Frames both Flaming Star (IC 405) and Tadpoles (IC 410) in one 180mm field","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"SH2_129","common_name":"Flying Bat & Squid Nebulae","catalog_ids":"Sh2-129 / Ou4","object_type":"Emission Nebula","constellation":"Cepheus","ra_hours":21.1967,"dec_deg":59.9667,"magnitude":8.5,"size_arcmin":140.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Wide Cepheus H-II shell surrounding the giant Squid bipolar nebula","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"LDN1235","common_name":"Shark & Dark Wolf Dust Nebulae","catalog_ids":"LDN 1235 / VdB 149","object_type":"Dark Nebula","constellation":"Cepheus","ra_hours":22.125,"dec_deg":73.25,"magnitude":9.0,"size_arcmin":150.0,"is_tpo180_pick":true,"bortle8_badge":"Dark Sky Preferred","notes":"Broadband dark-sky IFN molecular dust target in Cepheus","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"NGC281","common_name":"Pacman Nebula & Mirfak Field","catalog_ids":"NGC 281 / IC 11 / Sh2-184","object_type":"Emission Nebula","constellation":"Cassiopeia","ra_hours":0.8808,"dec_deg":56.6253,"magnitude":7.4,"size_arcmin":35.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"High-contrast H-II cloud with Bok globules","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"NGC7635","common_name":"Bubble Nebula, Lobster Claw & M52","catalog_ids":"NGC 7635 / Sh2-157 / M52","object_type":"Emission + Open Cluster","constellation":"Cassiopeia","ra_hours":23.345,"dec_deg":61.1,"magnitude":7.0,"size_arcmin":120.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Three major Cassiopeia objects in one 180mm frame","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"MARKARIAN","common_name":"Markarian's Galaxy Chain (Virgo Core)","catalog_ids":"M84 / M86 / NGC 4438","object_type":"Galaxy Cluster","constellation":"Virgo","ra_hours":12.45,"dec_deg":13.05,"magnitude":8.4,"size_arcmin":150.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Over 30 galaxies visible simultaneously in a single 180mm frame","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"NGC869","common_name":"Double Cluster in Perseus","catalog_ids":"NGC 869 / NGC 884 / C14","object_type":"Open Cluster","constellation":"Perseus","ra_hours":2.3333,"dec_deg":57.14,"magnitude":3.7,"size_arcmin":60.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Rich twin star clusters; ideal wide-field cluster and focus target","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"IC2118","common_name":"Witch Head Nebula","catalog_ids":"IC 2118 / NGC 1909","object_type":"Reflection Nebula","constellation":"Eridanus","ra_hours":5.115,"dec_deg":-7.21,"magnitude":9.0,"size_arcmin":180.0,"is_tpo180_pick":true,"bortle8_badge":"Dark Sky Preferred","notes":"3-degree blue reflection nebula illuminated by nearby Rigel","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"SH2_264","common_name":"Lambda Orionis Ring (Angelfish Nebula)","catalog_ids":"Sh2-264 / Cr 69","object_type":"Emission Nebula","constellation":"Orion","ra_hours":5.585,"dec_deg":9.93,"magnitude":5.0,"size_arcmin":300.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Giant ionized H-alpha ring filling the entire 180mm FOV","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"IC5146","common_name":"Cocoon Nebula & Barnard 168 Dark Tail","catalog_ids":"IC 5146 / B168 / C19","object_type":"Emission + Dark Nebula","constellation":"Cygnus","ra_hours":21.8911,"dec_deg":47.2667,"magnitude":7.2,"size_arcmin":120.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Glowing Cocoon Nebula at the end of the 2-degree B168 dark dust lane","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M1","common_name":"M1 \u2014 Crab Nebula","catalog_ids":"M1 / NGC 1952","object_type":"Supernova Remnant","constellation":"Taurus","ra_hours":5.5755,"dec_deg":22.0145,"magnitude":8.4,"size_arcmin":6.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Compact supernova remnant in Taurus","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M2","common_name":"M2 \u2014 Globular Cluster in Aquarius","catalog_ids":"M2 / NGC 7089","object_type":"Globular Cluster","constellation":"Aquarius","ra_hours":21.5575,"dec_deg":-0.8233,"magnitude":6.5,"size_arcmin":16.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Rich, compact globular cluster","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M3","common_name":"M3 \u2014 Globular Cluster in Canes Venatici","catalog_ids":"M3 / NGC 5272","object_type":"Globular Cluster","constellation":"Canes Venatici","ra_hours":13.7032,"dec_deg":28.3772,"magnitude":6.2,"size_arcmin":18.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Half a million stars in Canes Venatici","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M4","common_name":"M4 \u2014 Spider Globular Cluster (Rho Ophiuchi)","catalog_ids":"M4 / NGC 6121","object_type":"Globular Cluster","constellation":"Scorpius","ra_hours":16.3931,"dec_deg":-26.5258,"magnitude":5.6,"size_arcmin":36.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Nearest globular cluster; frames beside Antares & Rho Ophiuchi dust at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M5","common_name":"M5 \u2014 Rose Globular Cluster","catalog_ids":"M5 / NGC 5904","object_type":"Globular Cluster","constellation":"Serpens","ra_hours":15.3092,"dec_deg":2.0811,"magnitude":5.6,"size_arcmin":23.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"One of the largest northern globular clusters","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M6","common_name":"M6 \u2014 Butterfly Cluster","catalog_ids":"M6 / NGC 6405","object_type":"Open Cluster","constellation":"Scorpius","ra_hours":17.6689,"dec_deg":-32.2533,"magnitude":4.2,"size_arcmin":25.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Pairs with M7 Ptolemy Cluster in a rich Scorpius Milky Way field at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M7","common_name":"M7 \u2014 Ptolemy Cluster","catalog_ids":"M7 / NGC 6475","object_type":"Open Cluster","constellation":"Scorpius","ra_hours":17.8975,"dec_deg":-34.7933,"magnitude":3.3,"size_arcmin":80.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Huge 1.3-degree open cluster against dense Scorpius star clouds","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M8","common_name":"M8 \u2014 Lagoon Nebula (& Trifid M20 Field)","catalog_ids":"M8 / NGC 6523","object_type":"Emission Nebula","constellation":"Sagittarius","ra_hours":18.0631,"dec_deg":-24.3867,"magnitude":4.6,"size_arcmin":90.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Frames M8 Lagoon, M20 Trifid, and M21 together in one 180mm shot","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M9","common_name":"M9 \u2014 Globular Cluster near Barnard 64","catalog_ids":"M9 / NGC 6333","object_type":"Globular Cluster","constellation":"Ophiuchus","ra_hours":17.3199,"dec_deg":-18.5161,"magnitude":7.7,"size_arcmin":12.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Flanked by the dark nebula Barnard 64","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M10","common_name":"M10 \u2014 Globular Cluster in Ophiuchus","catalog_ids":"M10 / NGC 6254","object_type":"Globular Cluster","constellation":"Ophiuchus","ra_hours":16.9525,"dec_deg":-4.1003,"magnitude":6.6,"size_arcmin":20.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Can be framed alongside M12 in a wide 180mm field","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M11","common_name":"M11 \u2014 Wild Duck Cluster (& Scutum Star Cloud)","catalog_ids":"M11 / NGC 6705","object_type":"Open Cluster","constellation":"Scutum","ra_hours":18.8514,"dec_deg":-6.27,"magnitude":5.8,"size_arcmin":14.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Embedded in the dramatic Scutum Star Cloud and Barnard dark lanes at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M12","common_name":"M12 \u2014 Gumball Globular Cluster","catalog_ids":"M12 / NGC 6218","object_type":"Globular Cluster","constellation":"Ophiuchus","ra_hours":16.7872,"dec_deg":-1.9486,"magnitude":6.7,"size_arcmin":16.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"3.4 degrees from M10","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M13","common_name":"M13 \u2014 Great Hercules Globular Cluster","catalog_ids":"M13 / NGC 6205","object_type":"Globular Cluster","constellation":"Hercules","ra_hours":16.6949,"dec_deg":36.4614,"magnitude":5.8,"size_arcmin":20.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Showpiece northern globular cluster with nearby galaxy NGC 6207","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M14","common_name":"M14 \u2014 Globular Cluster in Ophiuchus","catalog_ids":"M14 / NGC 6402","object_type":"Globular Cluster","constellation":"Ophiuchus","ra_hours":17.6267,"dec_deg":-3.2458,"magnitude":7.6,"size_arcmin":11.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Luminous Ophiuchus globular cluster","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M15","common_name":"M15 \u2014 Great Pegasus Cluster (with IFN)","catalog_ids":"M15 / NGC 7078","object_type":"Globular Cluster","constellation":"Pegasus","ra_hours":21.4995,"dec_deg":12.167,"magnitude":6.2,"size_arcmin":18.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Dense core globular surrounded by faint Pegasus IFN dust","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M16","common_name":"M16 \u2014 Eagle Nebula (Pillars of Creation)","catalog_ids":"M16 / NGC 6611","object_type":"Emission Nebula","constellation":"Serpens","ra_hours":18.3133,"dec_deg":-13.7917,"magnitude":6.0,"size_arcmin":35.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Captures both M16 Eagle and M17 Omega Nebulae together in one 180mm frame","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M17","common_name":"M17 \u2014 Omega / Swan Nebula","catalog_ids":"M17 / NGC 6618","object_type":"Emission Nebula","constellation":"Sagittarius","ra_hours":18.3464,"dec_deg":-16.1717,"magnitude":6.0,"size_arcmin":45.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Bright H-II region; pairs with M16 and M18 in 180mm FOV","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M18","common_name":"M18 \u2014 Black Swan Open Cluster","catalog_ids":"M18 / NGC 6613","object_type":"Open Cluster","constellation":"Sagittarius","ra_hours":18.3328,"dec_deg":-17.1017,"magnitude":7.5,"size_arcmin":9.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Sits right between M17 and M24 in the 180mm field","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M19","common_name":"M19 \u2014 Oblate Globular Cluster","catalog_ids":"M19 / NGC 6273","object_type":"Globular Cluster","constellation":"Ophiuchus","ra_hours":17.0439,"dec_deg":-26.2678,"magnitude":6.8,"size_arcmin":17.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Most oblate known globular cluster","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M20","common_name":"M20 \u2014 Trifid Nebula","catalog_ids":"M20 / NGC 6514","object_type":"Emission/Reflection Nebula","constellation":"Sagittarius","ra_hours":18.045,"dec_deg":-23.03,"magnitude":6.3,"size_arcmin":28.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Red emission and blue reflection lobes; frames with M8 Lagoon at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M21","common_name":"M21 \u2014 Webb's Cross Open Cluster","catalog_ids":"M21 / NGC 6531","object_type":"Open Cluster","constellation":"Sagittarius","ra_hours":18.0703,"dec_deg":-22.49,"magnitude":5.9,"size_arcmin":13.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Adjacent to M20 Trifid Nebula","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M22","common_name":"M22 \u2014 Great Sagittarius Cluster","catalog_ids":"M22 / NGC 6656","object_type":"Globular Cluster","constellation":"Sagittarius","ra_hours":18.6067,"dec_deg":-23.9047,"magnitude":5.1,"size_arcmin":32.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"One of the brightest and largest globular clusters in the sky","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M23","common_name":"M23 \u2014 Open Cluster in Sagittarius","catalog_ids":"M23 / NGC 6494","object_type":"Open Cluster","constellation":"Sagittarius","ra_hours":17.9483,"dec_deg":-18.985,"magnitude":5.5,"size_arcmin":27.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Wide, rich star cluster bordered by dark nebulae","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M24","common_name":"M24 \u2014 Sagittarius Star Cloud (Delle Caustiche)","catalog_ids":"M24 / IC 4715","object_type":"Milky Way Star Cloud","constellation":"Sagittarius","ra_hours":18.28,"dec_deg":-18.55,"magnitude":4.6,"size_arcmin":90.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Massive 1.5-degree Milky Way window framed by Barnard 92 & 93 dark nebulae","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M25","common_name":"M25 \u2014 Open Cluster in Sagittarius","catalog_ids":"M25 / IC 4725","object_type":"Open Cluster","constellation":"Sagittarius","ra_hours":18.5292,"dec_deg":-19.1167,"magnitude":4.6,"size_arcmin":32.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Wide half-degree cluster near M24","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M26","common_name":"M26 \u2014 Open Cluster in Scutum","catalog_ids":"M26 / NGC 6694","object_type":"Open Cluster","constellation":"Scutum","ra_hours":18.755,"dec_deg":-9.3833,"magnitude":8.0,"size_arcmin":15.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Located in the southern Scutum Star Cloud","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M27","common_name":"M27 \u2014 Dumbbell Nebula","catalog_ids":"M27 / NGC 6853","object_type":"Planetary Nebula","constellation":"Vulpecula","ra_hours":19.9934,"dec_deg":22.7211,"magnitude":7.4,"size_arcmin":8.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Brightest planetary nebula; teal/red bowtie visible in 180mm starfield","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M28","common_name":"M28 \u2014 Globular Cluster in Sagittarius","catalog_ids":"M28 / NGC 6626","object_type":"Globular Cluster","constellation":"Sagittarius","ra_hours":18.4097,"dec_deg":-24.8697,"magnitude":6.8,"size_arcmin":11.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Near Lambda Sagittarii and M22","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M29","common_name":"M29 \u2014 Cooling Tower Cluster (Sadr Field)","catalog_ids":"M29 / NGC 6913","object_type":"Open Cluster","constellation":"Cygnus","ra_hours":20.3989,"dec_deg":38.5233,"magnitude":7.1,"size_arcmin":7.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Embedded inside the glowing H-alpha clouds of the Sadr Region at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M30","common_name":"M30 \u2014 Jellyfish Globular Cluster","catalog_ids":"M30 / NGC 7099","object_type":"Globular Cluster","constellation":"Capricornus","ra_hours":21.6728,"dec_deg":-23.1797,"magnitude":7.2,"size_arcmin":12.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Core-collapsed globular cluster in Capricornus","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M31","common_name":"M31 \u2014 Andromeda Galaxy (with M32 & M110)","catalog_ids":"M31 / NGC 224","object_type":"Spiral Galaxy","constellation":"Andromeda","ra_hours":0.7123,"dec_deg":41.2692,"magnitude":3.4,"size_arcmin":190.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Signature 180mm target; outer dust disks span over 3 degrees","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M32","common_name":"M32 \u2014 Andromeda Companion Elliptical","catalog_ids":"M32 / NGC 221","object_type":"Elliptical Galaxy","constellation":"Andromeda","ra_hours":0.7117,"dec_deg":40.8653,"magnitude":8.1,"size_arcmin":8.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Captured automatically alongside M31","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M33","common_name":"M33 \u2014 Triangulum Galaxy","catalog_ids":"M33 / NGC 598 / C25","object_type":"Spiral Galaxy","constellation":"Triangulum","ra_hours":1.5641,"dec_deg":30.6602,"magnitude":5.7,"size_arcmin":70.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Over 1 degree across; face-on spiral rich in pink H-II knots","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M34","common_name":"M34 \u2014 Spiral Open Cluster","catalog_ids":"M34 / NGC 1039","object_type":"Open Cluster","constellation":"Perseus","ra_hours":2.7014,"dec_deg":42.7617,"magnitude":5.5,"size_arcmin":35.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Bright half-degree open cluster in Perseus","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M35","common_name":"M35 \u2014 Shoe-Buckle Cluster (& NGC 2158)","catalog_ids":"M35 / NGC 2168","object_type":"Open Cluster","constellation":"Gemini","ra_hours":6.1483,"dec_deg":24.3333,"magnitude":5.3,"size_arcmin":28.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Frames M35, golden cluster NGC 2158, and Jellyfish Nebula IC 443 at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M36","common_name":"M36 \u2014 Pinwheel Cluster in Auriga","catalog_ids":"M36 / NGC 1960","object_type":"Open Cluster","constellation":"Auriga","ra_hours":5.6033,"dec_deg":34.14,"magnitude":6.3,"size_arcmin":12.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Forms the Auriga cluster chain with M37, M38, and IC 410 at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M37","common_name":"M37 \u2014 Salt-and-Pepper Cluster","catalog_ids":"M37 / NGC 2099","object_type":"Open Cluster","constellation":"Auriga","ra_hours":5.8725,"dec_deg":32.5533,"magnitude":6.2,"size_arcmin":24.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Richest open cluster in Auriga","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M38","common_name":"M38 \u2014 Starfish Cluster in Auriga","catalog_ids":"M38 / NGC 1912","object_type":"Open Cluster","constellation":"Auriga","ra_hours":5.4781,"dec_deg":35.855,"magnitude":7.4,"size_arcmin":21.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Frames alongside Flaming Star (IC 405) and M36 at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M39","common_name":"M39 \u2014 Open Cluster in Cygnus","catalog_ids":"M39 / NGC 7092","object_type":"Open Cluster","constellation":"Cygnus","ra_hours":21.5297,"dec_deg":48.4333,"magnitude":4.6,"size_arcmin":32.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Loose, bright cluster near the Cocoon Nebula and B168 dark lane","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M40","common_name":"M40 \u2014 Winnecke 4 Double Star (& NGC 4290)","catalog_ids":"M40 / WNC 4","object_type":"Double Star + Galaxies","constellation":"Ursa Major","ra_hours":12.3706,"dec_deg":58.0828,"magnitude":8.4,"size_arcmin":1.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Optical double star flanked by barred spiral NGC 4290","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M41","common_name":"M41 \u2014 Little Beehive Cluster (near Sirius)","catalog_ids":"M41 / NGC 2287","object_type":"Open Cluster","constellation":"Canis Major","ra_hours":6.7667,"dec_deg":-20.7567,"magnitude":4.5,"size_arcmin":38.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"4 degrees south of Sirius; rich in red/orange giants","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M42","common_name":"M42 \u2014 Great Orion Nebula (& Running Man)","catalog_ids":"M42 / NGC 1976","object_type":"Emission/Reflection Nebula","constellation":"Orion","ra_hours":5.5881,"dec_deg":-5.3911,"magnitude":4.0,"size_arcmin":85.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Point between M42 and Alnitak to frame Orion + Horsehead together at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M43","common_name":"M43 \u2014 De Mairan's Nebula","catalog_ids":"M43 / NGC 1982","object_type":"Emission Nebula","constellation":"Orion","ra_hours":5.5928,"dec_deg":-5.2667,"magnitude":9.0,"size_arcmin":20.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Part of the M42 Orion Nebula complex","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M44","common_name":"M44 \u2014 Beehive Cluster (Praesepe)","catalog_ids":"M44 / NGC 2632","object_type":"Open Cluster","constellation":"Cancer","ra_hours":8.67,"dec_deg":19.67,"magnitude":3.7,"size_arcmin":95.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Sprawling 1.5-degree cluster ideal for 180mm wide field","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M45","common_name":"M45 \u2014 Pleiades & Merope IFN Dust Complex","catalog_ids":"M45 / Mel 22","object_type":"Open Cluster + Reflection","constellation":"Taurus","ra_hours":3.79,"dec_deg":24.1167,"magnitude":1.6,"size_arcmin":110.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Broadband (M45/M42)","notes":"Showcase 180mm target; captures surrounding molecular cloud dust lanes","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M46","common_name":"M46 \u2014 Open Cluster (with NGC 2438 Planetary)","catalog_ids":"M46 / NGC 2437","object_type":"Open Cluster","constellation":"Puppis","ra_hours":7.6967,"dec_deg":-14.81,"magnitude":6.1,"size_arcmin":27.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Pairs with M47 in a single stunning 180mm twin-cluster frame","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M47","common_name":"M47 \u2014 Open Cluster in Puppis","catalog_ids":"M47 / NGC 2422","object_type":"Open Cluster","constellation":"Puppis","ra_hours":7.6097,"dec_deg":-14.4833,"magnitude":4.2,"size_arcmin":30.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"1.3 degrees from M46; great twin cluster composition at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M48","common_name":"M48 \u2014 Open Cluster in Hydra","catalog_ids":"M48 / NGC 2548","object_type":"Open Cluster","constellation":"Hydra","ra_hours":8.2286,"dec_deg":-5.75,"magnitude":5.8,"size_arcmin":54.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Large 54-arcminute open cluster","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M49","common_name":"M49 \u2014 Giant Elliptical in Virgo","catalog_ids":"M49 / NGC 4472","object_type":"Elliptical Galaxy","constellation":"Virgo","ra_hours":12.4964,"dec_deg":8.0006,"magnitude":8.4,"size_arcmin":10.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Brightest galaxy in the southern Virgo Cluster","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M50","common_name":"M50 \u2014 Heart-Shaped Open Cluster","catalog_ids":"M50 / NGC 2323","object_type":"Open Cluster","constellation":"Monoceros","ra_hours":7.0465,"dec_deg":-8.3378,"magnitude":5.9,"size_arcmin":16.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Near the Seagull Nebula in Monoceros","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M51","common_name":"M51 \u2014 Whirlpool Galaxy","catalog_ids":"M51 / NGC 5194","object_type":"Spiral Galaxy","constellation":"Canes Venatici","ra_hours":13.4979,"dec_deg":47.1952,"magnitude":8.4,"size_arcmin":11.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Classic interacting spiral pair with tidal bridge","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M52","common_name":"M52 \u2014 Salt-and-Pepper Cluster (& Bubble Nebula)","catalog_ids":"M52 / NGC 7654","object_type":"Open Cluster","constellation":"Cassiopeia","ra_hours":23.4067,"dec_deg":61.5933,"magnitude":6.9,"size_arcmin":13.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"35 arcminutes from the Bubble Nebula (NGC 7635)","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M53","common_name":"M53 \u2014 Globular Cluster in Coma Berenices","catalog_ids":"M53 / NGC 5024","object_type":"Globular Cluster","constellation":"Coma Berenices","ra_hours":13.2153,"dec_deg":18.1683,"magnitude":7.6,"size_arcmin":13.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"1 degree from the loose globular NGC 5053","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M54","common_name":"M54 \u2014 Extragalactic Globular Cluster","catalog_ids":"M54 / NGC 6715","object_type":"Globular Cluster","constellation":"Sagittarius","ra_hours":18.9176,"dec_deg":-30.4799,"magnitude":7.6,"size_arcmin":12.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Belongs to the Sagittarius Dwarf Elliptical Galaxy","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M55","common_name":"M55 \u2014 Summer Rose Star Globular","catalog_ids":"M55 / NGC 6809","object_type":"Globular Cluster","constellation":"Sagittarius","ra_hours":19.6666,"dec_deg":-30.9647,"magnitude":6.3,"size_arcmin":19.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Large, loose southern globular cluster","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M56","common_name":"M56 \u2014 Globular Cluster in Lyra","catalog_ids":"M56 / NGC 6779","object_type":"Globular Cluster","constellation":"Lyra","ra_hours":19.2765,"dec_deg":30.1833,"magnitude":8.3,"size_arcmin":9.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Halfway between Albireo and Sulafat","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M57","common_name":"M57 \u2014 Ring Nebula","catalog_ids":"M57 / NGC 6720","object_type":"Planetary Nebula","constellation":"Lyra","ra_hours":18.8931,"dec_deg":33.0292,"magnitude":8.8,"size_arcmin":1.5,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Small planetary ring; appears as a tiny turquoise disk at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M58","common_name":"M58 \u2014 Barred Spiral in Virgo","catalog_ids":"M58 / NGC 4579","object_type":"Spiral Galaxy","constellation":"Virgo","ra_hours":12.6288,"dec_deg":11.8181,"magnitude":9.7,"size_arcmin":6.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Part of the wide Virgo Cluster field","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M59","common_name":"M59 \u2014 Elliptical Galaxy in Virgo","catalog_ids":"M59 / NGC 4621","object_type":"Elliptical Galaxy","constellation":"Virgo","ra_hours":12.7006,"dec_deg":11.6469,"magnitude":9.6,"size_arcmin":5.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Forms an eastern Virgo group with M60 and M58","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M60","common_name":"M60 \u2014 Elliptical Galaxy (& NGC 4647 Pair)","catalog_ids":"M60 / NGC 4649","object_type":"Elliptical Galaxy","constellation":"Virgo","ra_hours":12.7278,"dec_deg":11.5525,"magnitude":8.8,"size_arcmin":7.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Interacting visual pair with spiral NGC 4647","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M61","common_name":"M61 \u2014 Swelling Spiral in Virgo","catalog_ids":"M61 / NGC 4303","object_type":"Spiral Galaxy","constellation":"Virgo","ra_hours":12.3653,"dec_deg":4.4736,"magnitude":9.7,"size_arcmin":6.5,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Starburst face-on spiral galaxy","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M62","common_name":"M62 \u2014 Flickering Globular Cluster","catalog_ids":"M62 / NGC 6266","object_type":"Globular Cluster","constellation":"Ophiuchus","ra_hours":17.0202,"dec_deg":-30.1125,"magnitude":6.5,"size_arcmin":15.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Near the galactic center border","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M63","common_name":"M63 \u2014 Sunflower Galaxy","catalog_ids":"M63 / NGC 5055","object_type":"Spiral Galaxy","constellation":"Canes Venatici","ra_hours":13.2637,"dec_deg":42.0294,"magnitude":8.6,"size_arcmin":12.6,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Flocculent spiral galaxy in Canes Venatici","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M64","common_name":"M64 \u2014 Black Eye Galaxy","catalog_ids":"M64 / NGC 4826","object_type":"Spiral Galaxy","constellation":"Coma Berenices","ra_hours":12.9455,"dec_deg":21.6828,"magnitude":8.5,"size_arcmin":10.7,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Prominent dark dust band across its bright nucleus","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M65","common_name":"M65 \u2014 Leo Triplet Spiral","catalog_ids":"M65 / NGC 3623","object_type":"Spiral Galaxy","constellation":"Leo","ra_hours":11.3155,"dec_deg":13.0922,"magnitude":9.3,"size_arcmin":9.8,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Frames the entire Leo Triplet (M65, M66, NGC 3628) together at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M66","common_name":"M66 \u2014 Leo Triplet Asymmetric Spiral","catalog_ids":"M66 / NGC 3627","object_type":"Spiral Galaxy","constellation":"Leo","ra_hours":11.3375,"dec_deg":12.9917,"magnitude":8.9,"size_arcmin":9.1,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Centerpiece of the Leo Triplet galaxy group","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M67","common_name":"M67 \u2014 King Cobra / Golden Eye Cluster","catalog_ids":"M67 / NGC 2682","object_type":"Open Cluster","constellation":"Cancer","ra_hours":8.855,"dec_deg":11.8,"magnitude":6.1,"size_arcmin":30.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"One of the oldest known open clusters","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M68","common_name":"M68 \u2014 Globular Cluster in Hydra","catalog_ids":"M68 / NGC 4590","object_type":"Globular Cluster","constellation":"Hydra","ra_hours":12.6578,"dec_deg":-26.7442,"magnitude":7.8,"size_arcmin":11.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Southern Hydra globular south of Corvus","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M69","common_name":"M69 \u2014 Globular Cluster in Sagittarius","catalog_ids":"M69 / NGC 6637","object_type":"Globular Cluster","constellation":"Sagittarius","ra_hours":18.5231,"dec_deg":-32.3481,"magnitude":7.6,"size_arcmin":10.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Metal-rich Sagittarius teapot globular","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M70","common_name":"M70 \u2014 Globular Cluster in Sagittarius","catalog_ids":"M70 / NGC 6681","object_type":"Globular Cluster","constellation":"Sagittarius","ra_hours":18.7202,"dec_deg":-32.2922,"magnitude":7.9,"size_arcmin":8.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"2.5 degrees from M69","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M71","common_name":"M71 \u2014 Angelfish Globular Cluster","catalog_ids":"M71 / NGC 6838","object_type":"Globular Cluster","constellation":"Sagitta","ra_hours":19.8962,"dec_deg":18.7792,"magnitude":8.2,"size_arcmin":7.2,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Loose globular in a dense Milky Way starfield","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M72","common_name":"M72 \u2014 Globular Cluster in Aquarius","catalog_ids":"M72 / NGC 6981","object_type":"Globular Cluster","constellation":"Aquarius","ra_hours":20.891,"dec_deg":-12.5372,"magnitude":9.3,"size_arcmin":6.6,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Remote halo globular cluster","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M73","common_name":"M73 \u2014 Aquarius Y-Asterism","catalog_ids":"M73 / NGC 6994","object_type":"Asterism","constellation":"Aquarius","ra_hours":20.9831,"dec_deg":-12.6333,"magnitude":9.0,"size_arcmin":2.8,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"1.5 degrees east of M72 and Saturn Nebula","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M74","common_name":"M74 \u2014 Phantom Galaxy","catalog_ids":"M74 / NGC 628","object_type":"Spiral Galaxy","constellation":"Pisces","ra_hours":1.6116,"dec_deg":15.7836,"magnitude":9.4,"size_arcmin":10.5,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Grand-design face-on spiral galaxy","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M75","common_name":"M75 \u2014 Globular Cluster in Sagittarius","catalog_ids":"M75 / NGC 6864","object_type":"Globular Cluster","constellation":"Sagittarius","ra_hours":20.1013,"dec_deg":-21.9211,"magnitude":8.5,"size_arcmin":6.8,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Highly concentrated class I globular","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M76","common_name":"M76 \u2014 Little Dumbbell Nebula","catalog_ids":"M76 / NGC 650 / NGC 651","object_type":"Planetary Nebula","constellation":"Perseus","ra_hours":1.7055,"dec_deg":51.5753,"magnitude":10.1,"size_arcmin":2.7,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"Bipolar planetary nebula in Perseus","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M77","common_name":"M77 \u2014 Cetus A Seyfert Spiral","catalog_ids":"M77 / NGC 1068","object_type":"Spiral Galaxy","constellation":"Cetus","ra_hours":2.7113,"dec_deg":-0.0133,"magnitude":8.9,"size_arcmin":7.1,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Pairs with NGC 1055 in a wide field","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M78","common_name":"M78 \u2014 Casper the Friendly Ghost (& Barnard's Loop)","catalog_ids":"M78 / NGC 2068","object_type":"Reflection Nebula","constellation":"Orion","ra_hours":5.7794,"dec_deg":0.05,"magnitude":8.3,"size_arcmin":8.0,"is_tpo180_pick":true,"bortle8_badge":"Dark Sky Preferred","notes":"Embedded in dark dust and the northern arc of Barnard's Loop at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M79","common_name":"M79 \u2014 Winter Globular Cluster in Lepus","catalog_ids":"M79 / NGC 1904","object_type":"Globular Cluster","constellation":"Lepus","ra_hours":5.4029,"dec_deg":-24.5242,"magnitude":7.7,"size_arcmin":9.6,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Rare winter-sky globular cluster below Orion","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M80","common_name":"M80 \u2014 Globular Cluster in Scorpius","catalog_ids":"M80 / NGC 6093","object_type":"Globular Cluster","constellation":"Scorpius","ra_hours":16.284,"dec_deg":-22.9761,"magnitude":7.3,"size_arcmin":10.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Bordering the dark dust streams of the Rho Ophiuchi complex","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M81","common_name":"M81 \u2014 Bode's Galaxy (& M82 + IFN)","catalog_ids":"M81 / NGC 3031","object_type":"Spiral Galaxy","constellation":"Ursa Major","ra_hours":9.9259,"dec_deg":69.0653,"magnitude":6.9,"size_arcmin":27.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Frames M81, M82, NGC 3077, and surrounding Integrated Flux Nebula at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M82","common_name":"M82 \u2014 Cigar Starburst Galaxy","catalog_ids":"M82 / NGC 3034","object_type":"Starburst Galaxy","constellation":"Ursa Major","ra_hours":9.9312,"dec_deg":69.6797,"magnitude":8.4,"size_arcmin":11.2,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"37 arcminutes from M81; glowing H-alpha superwind","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M83","common_name":"M83 \u2014 Southern Pinwheel Galaxy","catalog_ids":"M83 / NGC 5236","object_type":"Spiral Galaxy","constellation":"Hydra","ra_hours":13.6169,"dec_deg":-29.8658,"magnitude":7.5,"size_arcmin":12.9,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Bright, ruby-knotted barred spiral in Hydra","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M84","common_name":"M84 \u2014 Markarian's Chain Lenticular","catalog_ids":"M84 / NGC 4374","object_type":"Lenticular Galaxy","constellation":"Virgo","ra_hours":12.4177,"dec_deg":12.8869,"magnitude":9.1,"size_arcmin":6.5,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Western anchor of Markarian's Galaxy Chain","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M85","common_name":"M85 \u2014 Lenticular Galaxy (& NGC 4394 Pair)","catalog_ids":"M85 / NGC 4382","object_type":"Lenticular Galaxy","constellation":"Coma Berenices","ra_hours":12.4233,"dec_deg":18.1911,"magnitude":9.1,"size_arcmin":7.1,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Northernmost Virgo Cluster Messier galaxy","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M86","common_name":"M86 \u2014 Markarian's Chain Giant Elliptical","catalog_ids":"M86 / NGC 4406","object_type":"Elliptical Galaxy","constellation":"Virgo","ra_hours":12.4366,"dec_deg":12.9461,"magnitude":8.9,"size_arcmin":8.9,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Heart of Markarian's Chain alongside the Eyes Galaxies","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M87","common_name":"M87 \u2014 Virgo A Supergiant Elliptical","catalog_ids":"M87 / NGC 4486","object_type":"Elliptical Galaxy","constellation":"Virgo","ra_hours":12.5137,"dec_deg":12.3911,"magnitude":8.6,"size_arcmin":8.3,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Included in wide Markarian's Chain / Virgo Core 180mm framing","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M88","common_name":"M88 \u2014 Multi-Arm Virgo Spiral","catalog_ids":"M88 / NGC 4501","object_type":"Spiral Galaxy","constellation":"Coma Berenices","ra_hours":12.5331,"dec_deg":14.4203,"magnitude":9.6,"size_arcmin":6.9,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Symmetrical spiral near Markarian's Chain","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M89","common_name":"M89 \u2014 Spherical Elliptical in Virgo","catalog_ids":"M89 / NGC 4552","object_type":"Elliptical Galaxy","constellation":"Virgo","ra_hours":12.5944,"dec_deg":12.5564,"magnitude":9.8,"size_arcmin":5.1,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Part of the extended Virgo Cluster core","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M90","common_name":"M90 \u2014 Virgo Cluster Spiral","catalog_ids":"M90 / NGC 4569","object_type":"Spiral Galaxy","constellation":"Virgo","ra_hours":12.6138,"dec_deg":13.1628,"magnitude":9.5,"size_arcmin":9.5,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Large blue-shifted spiral in Virgo","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M91","common_name":"M91 \u2014 Barred Spiral in Coma Berenices","catalog_ids":"M91 / NGC 4548","object_type":"Spiral Galaxy","constellation":"Coma Berenices","ra_hours":12.5914,"dec_deg":14.4964,"magnitude":10.2,"size_arcmin":5.4,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Distinct theta-shaped barred spiral","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M92","common_name":"M92 \u2014 Second Hercules Globular Cluster","catalog_ids":"M92 / NGC 6341","object_type":"Globular Cluster","constellation":"Hercules","ra_hours":17.2854,"dec_deg":43.1358,"magnitude":6.4,"size_arcmin":14.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Bright, ancient globular cluster north of M13","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M93","common_name":"M93 \u2014 Critter Open Cluster","catalog_ids":"M93 / NGC 2447","object_type":"Open Cluster","constellation":"Puppis","ra_hours":7.7433,"dec_deg":-23.8567,"magnitude":6.2,"size_arcmin":22.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Arrowhead-shaped open cluster in Puppis Milky Way","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M94","common_name":"M94 \u2014 Cat's Eye / Croc's Eye Galaxy","catalog_ids":"M94 / NGC 4736","object_type":"Spiral Galaxy","constellation":"Canes Venatici","ra_hours":12.8481,"dec_deg":41.1203,"magnitude":8.2,"size_arcmin":11.2,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Double-ringed starburst spiral galaxy","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M95","common_name":"M95 \u2014 Leo I Group Barred Spiral","catalog_ids":"M95 / NGC 3351","object_type":"Spiral Galaxy","constellation":"Leo","ra_hours":10.7327,"dec_deg":11.7036,"magnitude":9.7,"size_arcmin":7.4,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Frames together with M96 and M105 in a single 180mm galaxy group shot","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M96","common_name":"M96 \u2014 Leo I Group Spiral","catalog_ids":"M96 / NGC 3368","object_type":"Spiral Galaxy","constellation":"Leo","ra_hours":10.7794,"dec_deg":11.82,"magnitude":9.2,"size_arcmin":7.6,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Dominant member of the M96/M95/M105 Leo I group","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M97","common_name":"M97 \u2014 Owl Nebula (& M108 Surfboard Pair)","catalog_ids":"M97 / NGC 3587","object_type":"Planetary Nebula","constellation":"Ursa Major","ra_hours":11.2466,"dec_deg":55.0192,"magnitude":9.9,"size_arcmin":3.4,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Dual-Band / H\u03b1\u2605","notes":"48 arcminutes from edge-on spiral galaxy M108","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M98","common_name":"M98 \u2014 Edge-On Virgo Spiral","catalog_ids":"M98 / NGC 4192","object_type":"Spiral Galaxy","constellation":"Coma Berenices","ra_hours":12.2299,"dec_deg":14.9003,"magnitude":10.1,"size_arcmin":9.8,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Near 6 Comae Berenices","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M99","common_name":"M99 \u2014 Coma Pinwheel Galaxy","catalog_ids":"M99 / NGC 4254","object_type":"Spiral Galaxy","constellation":"Coma Berenices","ra_hours":12.3138,"dec_deg":14.4164,"magnitude":9.9,"size_arcmin":5.4,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Bright three-armed spiral in northern Virgo cluster","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M100","common_name":"M100 \u2014 Mirror / Blowdryer Galaxy","catalog_ids":"M100 / NGC 4321","object_type":"Spiral Galaxy","constellation":"Coma Berenices","ra_hours":12.3819,"dec_deg":15.8222,"magnitude":9.3,"size_arcmin":7.4,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Grand-design spiral surrounded by dwarf companions","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M101","common_name":"M101 \u2014 Pinwheel Galaxy","catalog_ids":"M101 / NGC 5457","object_type":"Spiral Galaxy","constellation":"Ursa Major","ra_hours":14.0535,"dec_deg":54.3489,"magnitude":7.9,"size_arcmin":29.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Large half-degree face-on spiral surrounded by companion galaxies","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M102","common_name":"M102 \u2014 Spindle Galaxy (NGC 5866)","catalog_ids":"M102 / NGC 5866","object_type":"Lenticular Galaxy","constellation":"Draco","ra_hours":15.1082,"dec_deg":55.7633,"magnitude":9.9,"size_arcmin":4.7,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Edge-on lenticular galaxy with crisp dust lane","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M103","common_name":"M103 \u2014 Fan Open Cluster in Cassiopeia","catalog_ids":"M103 / NGC 581","object_type":"Open Cluster","constellation":"Cassiopeia","ra_hours":1.5561,"dec_deg":60.6583,"magnitude":7.4,"size_arcmin":6.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Frames with NGC 663 and NGC 654 in a rich Cassiopeia field at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M104","common_name":"M104 \u2014 Sombrero Galaxy","catalog_ids":"M104 / NGC 4594","object_type":"Spiral Galaxy","constellation":"Virgo","ra_hours":12.6665,"dec_deg":-11.6231,"magnitude":8.0,"size_arcmin":9.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Iconic equator-on dust lane and luminous halo","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M105","common_name":"M105 \u2014 Leo I Elliptical (& NGC 3384 Trio)","catalog_ids":"M105 / NGC 3379","object_type":"Elliptical Galaxy","constellation":"Leo","ra_hours":10.7971,"dec_deg":12.5817,"magnitude":9.3,"size_arcmin":5.4,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Forms a tight galaxy trio with NGC 3384 and NGC 3389 near M95/M96","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M106","common_name":"M106 \u2014 Active Spiral (& NGC 4217 Pair)","catalog_ids":"M106 / NGC 4258","object_type":"Spiral Galaxy","constellation":"Canes Venatici","ra_hours":12.316,"dec_deg":47.3039,"magnitude":8.4,"size_arcmin":18.6,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Large 19-arcminute spiral framed with edge-on NGC 4217 at 180mm","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M107","common_name":"M107 \u2014 Crucifix Globular Cluster","catalog_ids":"M107 / NGC 6171","object_type":"Globular Cluster","constellation":"Ophiuchus","ra_hours":16.5422,"dec_deg":-13.0536,"magnitude":7.9,"size_arcmin":13.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"South of Zeta Ophiuchi","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M108","common_name":"M108 \u2014 Surfboard Galaxy","catalog_ids":"M108 / NGC 3556","object_type":"Spiral Galaxy","constellation":"Ursa Major","ra_hours":11.1919,"dec_deg":55.6742,"magnitude":10.0,"size_arcmin":8.7,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Mottled edge-on spiral paired with M97 Owl Nebula","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M109","common_name":"M109 \u2014 Vacuum Cleaner Barred Spiral","catalog_ids":"M109 / NGC 3992","object_type":"Spiral Galaxy","constellation":"Ursa Major","ra_hours":11.96,"dec_deg":53.3744,"magnitude":9.8,"size_arcmin":7.6,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"40 arcminutes southeast of Phecda (Gamma Ursae Majoris)","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"M110","common_name":"M110 \u2014 Andromeda Outer Satellite Galaxy","catalog_ids":"M110 / NGC 205","object_type":"Elliptical Galaxy","constellation":"Andromeda","ra_hours":0.6728,"dec_deg":41.6853,"magnitude":8.5,"size_arcmin":17.0,"is_tpo180_pick":true,"bortle8_badge":"Bortle 8: Moderate (High Alt)","notes":"Captured automatically alongside M31 and M32 in the 180mm field","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"STAR_VEGA","common_name":"Vega (Alpha Lyrae)","catalog_ids":"HIP 91262 / HR 7001","object_type":"Focus Star","constellation":"Lyra","ra_hours":18.6156,"dec_deg":38.7837,"magnitude":0.03,"size_arcmin":1.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Primary summer/autumn focus calibration star","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"STAR_DENEB","common_name":"Deneb (Alpha Cygni)","catalog_ids":"HIP 102098 / HR 7924","object_type":"Focus Star","constellation":"Cygnus","ra_hours":20.6905,"dec_deg":45.2803,"magnitude":1.25,"size_arcmin":1.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Near NGC 7000 and Sadr; ideal focus star before Cygnus sequences","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"STAR_ALTAIR","common_name":"Altair (Alpha Aquilae)","catalog_ids":"HIP 97649 / HR 7557","object_type":"Focus Star","constellation":"Aquila","ra_hours":19.8464,"dec_deg":8.8683,"magnitude":0.76,"size_arcmin":1.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Equatorial summer/autumn focus star","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"STAR_CAPELLA","common_name":"Capella (Alpha Aurigae)","catalog_ids":"HIP 24608 / HR 1708","object_type":"Focus Star","constellation":"Auriga","ra_hours":5.2782,"dec_deg":45.998,"magnitude":0.08,"size_arcmin":1.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Primary autumn/winter northern focus star","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"STAR_MIRFAK","common_name":"Mirfak (Alpha Persei)","catalog_ids":"HIP 15863 / HR 1017","object_type":"Focus Star","constellation":"Perseus","ra_hours":3.4054,"dec_deg":49.8612,"magnitude":1.79,"size_arcmin":1.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Embedded in Alpha Persei Cluster; great multi-star HFR field","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"STAR_CAPH","common_name":"Caph (Beta Cassiopeiae)","catalog_ids":"HIP 746 / HR 21","object_type":"Focus Star","constellation":"Cassiopeia","ra_hours":0.1529,"dec_deg":59.1498,"magnitude":2.28,"size_arcmin":1.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"High-altitude Cassiopeia focus & PA star","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"STAR_RIGEL","common_name":"Rigel (Beta Orionis)","catalog_ids":"HIP 24436 / HR 1713","object_type":"Focus Star","constellation":"Orion","ra_hours":5.2423,"dec_deg":-8.2016,"magnitude":0.13,"size_arcmin":1.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Bright winter focus star near Orion/Witch Head","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"STAR_ARCTURUS","common_name":"Arcturus (Alpha Bootis)","catalog_ids":"HIP 69673 / HR 5340","object_type":"Focus Star","constellation":"Bootes","ra_hours":14.261,"dec_deg":19.1824,"magnitude":-0.05,"size_arcmin":1.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"Primary spring focus star","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true},{"id":"STAR_POLARIS","common_name":"Polaris (Alpha Ursae Minoris)","catalog_ids":"HIP 11767 / HR 424","object_type":"Focus Star","constellation":"Ursa Minor","ra_hours":2.5303,"dec_deg":89.2641,"magnitude":1.98,"size_arcmin":1.0,"is_tpo180_pick":false,"bortle8_badge":"Bortle 8: Great (Short Subs)","notes":"North Celestial Pole benchmark star","current_alt_deg":45.0,"current_az_deg":180.0,"visible_now":true}];

  const store = {
    nightVision: false,
    activeTab: 'PA',
    subTabFrame: 'FRAMING', // 'FRAMING' | 'FOCUS'
    state: null,
    catalog: [...DEFAULT_TARGETS],
    catalogSearch: '',
    catalogAboveHorizon: false,
    catalogTpo180Only: false,
    customTargetOpen: false,
    customTargetName: 'Custom Target',
    customTargetRa: '20:59:17',
    customTargetDec: '+44:19:48',
    plans: [],
    editingSteps: null,
    editingPlanName: '',
    editingPlanId: null,
    planSavedBanner: false,
    sessions: [],
    expandedSessionId: null,
    storage: null,
    presets: [],
    drawerOpen: false,
    showSimControls: false,
    abortArmed: false,
    wsConnected: false,
    zoom: 1.0,
    panX: 0.5,
    panY: 0.5,
    liveLoopRunning: false,
    catalogLoading: false,
    manualExposure: '2',
    manualIso: '1600',
    histMode: 'AUTO', // 'AUTO' | 'LIGHT' | 'FLAT'
    flatCalibratedExp: null,
    notice: null,
    busyAction: null,
  };

  let noticeTimer = null;
  function showNotice(message, level = 'err', autoHideMs = 10000) {
    store.notice = { message, level };
    if (level === 'err') playTone(310, 140, 'sawtooth');
    else if (level === 'ok') playTone(740, 100, 'sine');
    if (noticeTimer) clearTimeout(noticeTimer);
    if (autoHideMs > 0) {
      noticeTimer = setTimeout(() => {
        store.notice = null;
        render();
      }, autoHideMs);
    }
    render();
  }

  // Web Audio Cues for Dark-Sky Eyes-Free Operation
  let audioCtx = null;
  function playTone(freq, ms = 110, type = 'sine') {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + ms / 1000);
    } catch (_) {}
  }

  async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: {} };
    if (body !== null) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Request failed');
    }
    return res.json();
  }

  function computeLst(utcSec, lonDeg) {
    const jd = utcSec / 86400.0 + 2440587.5;
    const d = jd - 2451545.0;
    const tCent = d / 36525.0;
    let gmst = (280.46061837 + 360.98564736629 * d + 0.000387933 * tCent * tCent) % 360.0;
    if (gmst < 0) gmst += 360.0;
    let lst = ((gmst + (lonDeg || 0)) % 360.0 + 360.0) % 360.0 / 15.0;
    const h = Math.floor(lst);
    const m = Math.floor((lst - h) * 60);
    const s = Math.floor(((lst - h) * 60 - m) * 60);
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }

  function computeTargetAltAz(target, observer, utcSec) {
    if (!observer || observer.latitude_deg === undefined || target.ra_hours === undefined || target.dec_deg === undefined) {
      return { alt: 45.0, az: 180.0, airmass: 1.4 };
    }
    const jd = utcSec / 86400.0 + 2440587.5;
    const d = jd - 2451545.0;
    const tCent = d / 36525.0;
    let gmst = (280.46061837 + 360.98564736629 * d + 0.000387933 * tCent * tCent) % 360.0;
    if (gmst < 0) gmst += 360.0;
    const lstDeg = ((gmst + (observer.longitude_deg || 0)) % 360.0 + 360.0) % 360.0;
    const haDeg = (lstDeg - target.ra_hours * 15.0) % 360.0;

    const latRad = (observer.latitude_deg * Math.PI) / 180.0;
    const decRad = (target.dec_deg * Math.PI) / 180.0;
    const haRad = (haDeg * Math.PI) / 180.0;

    const sinAlt = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
    let altDeg = (Math.asin(Math.max(-1.0, Math.min(1.0, sinAlt))) * 180.0) / Math.PI;

    // Bennett atmospheric refraction correction (apparent altitude)
    if (altDeg > -1.0) {
      const rArcmin = 1.02 / Math.tan(((altDeg + 10.3 / (altDeg + 5.11)) * Math.PI) / 180.0);
      altDeg += rArcmin / 60.0;
    }

    const cosAz = (Math.sin(decRad) - Math.sin(latRad) * Math.sin((altDeg * Math.PI) / 180.0)) / (Math.cos(latRad) * Math.cos((altDeg * Math.PI) / 180.0));
    const sinAz = (-Math.cos(decRad) * Math.sin(haRad)) / Math.cos((altDeg * Math.PI) / 180.0);
    let azDeg = (Math.atan2(sinAz, cosAz) * 180.0) / Math.PI;
    if (azDeg < 0) azDeg += 360.0;

    let airmass = null;
    if (altDeg > 5.0) {
      airmass = Math.round((1.0 / Math.sin((Math.max(5.0, altDeg) * Math.PI) / 180.0)) * 100) / 100;
    }

    return {
      alt: Math.round(altDeg * 10) / 10,
      az: Math.round(azDeg * 10) / 10,
      airmass,
    };
  }

  function enrichCatalogLive(targets) {
    const obs = store.state?.observer || { latitude_deg: 35.3395, longitude_deg: -97.4867 };
    const nowSec = (store.state?.observer?.clock_offset_s !== undefined)
      ? (Date.now() / 1000 + (store.state.observer.clock_offset_s || 0))
      : (Date.now() / 1000);

    const enriched = targets.map((t) => {
      const coords = computeTargetAltAz(t, obs, nowSec);
      return {
        ...t,
        current_alt_deg: coords.alt,
        current_az_deg: coords.az,
        airmass: coords.airmass,
        visible_now: coords.alt >= 20.0,
      };
    });

    enriched.sort((a, b) => {
      const aFocus = a.object_type === 'Focus Star';
      const bFocus = b.object_type === 'Focus Star';
      if (aFocus !== bFocus) return aFocus ? 1 : -1;
      if (a.is_tpo180_pick !== b.is_tpo180_pick) return a.is_tpo180_pick ? -1 : 1;
      return (b.current_alt_deg ?? -90) - (a.current_alt_deg ?? -90);
    });

    return enriched;
  }

  function formatDuration(totalSec) {
    const s = Math.max(0, Math.round(totalSec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m`;
    }
    return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
  }

  async function loadCatalog() {
    if (store.catalogLoading) return;
    store.catalogLoading = true;
    try {
      const q = new URLSearchParams();
      if (store.catalogSearch.trim()) q.set('search', store.catalogSearch.trim());
      if (store.catalogAboveHorizon) q.set('min_alt', '5');
      if (store.catalogTpo180Only) q.set('tpo180_only', 'true');
      const qStr = q.toString();
      const path = qStr ? `/api/framing/catalog?${qStr}` : '/api/framing/catalog';
      const cat = await api(path);
      if (cat && cat.items && cat.items.length > 0) {
        const liveMap = new Map(cat.items.map(it => [it.id, it]));
        store.catalog = DEFAULT_TARGETS.map(def => liveMap.get(def.id) || def);
        for (const item of cat.items) {
          if (!DEFAULT_TARGETS.some(d => d.id === item.id)) {
            store.catalog.push(item);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load catalog:', err);
    } finally {
      store.catalogLoading = false;
      render();
    }
  }

  async function refreshAll() {
    try {
      store.state = await api('/api/system/state');
      if (store.state?.camera && typeof store.state.camera.live_view_running === 'boolean') {
        store.liveLoopRunning = store.state.camera.live_view_running;
      }
    } catch (err) {
      console.warn('Failed to fetch system state:', err);
    }
    render();

    if (store.activeTab === 'FRAME') {
      loadCatalog().catch(() => {});
    }
    if (store.activeTab === 'SEQUENCE') {
      try {
        const p = await api('/api/sequence/plans');
        store.plans = p.plans || [];
        if (!store.editingSteps && store.plans.length > 0) {
          const first = store.plans[0];
          store.editingPlanId = first.id;
          store.editingPlanName = first.name;
          store.editingSteps = (first.steps || []).map((st) => ({ ...st }));
        }
        render();
      } catch (err) {
        console.warn('Failed to fetch sequence plans:', err);
      }
    }
    if (store.activeTab === 'OFFLOAD') {
      try {
        const s = await api('/api/sessions');
        store.sessions = s.sessions || [];
        store.storage = s.storage || null;
        render();
      } catch (err) {
        console.warn('Failed to fetch sessions:', err);
      }
    }
    if (store.drawerOpen && store.presets.length === 0) {
      try {
        const pr = await api('/api/system/presets');
        store.presets = pr.presets || [];
        render();
      } catch (err) {
        console.warn('Failed to fetch presets:', err);
      }
    }
    render();
  }

  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onopen = () => {
      store.wsConnected = true;
      render();
    };
    ws.onclose = () => {
      store.wsConnected = false;
      render();
      setTimeout(connectWs, 2000);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'STATE_SNAPSHOT' || msg.type === 'FRAME_SAVED') {
          store.state = msg.payload;
          if (msg.payload?.camera && typeof msg.payload.camera.live_view_running === 'boolean') {
            store.liveLoopRunning = msg.payload.camera.live_view_running;
          }
          render();
        } else if (store.state) {
          if (msg.type === 'PREVIEW_UPDATED') {
            store.state.preview = msg.payload;
            renderPreviewCanvas();
            const histCont = document.getElementById('hist-container');
            if (histCont && msg.payload?.histogram) {
              histCont.innerHTML = renderHistogramSvg(msg.payload.histogram);
            }
            const srcFmt = document.getElementById('preview-source-fmt');
            if (srcFmt && msg.payload?.source_format) {
              srcFmt.textContent = `(${msg.payload.source_format})`;
            }
            const stretchBtn = document.getElementById('btn-toggle-stretch');
            if (stretchBtn && typeof msg.payload?.auto_stretched === 'boolean') {
              stretchBtn.textContent = msg.payload.auto_stretched ? '✨ Stretch: ON' : 'Stretch: OFF';
              stretchBtn.classList.toggle('btn-active', msg.payload.auto_stretched);
            }
            return;
          }
          if (msg.type === 'EXPOSURE_TICK') {
            store.state.camera = msg.payload;
            const wrap = document.getElementById('exposure-bar-wrap');
            if (wrap) {
              wrap.style.display = msg.payload.exposing ? 'block' : 'none';
              const textEl = document.getElementById('exposure-bar-text');
              if (textEl) {
                textEl.textContent = `${msg.payload.exposure_elapsed_s.toFixed(1)}s / ${msg.payload.exposure_total_s.toFixed(1)}s (${msg.payload.exposure_remaining_s.toFixed(1)}s left)`;
              }
              const fillEl = document.getElementById('exposure-bar-fill');
              if (fillEl) {
                fillEl.style.width = `${msg.payload.exposure_progress_pct}%`;
              }
            }
            return;
          }
          if (msg.type === 'CAMERA_STATUS') {
            store.state.camera = msg.payload;
            if (typeof msg.payload.live_view_running === 'boolean') {
              store.liveLoopRunning = msg.payload.live_view_running;
            }
          } else if (msg.type === 'PA_STATE') {
            if ((msg.payload.points || []).length > (store.state.pa.points || []).length) {
              playTone(660, 140, 'triangle');
            }
            store.state.pa = msg.payload;
          } else if (msg.type === 'FRAMING_STATE') {
            store.state.framing = msg.payload;
          } else if (msg.type === 'FOCUS_METRICS') {
            store.state.focus = msg.payload;
            if (msg.payload.hfr_median > 0) {
              playTone(Math.max(240, 900 - msg.payload.hfr_median * 110), 90);
            }
          } else if (msg.type === 'SEQUENCE_PROGRESS' || msg.type === 'INTERLOCK_PROMPT') {
            if (msg.type === 'INTERLOCK_PROMPT') {
              playTone(440, 220, 'sawtooth');
              store.flatCalibratedExp = null;
              if (msg.payload?.interlock_type === 'Flat') {
                store.histMode = 'FLAT';
                if (msg.payload.pending_step_exposure_s) {
                  store.manualExposure = String(msg.payload.pending_step_exposure_s);
                }
                if (msg.payload.pending_step_iso) {
                  store.manualIso = String(msg.payload.pending_step_iso);
                }
              }
            }
            store.state.sequence = msg.payload;
          }
          render();
        }
      } catch (_) {}
    };
  }

  let cachedPreviewUrl = null;
  let cachedPreviewImg = null;
  let loadingPreviewUrl = null;

  function drawPreviewFromImage(canvas, ctx, img, preview) {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const imgW = img.naturalWidth || canvas.width;
    const imgH = img.naturalHeight || canvas.height;

    let cropX = 0;
    let cropY = 0;
    let cropW = imgW;
    let cropH = imgH;

    if (store.zoom > 1.0) {
      cropW = imgW / store.zoom;
      cropH = imgH / store.zoom;
      const hw = cropW / 2;
      const hh = cropH / 2;

      const centerX = Math.max(hw, Math.min(imgW - hw, store.panX * imgW));
      const centerY = Math.max(hh, Math.min(imgH - hh, store.panY * imgH));

      cropX = centerX - hw;
      cropY = centerY - hh;

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(img, 0, 0, imgW, imgH, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();

    if (store.nightVision) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#ff1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // Draw star overlays mapped into current zoom & pan window
    const stars = preview.stars_overlay || [];
    ctx.strokeStyle = store.nightVision ? '#ff1a1a' : '#22d3ee';
    ctx.fillStyle = store.nightVision ? '#ff1a1a' : '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    for (const s of stars) {
      let destX, destY;
      if (store.zoom > 1.0) {
        const starImgX = s.x * imgW;
        const starImgY = s.y * imgH;
        if (starImgX < cropX || starImgX > cropX + cropW || starImgY < cropY || starImgY > cropY + cropH) {
          continue;
        }
        destX = ((starImgX - cropX) / cropW) * canvas.width;
        destY = ((starImgY - cropY) / cropH) * canvas.height;
      } else {
        destX = s.x * canvas.width;
        destY = s.y * canvas.height;
      }
      ctx.beginPath();
      ctx.arc(destX, destY, Math.max(6, s.hfr * 3 * store.zoom), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(`${s.hfr.toFixed(1)}px`, destX + 8, destY - 6);
    }

    // If zoomed, draw pan hint and overview mini-map
    if (store.zoom > 1.0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.fillRect(8, 8, 175, 26);
      ctx.strokeStyle = store.nightVision ? '#ff1a1a' : '#27272a';
      ctx.lineWidth = 1;
      ctx.strokeRect(8, 8, 175, 26);
      ctx.fillStyle = store.nightVision ? '#ff1a1a' : '#38bdf8';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🔍 ${store.zoom}x Zoom • Drag to Pan`, 14, 25);

      const mmW = 60;
      const mmH = 40;
      const mmX = canvas.width - mmW - 10;
      const mmY = 10;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(mmX, mmY, mmW, mmH);
      ctx.strokeStyle = store.nightVision ? '#550000' : 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(mmX, mmY, mmW, mmH);

      const vpW = mmW / store.zoom;
      const vpH = mmH / store.zoom;
      const vpX = mmX + (cropX / imgW) * mmW;
      const vpY = mmY + (cropY / imgH) * mmH;
      ctx.strokeStyle = store.nightVision ? '#ff1a1a' : '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vpX, vpY, vpW, vpH);
    }
  }

  function renderPreviewCanvas() {
    const canvas = document.getElementById('sky-canvas');
    if (!canvas) return;
    const preview = store.state?.preview;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    initCanvasPan();

    if (!preview?.image_url) {
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = store.nightVision ? '#ff1a1a' : '#a1a1aa';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("Tap '▶ Live Viewfinder' or '📸 Test Shot' to see camera view", canvas.width / 2, canvas.height / 2);
      return;
    }

    // Synchronous 0ms repaint if image is already decoded (eliminates flicker & enables 60 FPS pan!)
    if (cachedPreviewImg && cachedPreviewUrl === preview.image_url) {
      drawPreviewFromImage(canvas, ctx, cachedPreviewImg, preview);
      return;
    }

    // Keep displaying previous frame seamlessly while the new frame loads
    if (cachedPreviewImg) {
      drawPreviewFromImage(canvas, ctx, cachedPreviewImg, preview);
    }

    if (loadingPreviewUrl === preview.image_url) {
      return;
    }
    loadingPreviewUrl = preview.image_url;

    const img = new Image();
    img.onload = () => {
      cachedPreviewUrl = preview.image_url;
      cachedPreviewImg = img;
      loadingPreviewUrl = null;
      const liveCanvas = document.getElementById('sky-canvas');
      if (liveCanvas) {
        const liveCtx = liveCanvas.getContext('2d');
        if (liveCtx && store.state?.preview) {
          drawPreviewFromImage(liveCanvas, liveCtx, img, store.state.preview);
        }
      }
    };
    img.onerror = () => {
      loadingPreviewUrl = null;
    };
    img.src = preview.image_url;
  }

  let isDraggingCanvas = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0.5;
  let dragStartPanY = 0.5;

  function initCanvasPan() {
    const canvas = document.getElementById('sky-canvas');
    if (!canvas || canvas._panAttached) {
      if (canvas) canvas.style.cursor = store.zoom > 1.0 ? 'grab' : 'default';
      return;
    }
    canvas._panAttached = true;
    canvas.style.cursor = store.zoom > 1.0 ? 'grab' : 'default';

    canvas.addEventListener('mousedown', (e) => {
      if (store.zoom <= 1.0) return;
      isDraggingCanvas = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartPanX = store.panX;
      dragStartPanY = store.panY;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingCanvas || store.zoom <= 1.0) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - dragStartX) / rect.width;
      const dy = (e.clientY - dragStartY) / rect.height;

      const hw = 0.5 / store.zoom;
      const hh = 0.5 / store.zoom;
      store.panX = Math.max(hw, Math.min(1.0 - hw, dragStartPanX - dx / store.zoom));
      store.panY = Math.max(hh, Math.min(1.0 - hh, dragStartPanY - dy / store.zoom));
      renderPreviewCanvas();
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingCanvas) {
        isDraggingCanvas = false;
        if (canvas) canvas.style.cursor = store.zoom > 1.0 ? 'grab' : 'default';
      }
    });

    canvas.addEventListener('touchstart', (e) => {
      if (store.zoom <= 1.0 || e.touches.length !== 1) return;
      isDraggingCanvas = true;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      dragStartPanX = store.panX;
      dragStartPanY = store.panY;
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (!isDraggingCanvas || store.zoom <= 1.0 || e.touches.length !== 1) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.touches[0].clientX - dragStartX) / rect.width;
      const dy = (e.touches[0].clientY - dragStartY) / rect.height;

      const hw = 0.5 / store.zoom;
      const hh = 0.5 / store.zoom;
      store.panX = Math.max(hw, Math.min(1.0 - hw, dragStartPanX - dx / store.zoom));
      store.panY = Math.max(hh, Math.min(1.0 - hh, dragStartPanY - dy / store.zoom));
      renderPreviewCanvas();
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      isDraggingCanvas = false;
    });

    canvas.addEventListener('dblclick', () => {
      if (store.zoom > 1.0) {
        store.panX = 0.5;
        store.panY = 0.5;
        renderPreviewCanvas();
      }
    });
  }

  const PREVIEW_EXP_OPTIONS = [
    { val: '0.001', label: '1/1000s' },
    { val: '0.004', label: '1/250s' },
    { val: '0.0167', label: '1/60s' },
    { val: '0.0667', label: '1/15s' },
    { val: '0.25', label: '1/4s' },
    { val: '0.5', label: '0.5s' },
    { val: '1', label: '1s' },
    { val: '1.6', label: '1.6s' },
    { val: '2', label: '2s' },
    { val: '3.2', label: '3.2s' },
    { val: '5', label: '5s' },
    { val: '8', label: '8s' },
    { val: '10', label: '10s' },
    { val: '15', label: '15s' },
    { val: '20', label: '20s' },
    { val: '30', label: '30s' },
  ];

  function isFlatHistActive() {
    if (store.histMode === 'FLAT') return true;
    if (store.histMode === 'LIGHT') return false;
    const seq = store.state?.sequence;
    if (seq && (seq.interlock_type === 'Flat' || seq.current_frame_type === 'Flat')) return true;
    if (store.state?.preview?.meta?.frame_type === 'Flat') return true;
    return false;
  }

  function evaluateFlatHistogram(hist) {
    if (!hist) return { pct: 0, ok: false, label: 'Capture a test shot to check Flat ADU (target 35–55%)' };
    const med = Number(hist.median_adu ?? 0);
    const pct = Math.round((med / 255) * 100);
    const maxChP99 = Number(hist.max_channel_p99_adu ?? hist.p99_adu ?? 0);
    if (maxChP99 >= 242) {
      return { pct, ok: false, warn: true, label: '⚠️ CHANNEL CLIPPING (>95%) — Shorten Exp or Dim Panel!' };
    }
    if (pct > 55) {
      return { pct, ok: false, warn: true, label: `⚠️ Too Bright (${pct}% > 55%) — Shorten Flat Exposure` };
    }
    if (pct < 35) {
      return { pct, ok: false, warn: true, label: `⚠️ Underexposed (${pct}% < 35%) — Lengthen Flat Exposure` };
    }
    return { pct, ok: true, warn: false, label: '✓ Optimal Siril Flat Zone (35–55% • No Channel Clipping)' };
  }

  function renderHistogramSvg(hist) {
    if (!hist || !hist.luma || hist.luma.length === 0) return '';
    const bins = hist.luma;
    const w = 320;
    const h = 46;
    const flatMode = isFlatHistActive();
    const med = Number(hist.median_adu ?? 50);
    const aduPct = Math.round((med / 255) * 100);

    const buildPts = (arr) =>
      (arr || [])
        .map((v, i) => {
          const x = (i / Math.max(1, arr.length - 1)) * w;
          const y = h - Math.min(1, Math.max(0, v)) * (h - 6) - 2;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    const ptsLuma = buildPts(bins);
    const rgbCurves =
      !store.nightVision && hist.r && hist.g && hist.b
        ? `<polyline fill="none" stroke="#ef4444" stroke-opacity="0.45" stroke-width="1.1" points="${buildPts(hist.r)}" />
           <polyline fill="none" stroke="#22c55e" stroke-opacity="0.45" stroke-width="1.1" points="${buildPts(hist.g)}" />
           <polyline fill="none" stroke="#3b82f6" stroke-opacity="0.45" stroke-width="1.1" points="${buildPts(hist.b)}" />`
        : '';

    let headerText = '';
    let zoneLabel = '';
    let zoneStart = 0.15;
    let zoneWidth = 0.20;
    let zoneCol = store.nightVision ? '#ff1a1a' : '#ef4444';
    const lumaCol = store.nightVision ? '#ff1a1a' : (flatMode ? '#f8fafc' : '#ef4444');

    if (flatMode) {
      const flatEval = evaluateFlatHistogram(hist);
      const rPct = hist.r_median_adu !== undefined ? Math.round((hist.r_median_adu / 255) * 100) : aduPct;
      const gPct = hist.g_median_adu !== undefined ? Math.round((hist.g_median_adu / 255) * 100) : aduPct;
      const bPct = hist.b_median_adu !== undefined ? Math.round((hist.b_median_adu / 255) * 100) : aduPct;
      headerText = `FLAT ADU GUIDE: ${aduPct}% (${med} ADU) • R:${rPct}% G:${gPct}% B:${bPct}%`;
      zoneLabel = flatEval.label;
      zoneStart = 0.35;
      zoneWidth = 0.20;
      zoneCol = store.nightVision ? '#ff1a1a' : (flatEval.ok ? '#10b981' : '#f59e0b');
    } else {
      headerText = `SKYFOG HISTOGRAM: ${aduPct}% (${med} ADU)`;
      zoneLabel = 'Optimal Skyfog Zone (15–35%) ✓';
      if (aduPct > 40) zoneLabel = '⚠️ High Skyglow (>40%) — Lower Exp/ISO';
      else if (aduPct < 10) zoneLabel = 'Low Skyfog (<10%) — Can Increase Exp';
    }

    const clipLine = flatMode
      ? `<line x1="${(w * 0.95).toFixed(1)}" y1="0" x2="${(w * 0.95).toFixed(1)}" y2="${h}" stroke="${store.nightVision ? '#ff1a1a' : '#ef4444'}" stroke-dasharray="3 2" stroke-width="1.2" />`
      : '';

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:6px;border-top:1px solid var(--border-col);flex-wrap:wrap">
        <div style="font-size:11px;color:var(--text-muted);display:grid;gap:2px">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <strong style="color:var(--text-main)">${headerText}</strong>
            <button class="btn btn-sm ${flatMode ? 'btn-active' : ''}" data-action="toggle-hist-mode" style="min-height:22px;padding:1px 7px;font-size:10px" title="Switch histogram target guide between Light Skyfog (15–35%) and Siril Flat ADU (35–55%)">
              ${flatMode ? '⬜ Mode: Flat ADU (35–55%)' : '🌌 Mode: Skyfog (15–35%)'}
            </button>
          </div>
          <div style="color:${flatMode ? (evaluateFlatHistogram(hist).ok ? 'var(--ok-col)' : 'var(--warn-col)') : 'var(--text-muted)'}">${zoneLabel}</div>
        </div>
        <svg viewBox="0 0 ${w} ${h}" style="flex:1;max-width:255px;height:42px;background:var(--bg-oled);border:1px solid var(--border-col);border-radius:6px">
          <rect x="${(w * zoneStart).toFixed(1)}" y="0" width="${(w * zoneWidth).toFixed(1)}" height="${h}" fill="${zoneCol}" opacity="0.18" />
          ${clipLine}
          ${rgbCurves}
          <polyline fill="none" stroke="${lumaCol}" stroke-width="1.8" points="${ptsLuma}" />
        </svg>
      </div>
    `;
  }

  function renderBullseyeSvg(pa) {
    const maxErr = Math.max(1.5, pa.total_error_arcmin || 0);
    const scale = maxErr > 60 ? 180 : maxErr > 20 ? 60 : maxErr > 6 ? 20 : maxErr > 2 ? 6 : 2;
    const size = 230;
    const c = size / 2;
    const rMax = 94;
    const toXY = (az, alt) => ({
      x: c + Math.max(-1.08, Math.min(1.08, az / scale)) * rMax,
      y: c - Math.max(-1.08, Math.min(1.08, alt / scale)) * rMax,
    });
    const cur = toXY(pa.az_error_arcmin || 0, pa.alt_error_arcmin || 0);
    const isAligned = pa.points.length >= pa.mode_points && pa.total_error_arcmin <= 1.5;
    const colMain = store.nightVision ? '#ff1a1a' : isAligned ? '#10b981' : '#ef4444';
    const colRing = store.nightVision ? '#660000' : '#3f3f46';
    const trail = (pa.breadcrumb_trail || [])
      .map((pt, idx) => {
        const p = toXY(pt.az_error_arcmin, pt.alt_error_arcmin);
        return `<circle cx="${p.x}" cy="${p.y}" r="${2.5 + idx * 0.8}" fill="${colMain}" opacity="${0.22 + idx * 0.14}"/>`;
      })
      .join('');
    return `
      <div style="text-align:center">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">
          AUTO-ZOOM BULLSEYE: ±${scale}' FULL SCALE ${isAligned ? '• POLAR ALIGNED (<1.5\')' : ''}
        </div>
        <svg width="${size}" height="${size}" style="background:var(--bg-oled);border-radius:999px;border:1px solid var(--border-col)">
          <line x1="0" y1="${c}" x2="${size}" y2="${c}" stroke="${colRing}" stroke-dasharray="4 4"/>
          <line x1="${c}" y1="0" x2="${c}" y2="${size}" stroke="${colRing}" stroke-dasharray="4 4"/>
          <circle cx="${c}" cy="${c}" r="${rMax}" fill="none" stroke="${colRing}"/>
          <circle cx="${c}" cy="${c}" r="${rMax * 0.66}" fill="none" stroke="${colRing}"/>
          <circle cx="${c}" cy="${c}" r="${rMax * 0.33}" fill="none" stroke="${colMain}" stroke-width="1.6"/>
          ${trail}
          <line x1="${cur.x}" y1="${cur.y}" x2="${c}" y2="${c}" stroke="${colMain}" stroke-width="2.5"/>
          <circle cx="${cur.x}" cy="${cur.y}" r="6.5" fill="${colMain}"/>
        </svg>
      </div>
    `;
  }

  function renderHfrSparkline(history) {
    if (!history || history.length < 2) return '';
    const ptsArr = history.slice(-15);
    const vals = ptsArr.map((h) => h.hfr);
    const minV = Math.min(...vals, 1.2);
    const maxV = Math.max(...vals, minV + 1.5);
    const w = 280;
    const h = 46;
    const col = store.nightVision ? '#ff1a1a' : '#10b981';
    const poly = ptsArr
      .map((item, idx) => {
        const x = (idx / (ptsArr.length - 1)) * (w - 16) + 8;
        const y = h - ((item.hfr - minV) / (maxV - minV)) * (h - 14) - 7;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return `
      <div style="background:var(--bg-oled);border:1px solid var(--border-col);border-radius:8px;padding:6px 10px">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:2px">
          <span>HFR FOCUS TREND (V-CURVE)</span>
          <span>Range: ${minV.toFixed(2)}px – ${maxV.toFixed(2)}px</span>
        </div>
        <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:42px">
          <polyline fill="none" stroke="${col}" stroke-width="2" points="${poly}" />
        </svg>
      </div>
    `;
  }

  function renderPaTab(pa, isSim) {
    const pts = pa.points ? pa.points.length : 0;
    const needed = pa.mode_points || 3;
    const calibrated = pts >= needed;
    const isAligned = calibrated && pa.total_error_arcmin <= 1.5;

    let stepBannerText = '';
    if (pts === 0) {
      stepBannerText = `<strong>Step 1 of ${needed}:</strong> Aim camera roughly toward the sky, lock the Star Adventurer 2i RA clutch, and tap <strong>Capture Point 1</strong>.`;
    } else if (pts < needed) {
      stepBannerText = `<strong>Step ${pts + 1} of ${needed}:</strong> Loosen the Star Adventurer 2i RA clutch, rotate the camera <strong>~30° East or West</strong>, re-lock the clutch, and tap <strong>Capture Point ${pts + 1}</strong>.`;
    } else if (isAligned) {
      stepBannerText = `<strong>Polar Aligned (${pa.total_error_arcmin.toFixed(2)}')!</strong> Lock your wedge knobs and proceed to <strong>2. Frame &amp; Focus</strong>.`;
    } else {
      stepBannerText = `<strong>Calibrated!</strong> Start the <strong>2.5s Live Solve Loop</strong> and turn your wedge Altitude knob &amp; Azimuth screws until the dot enters the center bullseye (&lt;1.5').`;
    }

    return `
      <div class="card">
        <div class="card-header">
          <h3>1. Polar Alignment (${needed}-Point All-Sky)</h3>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm ${needed === 3 ? 'btn-active' : ''}" data-action="pa-mode-3">3-Pt (+Bump Check)</button>
            <button class="btn btn-sm ${needed === 2 ? 'btn-active' : ''}" data-action="pa-mode-2">2-Pt Fast</button>
            ${pts > 0 ? `<button class="btn btn-sm" data-action="pa-mode-${needed}">Reset</button>` : ''}
          </div>
        </div>

        <div class="step-banner ${isAligned ? 'aligned' : ''}">${stepBannerText}</div>

        ${
          pa.solve_warning
            ? `<div class="step-banner" style="border-left-color:var(--warn-col);background:var(--warn-bg);font-size:12px">
                 ⚠️ ${pa.solve_warning}
               </div>`
            : ''
        }

        ${
          !calibrated
            ? `<button class="btn btn-lg btn-primary" data-action="pa-capture" ${store.busyAction ? 'disabled' : ''}>
                 ${
                   store.busyAction === 'pa-capture'
                     ? '⏳ EXPOSING &amp; PLATE-SOLVING...'
                     : `📸 CAPTURE CALIBRATION POINT ${pts + 1} OF ${needed} (${store.manualExposure}s @ ISO ${store.manualIso})`
                 }
               </button>`
            : `<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px">
                 <button class="btn btn-lg ${pa.loop_running ? 'btn-warn' : 'btn-primary'}" data-action="pa-loop">
                   ${pa.loop_running ? '⏹ STOP LIVE LOOP (RESTORE RAW)' : '▶ START 2.5s LIVE SOLVE LOOP'}
                 </button>
                 <button class="btn btn-lg" data-action="pa-capture" ${store.busyAction ? 'disabled' : ''}>
                   ${store.busyAction === 'pa-capture' ? '⏳ SOLVING...' : 'SINGLE SOLVE'}
                 </button>
               </div>`
        }

        ${renderBullseyeSvg(pa)}

        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-label">WEDGE ALTITUDE</div>
            <div class="kpi-val">${pa.alt_error_arcmin >= 0 ? '+' : ''}${pa.alt_error_arcmin.toFixed(1)}'</div>
            <div class="kpi-sub"><strong>${pa.alt_direction}</strong> (~${pa.sa2i_knob_turns} turns)</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">WEDGE AZIMUTH</div>
            <div class="kpi-val">${pa.az_error_arcmin >= 0 ? '+' : ''}${pa.az_error_arcmin.toFixed(1)}'</div>
            <div class="kpi-sub"><strong>${pa.az_direction}</strong></div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">TOTAL ERROR</div>
            <div class="kpi-val">${pa.total_error_arcmin.toFixed(2)}'</div>
            <div class="kpi-sub">Bump: ${pa.bump_residual_arcmin.toFixed(2)}' ${pa.bump_warning ? '⚠️' : '✓'}</div>
          </div>
        </div>

        ${
          isSim && store.showSimControls
            ? `<div style="border-top:1px dashed var(--border-col);padding-top:8px;display:flex;justify-content:space-between;align-items:center">
                 <span style="font-size:11px;color:var(--text-muted)">SIMULATOR TEST RIG:</span>
                 <button class="btn btn-sm" data-action="pa-sim-align">Simulate Turning Wedge Knobs (&lt;1')</button>
               </div>`
            : ''
        }
      </div>
    `;
  }

  function renderFrameFocusTab(framing, focus, isSim) {
    const isFraming = store.subTabFrame === 'FRAMING';

    if (isFraming) {
      const rawTargets = (store.catalog && store.catalog.length > 0) ? store.catalog : DEFAULT_TARGETS;
      const allTargets = enrichCatalogLive(rawTargets);

      // Group targets for the quick-pick dropdown
      const tpoPicks = allTargets.filter(t => t.is_tpo180_pick);
      const messierTargets = allTargets.filter(t => t.id && t.id.startsWith('M') && !t.is_tpo180_pick);
      const focusStars = allTargets.filter(t => t.object_type === 'Focus Star');
      const otherTargets = allTargets.filter(t => !t.is_tpo180_pick && !(t.id && t.id.startsWith('M')) && t.object_type !== 'Focus Star');

      const renderOpt = (t) => {
        const isSel = t.id === framing.target_id || t.common_name === framing.target_name;
        const altStr = t.current_alt_deg !== undefined ? ` (Alt ${t.current_alt_deg}°)` : '';
        return `<option value="${t.id}" data-name="${t.common_name}" data-ra="${t.ra_hours}" data-dec="${t.dec_deg}" ${isSel ? 'selected' : ''}>${t.common_name}${altStr}</option>`;
      };

      const quickPickHtml = `
        <select id="target-quick-pick" class="ctrl-sel" style="font-size:13px;padding:6px 10px;flex:1;min-width:240px;background:var(--bg-elevated);border-color:var(--accent);color:var(--text-main);font-weight:700">
          <optgroup label="★ TPO 180mm Wide-Field Showcase (Tailored for APS-C)">
            ${tpoPicks.map(renderOpt).join('')}
          </optgroup>
          <optgroup label="Complete Messier Catalog (M1 – M110)">
            ${messierTargets.map(renderOpt).join('')}
          </optgroup>
          <optgroup label="Focus &amp; Calibration Stars">
            ${focusStars.map(renderOpt).join('')}
          </optgroup>
          ${otherTargets.length > 0 ? `<optgroup label="Other Deep-Sky Targets">${otherTargets.map(renderOpt).join('')}</optgroup>` : ''}
          <optgroup label="Custom Coordinates">
            <option value="CUSTOM" ${framing.target_id === 'CUSTOM' ? 'selected' : ''}>+ Custom Coordinates (${store.customTargetName})</option>
          </optgroup>
        </select>
      `;

      let visibleCatalog = allTargets;
      if (store.catalogTpo180Only) {
        visibleCatalog = visibleCatalog.filter(item => item.is_tpo180_pick);
      }
      if (store.catalogAboveHorizon) {
        visibleCatalog = visibleCatalog.filter(item => (item.current_alt_deg ?? 0) >= 5);
      }
      if (store.catalogSearch.trim()) {
        const q = store.catalogSearch.trim().toLowerCase();
        visibleCatalog = visibleCatalog.filter(item =>
          (item.id && item.id.toLowerCase().includes(q)) ||
          (item.common_name && item.common_name.toLowerCase().includes(q)) ||
          (item.catalog_ids && item.catalog_ids.toLowerCase().includes(q)) ||
          (item.constellation && item.constellation.toLowerCase().includes(q))
        );
      }

      const catRows = visibleCatalog
        .map((item) => {
          const isSel = item.id === framing.target_id || item.common_name === framing.target_name;
          const tpoBadge = item.is_tpo180_pick
            ? `<span class="badge badge-raw" style="font-size:10px;padding:1px 6px;margin-left:4px">★ TPO 180 PICK</span>`
            : '';
          const b8Badge = item.bortle8_badge
            ? `<span class="badge" style="font-size:9px;padding:1px 5px;margin-left:4px">${item.bortle8_badge}</span>`
            : '';
          const altBadge = item.current_alt_deg !== undefined
            ? `<span class="badge" style="font-size:10px">Alt ${item.current_alt_deg}°</span>`
            : '';
          const airmassText = item.airmass
            ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${item.airmass}x airmass</div>`
            : '';
          return `
            <button class="catalog-item ${isSel ? 'selected' : ''}" data-target-id="${item.id}" data-target-name="${item.common_name}" data-ra="${item.ra_hours}" data-dec="${item.dec_deg}">
              <div style="padding-right:8px">
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">
                  <strong>${item.common_name}</strong>
                  ${tpoBadge}${b8Badge}
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                  ${item.catalog_ids || item.id} • ${item.constellation || ''} ${item.notes ? `— ${item.notes}` : ''}
                </div>
              </div>
              <div style="text-align:right;white-space:nowrap">
                ${altBadge}
                ${airmassText}
              </div>
            </button>`;
        })
        .join('');

      return `
        <div class="card">
          <div class="seg-bar">
            <button class="seg-btn active" data-subtab="FRAMING">🎯 2A. Push-To Framing</button>
            <button class="seg-btn" data-subtab="FOCUS">🔍 2B. Focus &amp; HFR Aid</button>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg-elevated);padding:10px 12px;border-radius:8px;border:1px solid var(--border-col)">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1">
              <label for="target-quick-pick" style="font-size:12px;font-weight:800;color:var(--accent);letter-spacing:0.04em;white-space:nowrap">
                🎯 TARGET:
              </label>
              ${quickPickHtml}
              <span style="font-size:11px;font-family:monospace;color:var(--text-muted);white-space:nowrap">
                RA ${Number(framing.target_ra_hours).toFixed(2)}h, Dec ${Number(framing.target_dec_deg).toFixed(2)}°
              </span>
            </div>
            <button class="btn btn-sm" data-action="toggle-custom-target">
              ${store.customTargetOpen ? '✕ Close Custom' : '+ Custom RA/Dec'}
            </button>
          </div>

          ${
            store.customTargetOpen
              ? `<div class="kpi-box" style="text-align:left;display:grid;gap:8px">
                   <div style="font-size:11px;font-weight:800;color:var(--text-muted)">ENTER CUSTOM J2000 COORDINATES (DECIMAL OR HH:MM:SS)</div>
                   <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:6px">
                     <input id="custom-name-inp" placeholder="Target Name" value="${store.customTargetName}" />
                     <input id="custom-ra-inp" placeholder="RA (20:59:17)" value="${store.customTargetRa}" />
                     <input id="custom-dec-inp" placeholder="Dec (+44:19:48)" value="${store.customTargetDec}" />
                   </div>
                   <button class="btn btn-sm btn-primary" data-action="apply-custom-target">Set Custom Target</button>
                 </div>`
              : ''
          }

          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input
              id="catalog-search-inp"
              type="search"
              style="flex:1;min-width:180px"
              placeholder="Search M1–M110, NGC, Nebula, Star (e.g. M31, NGC 7000, Orion)..."
              value="${store.catalogSearch}"
            />
            <button class="btn btn-sm ${store.catalogTpo180Only ? 'btn-ok' : ''}" data-action="toggle-tpo180-filter" style="white-space:nowrap">
              ${store.catalogTpo180Only ? '★ TPO 180 Picks Only ✓' : '★ TPO 180 Picks'}
            </button>
            <button class="btn btn-sm ${store.catalogAboveHorizon ? 'btn-active' : ''}" data-action="toggle-horizon-filter" style="white-space:nowrap">
              ${store.catalogAboveHorizon ? 'Above Horizon ✓' : 'All Sky (141 Targets)'}
            </button>
          </div>

          <div class="catalog-list" id="framing-catalog-list">${store.catalogLoading ? '<div style="padding:16px;text-align:center;color:var(--text-muted)">⏳ Updating live altitudes...</div>' : (catRows || `<div style="padding:14px;font-size:12px;color:var(--text-muted);text-align:center">No matching objects found. <button class="btn btn-sm" data-action="toggle-horizon-filter" style="margin-left:6px">${store.catalogAboveHorizon ? 'Show All Sky Targets' : 'Clear Filters'}</button></div>`)}</div>

          <button class="btn btn-lg btn-primary" data-action="frame-solve" ${store.busyAction ? 'disabled' : ''}>
            ${
              store.busyAction === 'frame-solve'
                ? '⏳ EXPOSING &amp; PLATE-SOLVING...'
                : `📸 CAPTURE &amp; PLATE-SOLVE PUSH-TO OFFSET (${store.manualExposure}s @ ISO ${store.manualIso})`
            }
          </button>

          ${
            framing.solved
              ? `<div class="step-banner ${framing.on_target ? 'aligned' : ''}">
                   ${
                     framing.on_target
                       ? `<strong>TARGET CENTERED (${framing.angular_separation_deg}° offset)!</strong> Ready to start your imaging sequence.`
                       : `<strong>Offset to ${framing.target_name}: ${framing.angular_separation_deg}°</strong> — Follow either mount adjustment guide below, then re-solve:`
                   }
                 </div>
                 <div class="kpi-grid kpi-grid-2col-sm">
                   <div class="kpi-box" style="text-align:left">
                     <div class="kpi-label">DEC L-BRACKET (RA / DEC)</div>
                     <div style="font-size:12px;line-height:1.5;font-weight:700">${(framing.instructions_equatorial || []).join('<br/>')}</div>
                   </div>
                   <div class="kpi-box" style="text-align:left">
                     <div class="kpi-label">BALL-HEAD (CAMERA X / Y)</div>
                     <div style="font-size:12px;line-height:1.5;font-weight:700">${(framing.instructions_ballhead || []).join('<br/>')}</div>
                   </div>
                   <div class="kpi-box">
                     <div class="kpi-label">SENSOR ROLL / FOV</div>
                     <div class="kpi-val">${framing.rotation_pa_deg}°</div>
                     <div class="kpi-sub">${framing.fov_x_deg}° × ${framing.fov_y_deg}°</div>
                   </div>
                 </div>`
              : ''
          }

          ${
            isSim && store.showSimControls
              ? `<div style="border-top:1px dashed var(--border-col);padding-top:8px;display:flex;justify-content:space-between;align-items:center">
                   <span style="font-size:11px;color:var(--text-muted)">SIMULATOR TEST RIG:</span>
                   <button class="btn btn-sm" data-action="frame-sim-center">Simulate Slewing Onto Target</button>
                 </div>`
              : ''
          }
        </div>
      `;
    }

    // 2B: FOCUS & HFR AID
    return `
      <div class="card">
        <div class="seg-bar">
          <button class="seg-btn" data-subtab="FRAMING">🎯 2A. Push-To Framing</button>
          <button class="seg-btn active" data-subtab="FOCUS">🔍 2B. Focus &amp; HFR Aid</button>
        </div>

        <div class="step-banner">
          <strong>Hands-Free Focus Loop:</strong> Start the continuous loop and slowly twist the TPO 180mm focus ring until <strong>Median HFR</strong> reaches its lowest value (audio pitch rises as stars sharpen).
        </div>

        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px">
          <button class="btn btn-lg ${focus.loop_running ? 'btn-warn' : 'btn-primary'}" data-action="focus-loop">
            ${focus.loop_running ? '⏹ STOP FOCUS LOOP (RAW)' : '▶ START CONTINUOUS FOCUS LOOP'}
          </button>
          <button class="btn btn-lg" data-action="focus-shot" ${store.busyAction ? 'disabled' : ''}>
            ${store.busyAction === 'focus-shot' ? '⏳ EXPOSING...' : `SINGLE SHOT (${store.manualExposure}s)`}
          </button>
        </div>

        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-label">CURRENT MEDIAN HFR</div>
            <div class="kpi-val">${focus.hfr_median > 0 ? focus.hfr_median.toFixed(2) + 'px' : '--'}</div>
            <div class="kpi-sub">Lower is sharper</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">BEST MIN HFR</div>
            <div class="kpi-val" style="color:var(--ok-col)">${focus.min_hfr_achieved ? focus.min_hfr_achieved.toFixed(2) + 'px' : '--'}</div>
            <div class="kpi-sub"><button class="btn btn-sm" style="min-height:22px;padding:1px 6px;font-size:10px" data-action="focus-reset-min">Reset Min</button></div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">FWHM / STARS</div>
            <div class="kpi-val">${focus.fwhm_arcsec > 0 ? focus.fwhm_arcsec.toFixed(1) + '"' : '--'}</div>
            <div class="kpi-sub">${focus.star_count} stars measured</div>
          </div>
        </div>

        ${renderHfrSparkline(focus.history)}

        <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--text-muted)">
            Sub-frame ROI Mode: <strong>${focus.roi ? '1:1 Center Crop (240px)' : 'Full Sensor Field'}</strong>
          </span>
          <button class="btn btn-sm ${focus.roi ? 'btn-active' : ''}" data-action="focus-toggle-roi">
            ${focus.roi ? 'Disable 1:1 ROI Crop' : 'Enable 1:1 Center ROI Crop'}
          </button>
        </div>

        ${
          isSim && store.showSimControls
            ? `<div style="border-top:1px dashed var(--border-col);padding-top:8px;display:flex;justify-content:space-between;align-items:center">
                 <span style="font-size:11px;color:var(--text-muted)">SIMULATOR TEST RIG:</span>
                 <button class="btn btn-sm" data-action="focus-sim-in">Simulate Turning Focus Ring (-0.5 step)</button>
               </div>`
            : ''
        }
      </div>
    `;
  }

  function renderSequenceTab(sequence, framing) {
    const steps = store.editingSteps || [
      { frame_type: 'Light', exposure_s: 90, iso: '800', total_count: 20, cooldown_s: 2.0 },
    ];
    const totalFrames = steps.reduce((acc, s) => acc + Number(s.total_count || 0), 0);
    const totalSeconds = steps.reduce(
      (acc, s) => acc + Number(s.total_count || 0) * (Number(s.exposure_s || 0) + Number(s.cooldown_s || 0)),
      0
    );
    const isRunning =
      sequence.status === 'RUNNING' ||
      sequence.status === 'PAUSED' ||
      sequence.status === 'AWAITING_INTERLOCK' ||
      sequence.status === 'INTERLOCK_PAUSED';

    const cam = store.state?.camera || {};
    const sys = store.state?.system || {};
    const obs = store.state?.observer || {};
    const camOk = cam.driver_mode === 'gphoto2';
    const clkOk = Boolean(obs.last_synced_at);
    const diskOk = Number(sys.disk_free_gb || 0) >= 2.0;

    let interlockBtnLabel = '✓ READY — RESUME SEQUENCE';
    if (sequence.interlock_type === 'Dark' || sequence.interlock_type === 'Bias') {
      interlockBtnLabel = `✓ LENS CAP IS ON — START ${String(sequence.interlock_type).toUpperCase()} FRAMES`;
    } else if (sequence.interlock_type === 'Flat') {
      interlockBtnLabel = '✓ FLAT PANEL / T-SHIRT READY — START FLATS';
    } else if (sequence.interlock_type === 'Light') {
      interlockBtnLabel = '✓ LENS UNCOVERED &amp; TRACKING ON — START LIGHTS';
    }

    const rowsHtml = steps
      .map(
        (st, idx) => `
        <tr>
          <td>
            <select data-step-idx="${idx}" data-step-field="frame_type">
              ${['Light', 'Dark', 'Flat', 'Bias']
                .map((t) => `<option value="${t}" ${st.frame_type === t ? 'selected' : ''}>${t}</option>`)
                .join('')}
            </select>
          </td>
          <td>
            <input type="number" step="any" min="0.001" data-step-idx="${idx}" data-step-field="exposure_s" value="${st.exposure_s}" />
          </td>
          <td>
            <select data-step-idx="${idx}" data-step-field="iso">
              ${['100', '200', '400', '800', '1600', '3200', '6400']
                .map((iso) => `<option value="${iso}" ${String(st.iso) === iso ? 'selected' : ''}>${iso}</option>`)
                .join('')}
            </select>
          </td>
          <td>
            <input type="number" min="1" max="999" data-step-idx="${idx}" data-step-field="total_count" value="${st.total_count}" />
          </td>
          <td>
            <input type="number" step="0.5" min="0" data-step-idx="${idx}" data-step-field="cooldown_s" value="${st.cooldown_s ?? 2.0}" />
          </td>
          <td style="text-align:right">
            ${
              steps.length > 1
                ? `<button class="btn btn-sm" data-action="seq-remove-step" data-idx="${idx}" title="Remove step">✕</button>`
                : ''
            }
          </td>
        </tr>`
      )
      .join('');

    return `
      <div class="card">
        <div class="card-header">
          <h3>3. .CR3 RAW Sequencer (${sequence.status})</h3>
          <span class="badge badge-raw">Total Plan: ${totalFrames} frames (${formatDuration(totalSeconds)})</span>
        </div>

        ${
          sequence.interlock_required
            ? `<div class="step-banner" style="border-left-color:var(--warn-col);background:var(--warn-bg);display:grid;gap:8px">
                 <div><strong>⚠️ PHYSICAL CALIBRATION INTERLOCK: ${sequence.interlock_type}</strong></div>
                 <div>${sequence.interlock_message}</div>
                 ${
                   sequence.interlock_type === 'Flat'
                     ? (() => {
                         const fEval = evaluateFlatHistogram(store.state?.preview?.histogram);
                         const flatIso = sequence.pending_step_iso || '100';
                         const curExpOpt = PREVIEW_EXP_OPTIONS.find((o) => Number(o.val) === Number(store.manualExposure));
                         const expLabel = curExpOpt ? curExpOpt.label : `${store.manualExposure}s`;
                         return `
                           <div style="background:var(--bg-oled);border:1px solid var(--border-col);border-radius:6px;padding:8px 10px;font-size:12px;display:grid;gap:6px">
                             <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
                               <span><strong>Siril Flat ADU Check (Target 35–55%):</strong> ${fEval.label}</span>
                               <button class="btn btn-sm" data-action="flat-test-shot" ${store.busyAction ? 'disabled' : ''}>
                                 ${store.busyAction === 'flat-test-shot' ? '⏳ Measuring Flat...' : `📸 Test Flat (${expLabel} @ ISO ${flatIso})`}
                               </button>
                             </div>
                             <div style="font-size:11px;color:var(--text-muted)">
                               Adjust <strong>EXP</strong> on the Live Sky Preview bar and tap <strong>Test Flat</strong> until ADU lands in <strong>35–55%</strong>${store.flatCalibratedExp !== null ? ` (Will run Flats at calibrated <strong>${store.flatCalibratedExp}s</strong> ✓)` : ''}.
                             </div>
                           </div>
                         `;
                       })()
                     : ''
                 }
                 <button class="btn btn-lg btn-primary" data-action="seq-confirm-interlock">
                   ${interlockBtnLabel}
                 </button>
               </div>`
            : ''
        }

        <div class="preflight-grid">
          <div class="preflight-pill">
            <span style="color:var(--text-muted)">CAMERA</span>
            <strong style="color:${camOk ? 'var(--ok-col)' : 'var(--warn-col)'}">${camOk ? '🟢 EOS M200' : '⚠️ Simulator'}</strong>
          </div>
          <div class="preflight-pill">
            <span style="color:var(--text-muted)">CLOCK</span>
            <strong style="color:${clkOk ? 'var(--ok-col)' : 'var(--warn-col)'}">${clkOk ? '🟢 Synced' : '⚠️ Tap Clock'}</strong>
          </div>
          <div class="preflight-pill">
            <span style="color:var(--text-muted)">STORAGE</span>
            <strong style="color:${diskOk ? 'var(--ok-col)' : 'var(--accent)'}">${diskOk ? `🟢 ${sys.disk_free_gb} GB` : `⚠️ ${sys.disk_free_gb} GB`}</strong>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-label">ACTIVE STEP</div>
            <div class="kpi-val">${sequence.current_frame_type || 'IDLE'}</div>
            <div class="kpi-sub">${sequence.target_name || framing.target_name}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">COMPLETED</div>
            <div class="kpi-val">${sequence.overall_completed} / ${sequence.overall_total}</div>
            <div class="kpi-sub">Step: ${sequence.current_frame_num}/${sequence.total_step_frames}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">LAST SUB HFR</div>
            <div class="kpi-val">${sequence.last_frame_hfr ? sequence.last_frame_hfr.toFixed(2) + 'px' : '--'}</div>
            <div class="kpi-sub">${sequence.last_saved_file ? 'Saved .CR3 ✓' : 'Ready'}</div>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${
            !isRunning
              ? `<button class="btn btn-lg btn-primary" data-action="seq-start">
                   ▶ SAVE &amp; START .CR3 IMAGING SEQUENCE
                 </button>`
              : `<button class="btn" style="flex:1" data-action="${sequence.status === 'PAUSED' ? 'seq-resume' : 'seq-pause'}">
                   ${sequence.status === 'PAUSED' ? '▶ RESUME SEQUENCE' : '⏸ PAUSE AFTER CURRENT SHOT'}
                 </button>
                 <button class="btn ${store.abortArmed ? 'btn-primary' : ''}" style="flex:1" data-action="seq-abort">
                   ${store.abortArmed ? '⚠️ TAP AGAIN TO CONFIRM ABORT' : '⏹ ABORT SEQUENCE'}
                 </button>`
          }
        </div>

        <div style="border-top:1px solid var(--border-col);padding-top:10px;display:grid;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="font-size:11px;font-weight:800;color:var(--text-muted)">
              1-TAP SKY CONDITION TEMPLATES (FOR TPO 180mm f/4.5 + EOS M200):
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm" data-action="seq-preset-b8-broad" title="60x30s ISO 400 + Darks/Biases/Flats — avoids blowing out Bortle 8 skyglow">
                🏙️ Bortle 8 Broadband (60×30s)
              </button>
              <button class="btn btn-sm" data-action="seq-preset-b8-dual" title="25x120s ISO 800 Bulb for 2-inch Dual-Band Hα/OIII filter in Bortle 8">
                🧪 Bortle 8 Dual-Band Filter (25×120s)
              </button>
              <button class="btn btn-sm" data-action="seq-preset-dark" title="25x90s ISO 800 for Bortle 1–4 Dark Sky sites">
                🌌 Dark Sky (25×90s)
              </button>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-top:2px">
            <div style="font-size:12px;font-weight:800;color:var(--text-muted)">
              SEQUENCE PLAN STEPS (AUTO-SWITCHES TO .CR3 RAW; &gt;30s USES EOS BULB TIMER)
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" data-action="seq-add-step">+ Add Step</button>
              <button class="btn btn-sm ${store.planSavedBanner ? 'btn-ok' : ''}" data-action="seq-save-plan">
                ${store.planSavedBanner ? 'Saved ✓' : 'Save Plan'}
              </button>
            </div>
          </div>

          <div style="overflow-x:auto">
            <table class="step-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Exp (s)</th>
                  <th>ISO</th>
                  <th>Frames</th>
                  <th>Wait (s)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderOffloadTab(system) {
    const sessHtml = (store.sessions || [])
      .map((s) => {
        const isExp = store.expandedSessionId === s.id;
        const frames = s.frames || [];
        const framesListHtml = isExp
          ? `<div style="max-height:210px;overflow-y:auto;border:1px solid var(--border-col);border-radius:8px;margin-top:6px">
               ${frames
                 .map(
                   (f) => `
                   <div class="frame-row ${f.status === 'rejected' ? 'rejected' : ''}">
                     <div>
                       <strong>${f.filename}</strong>
                       <div style="font-size:11px;color:var(--text-muted)">
                         ${f.frame_type} • ${f.exposure_s}s • ISO ${f.iso} • HFR: ${f.hfr_median ? f.hfr_median.toFixed(2) + 'px' : '--'} (${f.star_count ?? 0} stars)
                       </div>
                     </div>
                     <button
                       class="btn btn-sm ${f.status === 'rejected' ? '' : 'btn-ok'}"
                       data-action="frame-cull-toggle"
                       data-session="${s.id}"
                       data-frame="${f.id}"
                       data-next-status="${f.status === 'rejected' ? 'accepted' : 'rejected'}"
                     >
                       ${f.status === 'rejected' ? 'Restore' : 'Keep ✓'}
                     </button>
                   </div>`
                 )
                 .join('')}
             </div>`
          : '';

        const fc = s.frame_counts || {};
        const countsBadge = `Lights: ${fc.light ?? 0} • Darks: ${fc.dark ?? 0} • Flats: ${fc.flat ?? 0} • Biases: ${fc.bias ?? 0}`;

        return `
          <div class="kpi-box" style="text-align:left;display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
              <div>
                <strong style="font-size:14px">${s.target_name}</strong>
                <span style="font-size:11px;color:var(--text-muted);margin-left:6px">(${s.id})</span>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                  ${countsBadge} • Auto-generates <code>siril_stack.ssf</code> (180mm, 3.72µm, SPCC-ready)
                </div>
              </div>
              <span class="badge badge-raw">
                Kept: ${s.accepted_frames} | Rejected: ${s.rejected_frames} | ${s.total_size_mb} MB
              </span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a class="btn btn-sm btn-primary" style="text-decoration:none" href="/api/sessions/${s.id}/download.zip?exclude_rejected=true">
                ⬇ Download Siril ZIP (+ siril_stack.ssf)
              </a>
              <a class="btn btn-sm" style="text-decoration:none" href="/api/sessions/${s.id}/siril_stack.ssf" title="Download custom Siril 1.2+ preprocessing & plate-solve script">
                📜 Siril Script (.ssf)
              </a>
              <button class="btn btn-sm" data-action="sess-toggle-frames" data-session="${s.id}">
                ${isExp ? 'Hide Sub-Frames ▲' : `Inspect / Cull Frames (${frames.length}) ▼`}
              </button>
              <button class="btn btn-sm" data-action="sess-autocull" data-session="${s.id}">
                Auto-Cull Outliers (&gt;2σ)
              </button>
              ${
                s.rejected_frames > 0
                  ? `<button class="btn btn-sm" data-action="sess-purge" data-session="${s.id}">
                       Delete ${s.rejected_frames} Rejected File(s)
                     </button>`
                  : ''
              }
            </div>
            ${framesListHtml}
          </div>`;
      })
      .join('');

    return `
      <div class="card">
        <div class="card-header">
          <h3>4. Sessions, Sub-Frame Culling &amp; Offload</h3>
          <span class="badge">${system.disk_free_gb} GB Free</span>
        </div>

        <div class="kpi-grid kpi-grid-2col-sm">
          <div class="kpi-box" style="text-align:left">
            <div class="kpi-label">WINDOWS WI-FI SHARE (SMB3)</div>
            <div style="font-size:12px;font-family:monospace;font-weight:700;margin-top:2px">\\\\astro.local\\captures</div>
          </div>
          <div class="kpi-box" style="text-align:left">
            <div class="kpi-label">MACOS FINDER (CMD+K)</div>
            <div style="font-size:12px;font-family:monospace;font-weight:700;margin-top:2px">smb://astro.local/captures</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">USB 3.0 EXTERNAL SSD</div>
            ${
              system.usb_drive_mounted
                ? `<button class="btn btn-sm btn-primary" style="width:100%;margin-top:2px" data-action="usb-eject">
                     ⏏ Safe Eject (${system.usb_drive_label || 'USB'})
                   </button>`
                : `<div class="kpi-sub" style="margin-top:4px">Using Pi Storage (No USB Mounted)</div>`
            }
          </div>
        </div>

        ${sessHtml || '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No imaging sessions recorded yet. Start a sequence in Tab 3 to capture .CR3 frames.</div>'}
      </div>
    `;
  }

  function renderDrawer(observer, camera) {
    if (!store.drawerOpen) return '';
    const presetButtons = (store.presets || [])
      .map(
        (p) => `
        <button class="btn btn-sm" data-action="apply-preset" data-lat="${p.latitude_deg}" data-lon="${p.longitude_deg}" data-elev="${p.elevation_m}" data-name="${p.name}">
          📍 ${p.name} (${Number(p.latitude_deg).toFixed(2)}°, ${Number(p.longitude_deg).toFixed(2)}°)
        </button>`
      )
      .join('');

    const nowSec = (store.state?.observer?.clock_offset_s !== undefined)
      ? (Date.now() / 1000 + (store.state.observer.clock_offset_s || 0))
      : (Date.now() / 1000);
    const dNow = new Date(nowSec * 1000);
    const liveUtcStr = dNow.toISOString().substring(11, 19);
    const liveLocalStr = dNow.toLocaleTimeString([], { hour12: false });
    const liveLstStr = computeLst(nowSec, observer.longitude_deg);
    const isClockSynced = observer.last_synced_at !== null && observer.last_synced_at !== undefined;

    return `
      <div class="modal-backdrop" id="drawer-backdrop">
        <div class="modal-drawer">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-col);padding-bottom:10px">
            <h3 style="font-size:16px">Observing Site, Clock &amp; Hardware</h3>
            <button class="btn btn-sm" data-action="close-drawer">✕ Close</button>
          </div>

          <!-- Observatory Clock & Sync Status -->
          <div class="kpi-box" style="text-align:left;display:grid;gap:8px;background:var(--bg-oled);border:1px solid var(--border-col);padding:10px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div class="kpi-label">OBSERVATORY CLOCK &amp; TIME SYNCHRONIZATION</div>
              <span class="badge ${isClockSynced ? 'badge-raw' : 'badge-warn'}" style="${isClockSynced ? 'background:#0e4429;border-color:#3fb950;color:#3fb950;font-weight:700' : ''}">
                ${isClockSynced ? '🟢 CLOCK SYNCED' : '⚠️ SYNC RECOMMENDED'}
              </span>
            </div>
            <div class="kpi-grid" style="grid-template-columns:repeat(3, 1fr);gap:6px">
              <div style="background:var(--bg-card);padding:8px;border-radius:6px;border:1px solid var(--border-col)">
                <div style="font-size:10px;color:var(--text-muted);font-weight:700">PI UTC CLOCK</div>
                <div style="font-size:13px;font-weight:800;font-family:monospace;color:var(--text-main);margin-top:2px" id="drawer-utc-clock">${liveUtcStr} UTC</div>
                <div style="font-size:10px;color:var(--text-muted)">Universal Time</div>
              </div>
              <div style="background:var(--bg-card);padding:8px;border-radius:6px;border:1px solid var(--border-col)">
                <div style="font-size:10px;color:var(--text-muted);font-weight:700">LOCAL TIME</div>
                <div style="font-size:13px;font-weight:800;font-family:monospace;color:var(--text-main);margin-top:2px" id="drawer-local-clock">${liveLocalStr}</div>
                <div style="font-size:10px;color:var(--text-muted)">Device Local</div>
              </div>
              <div style="background:var(--bg-card);padding:8px;border-radius:6px;border:1px solid var(--border-col)">
                <div style="font-size:10px;color:var(--text-muted);font-weight:700">SIDEREAL (LST)</div>
                <div style="font-size:13px;font-weight:800;font-family:monospace;color:var(--accent);margin-top:2px" id="drawer-lst-clock">${liveLstStr}</div>
                <div style="font-size:10px;color:var(--text-muted)">Meridian RA</div>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-muted);flex-wrap:wrap;gap:6px">
              <div>
                Sync Source: <strong style="color:var(--text-main)">${observer.sync_source || 'Browser Clock'}</strong>
                ${observer.clock_offset_s !== undefined ? ` (Delta: ${observer.clock_offset_s > 0 ? '+' : ''}${Number(observer.clock_offset_s).toFixed(2)}s)` : ''}
              </div>
              <button class="btn btn-sm btn-primary" data-action="sync-gps" style="padding:4px 10px">
                ⚡ Sync Clock &amp; GPS Now
              </button>
            </div>
          </div>

          <div style="display:grid;gap:8px">
            <div class="kpi-label">1. SAVED OBSERVING SITE PRESETS</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${presetButtons || '<span style="font-size:12px;color:var(--text-muted)">No saved presets yet.</span>'}
            </div>
          </div>

          <div style="display:grid;gap:8px;border-top:1px solid var(--border-col);padding-top:10px">
            <div class="kpi-label">2. SET SITE COORDINATES &amp; SAVE PRESET</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <label style="font-size:11px">
                Latitude (°N):
                <input id="drawer-lat" type="number" step="0.0001" value="${observer.latitude_deg}" style="margin-top:4px" />
              </label>
              <label style="font-size:11px">
                Longitude (°E):
                <input id="drawer-lon" type="number" step="0.0001" value="${observer.longitude_deg}" style="margin-top:4px" />
              </label>
            </div>
            <input id="drawer-preset-name" placeholder="Preset Name (e.g. Backyard, Dark Sky Park)" value="Backyard" />
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm btn-primary" style="flex:1" data-action="save-site-coords">
                Save Site &amp; Sync UTC Clock
              </button>
              <button class="btn btn-sm" data-action="sync-gps">
                Sync Phone Clock/GPS
              </button>
            </div>
          </div>

          <div style="display:grid;gap:8px;border-top:1px solid var(--border-col);padding-top:10px">
            <div class="kpi-label">3. ASTAP PLATE-SOLVER &amp; CANON USB HARDWARE</div>
            <div class="preflight-pill">
              <span style="color:var(--text-muted)">ASTAP SOLVER (180mm)</span>
              <strong style="color:${store.state?.system?.astap_ready ? 'var(--ok-col)' : 'var(--warn-col)'}">
                ${store.state?.system?.astap_ready ? `🟢 ${store.state.system.astap_status}` : `⚠️ ${store.state?.system?.astap_status || 'Check ASTAP'}`}
              </strong>
            </div>
            <p style="font-size:11px;color:var(--text-muted)">
              If the camera shutter locks up or USB disconnects in the cold, issue a kernel USBDEVFS_RESET:
            </p>
            <button class="btn btn-sm" data-action="usb-reset">
              ⚡ Reset Canon EOS M200 USB Port (Resets: ${camera.usb_reset_count || 0})
            </button>
          </div>

          ${
            camera.driver_mode === 'simulator'
              ? `<div style="display:grid;gap:8px;border-top:1px solid var(--border-col);padding-top:10px">
                   <div class="kpi-label">4. DEVELOPER / SIMULATOR CONTROLS</div>
                   <button class="btn btn-sm ${store.showSimControls ? 'btn-active' : ''}" data-action="toggle-sim-controls">
                     ${store.showSimControls ? 'Hide Simulator Shortcut Buttons' : 'Show Simulator Shortcut Buttons'}
                   </button>
                 </div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  function render() {
    const root = document.getElementById('root');
    if (!root || !store.state) return;

    // Preserve active focus if user is typing in search or input
    const activeEl = document.activeElement;
    const activeId = activeEl ? activeEl.id : null;
    const selStart = activeEl && 'selectionStart' in activeEl ? activeEl.selectionStart : null;

    const { camera, system, observer, pa, framing, focus, sequence, preview } = store.state;
    const isSim = camera.driver_mode === 'simulator';

    let tabHtml = '';
    if (store.activeTab === 'PA') {
      tabHtml = renderPaTab(pa, isSim);
    } else if (store.activeTab === 'FRAME') {
      tabHtml = renderFrameFocusTab(framing, focus, isSim);
    } else if (store.activeTab === 'SEQUENCE') {
      tabHtml = renderSequenceTab(sequence, framing);
    } else if (store.activeTab === 'OFFLOAD') {
      tabHtml = renderOffloadTab(system);
    }

    root.innerHTML = `
      <header class="hud-header">
        <div class="hud-row">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="status-dot ${store.wsConnected && !isSim ? '' : (isSim ? 'sim-mode' : 'offline')}"></span>
            <strong style="font-size:14px;letter-spacing:0.04em">ASTROPI</strong>
            ${
              isSim
                ? `<button class="btn btn-sm btn-warn" data-action="connect-camera" title="Camera in simulator mode. Tap to connect physical Canon M200">
                     ⚡ Connect Camera (Simulator Mode)
                   </button>`
                : `<span class="badge badge-raw" style="background:#0e4429;border-color:#3fb950;color:#3fb950;font-weight:700">
                     🟢 ${camera.model || 'Canon EOS M200 (USB PTP)'}${camera.battery_pct !== undefined ? ` • 🔋 ${camera.battery_pct}%` : ''}
                   </span>`
            }
            <span class="badge ${camera.is_fast_jpg_mode ? 'badge-jpg' : 'badge-raw'}">
              ${camera.is_fast_jpg_mode ? 'FAST JPG (SOLVE)' : 'RAW (.CR3)'}
            </span>
            <span style="font-size:12px;color:var(--text-muted)">
              ${system.disk_free_gb}GB free • ${system.cpu_temp_c}°C • ${system.ram_used_mb}MB RAM
            </span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-sm" data-action="open-drawer" title="Observatory Clock: ${observer.last_synced_at ? 'Synced' : 'Tap to sync'}. Tap to view clock &amp; site settings" style="display:inline-flex;align-items:center;gap:5px;font-family:monospace;font-size:12px;padding:3px 8px">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${observer.last_synced_at ? '#10b981' : '#f59e0b'}"></span>
              <span id="hud-clock-time">${new Date(((store.state?.observer?.clock_offset_s !== undefined) ? (Date.now()/1000 + (store.state.observer.clock_offset_s||0)) : Date.now()/1000) * 1000).toISOString().substring(11, 19)} UTC</span>
            </button>
            <button class="btn btn-sm" data-action="open-drawer">
              📍 Site (${observer.latitude_deg.toFixed(1)}°, ${observer.longitude_deg.toFixed(1)}°)
            </button>
            <button class="btn btn-sm ${store.nightVision ? 'btn-active' : ''}" data-action="toggle-nv">
              ${store.nightVision ? '🔴 RED: ON' : '🌙 NIGHT RED'}
            </button>
          </div>
        </div>
        <div class="exp-bar-wrap" id="exposure-bar-wrap" style="display:${camera.exposing ? 'block' : 'none'}">
          <div style="display:flex;justify-content:space-between;font-size:11px;font-family:monospace;margin-bottom:2px">
            <span>EXPOSING (${camera.shutter_speed} @ ISO ${camera.iso})</span>
            <span id="exposure-bar-text">${camera.exposure_elapsed_s.toFixed(1)}s / ${camera.exposure_total_s.toFixed(1)}s (${camera.exposure_remaining_s.toFixed(1)}s left)</span>
          </div>
          <div class="exp-bar-track">
            <div class="exp-bar-fill" id="exposure-bar-fill" style="width:${camera.exposure_progress_pct}%"></div>
          </div>
        </div>
      </header>

      <nav class="tabs-grid">
        <button class="btn ${store.activeTab === 'PA' ? 'btn-active' : ''}" data-tab="PA">1. POLAR ALIGN</button>
        <button class="btn ${store.activeTab === 'FRAME' ? 'btn-active' : ''}" data-tab="FRAME">2. FRAME &amp; FOCUS</button>
        <button class="btn ${store.activeTab === 'SEQUENCE' ? 'btn-active' : ''}" data-tab="SEQUENCE">3. SEQUENCE (.CR3)</button>
        <button class="btn ${store.activeTab === 'OFFLOAD' ? 'btn-active' : ''}" data-tab="OFFLOAD">4. SESSIONS &amp; OFFLOAD</button>
      </nav>

      ${
        store.notice
          ? `<div style="padding:0 12px">
               <div class="notice-banner ${store.notice.level || 'err'}">
                 <div>
                   <strong>${store.notice.level === 'ok' ? '✓' : '⚠️'}</strong>
                   <span style="margin-left:6px">${store.notice.message}</span>
                 </div>
                 <button class="btn btn-sm" data-action="dismiss-notice" style="min-height:28px;padding:2px 8px">✕</button>
               </div>
             </div>`
          : ''
      }

      <main class="main-grid">
        ${tabHtml}
        <div class="card">
          <div class="card-header">
            <div>
              <strong style="font-size:13px">LIVE SKY PREVIEW</strong>
              <span style="font-size:11px;color:var(--text-muted);margin-left:6px" id="preview-source-fmt">(${preview?.source_format || 'RAW .CR3'})</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:3px">
                <span style="font-size:11px;font-weight:700;color:var(--text-muted)">EXP:</span>
                <select id="preview-exp-sel" class="ctrl-sel">
                  ${PREVIEW_EXP_OPTIONS.map((o) => `<option value="${o.val}" ${Number(store.manualExposure) === Number(o.val) ? 'selected' : ''}>${o.label}</option>`).join('')}
                </select>
              </div>
              <div style="display:flex;align-items:center;gap:3px">
                <span style="font-size:11px;font-weight:700;color:var(--text-muted)">ISO:</span>
                <select id="preview-iso-sel" class="ctrl-sel">
                  ${['100', '200', '400', '800', '1600', '3200', '6400'].map((iso) => `<option value="${iso}" ${store.manualIso == iso ? 'selected' : ''}>${iso}</option>`).join('')}
                </select>
              </div>
              <button class="btn btn-sm ${store.liveLoopRunning ? 'btn-warn' : ''}" data-action="toggle-live-loop" title="Stream live viewfinder from sensor without physical shutter">
                ${store.liveLoopRunning ? '⏹ Stop Live View' : '▶ Live Viewfinder'}
              </button>
              <button id="btn-toggle-stretch" class="btn btn-sm ${preview?.auto_stretched !== false ? 'btn-active' : ''}" data-action="toggle-stretch" title="Toggle PixInsight MTF Auto-Stretch (turn OFF for daylight or Flat frames)">
                ${preview?.auto_stretched !== false ? '✨ Stretch: ON' : 'Stretch: OFF'}
              </button>
              <button class="btn btn-sm ${store.zoom > 1 ? 'btn-active' : ''}" data-action="toggle-zoom" title="Cycle 1x Fit / 2x Zoom / 4x Zoom">
                🔍 ${store.zoom > 1 ? `${store.zoom}x Zoom` : '1x Fit'}
              </button>
              ${store.zoom > 1 ? `<button class="btn btn-sm" data-action="reset-pan" title="Center pan on image">🎯 Center</button>` : ''}
              <button class="btn btn-sm btn-primary" data-action="manual-shot" ${store.busyAction ? 'disabled' : ''}>
                ${store.busyAction === 'manual-shot' ? '⏳ Shooting...' : '📸 Test Shot'}
              </button>
            </div>
          </div>
          ${
            isSim
              ? `<div class="step-banner" style="background:rgba(217,119,6,0.12);border:1px solid #d97706;color:#f59e0b;margin-bottom:8px;font-size:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
                   <span>⚠️ <strong>Simulator Active:</strong> Showing synthetic stars. Turn on Canon M200 in Manual (M) mode.</span>
                   <button class="btn btn-sm btn-warn" data-action="connect-camera" style="white-space:nowrap">⚡ Connect Camera</button>
                 </div>`
              : ''
          }
          <canvas id="sky-canvas" width="960" height="640"></canvas>
          <div id="hist-container">${renderHistogramSvg(preview?.histogram)}</div>
        </div>
      </main>

      ${renderDrawer(observer, camera)}
    `;

    renderPreviewCanvas();

    if (activeId) {
      const restored = document.getElementById(activeId);
      if (restored) {
        restored.focus();
        if (selStart !== null && 'setSelectionRange' in restored) {
          try {
            restored.setSelectionRange(selStart, selStart);
          } catch (_) {}
        }
      }
    }
  }

  // Input listeners for search & sequence step editing
  document.addEventListener('input', async (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'catalog-search-inp') {
      store.catalogSearch = t.value;
      const listEl = document.getElementById('framing-catalog-list');
      if (listEl) {
        const rawTargets = (store.catalog && store.catalog.length > 0) ? store.catalog : DEFAULT_TARGETS;
        const allTargets = enrichCatalogLive(rawTargets);
        let visibleCatalog = allTargets;
        if (store.catalogTpo180Only) {
          visibleCatalog = visibleCatalog.filter(item => item.is_tpo180_pick);
        }
        if (store.catalogAboveHorizon) {
          visibleCatalog = visibleCatalog.filter(item => (item.current_alt_deg ?? 0) >= 5);
        }
        if (store.catalogSearch.trim()) {
          const q = store.catalogSearch.trim().toLowerCase();
          visibleCatalog = visibleCatalog.filter(item =>
            (item.id && item.id.toLowerCase().includes(q)) ||
            (item.common_name && item.common_name.toLowerCase().includes(q)) ||
            (item.catalog_ids && item.catalog_ids.toLowerCase().includes(q)) ||
            (item.constellation && item.constellation.toLowerCase().includes(q))
          );
        }
        const framing = store.state?.framing || {};
        listEl.innerHTML = visibleCatalog.map((item) => {
          const isSel = item.id === framing.target_id || item.common_name === framing.target_name;
          const tpoBadge = item.is_tpo180_pick
            ? `<span class="badge badge-raw" style="font-size:10px;padding:1px 6px;margin-left:4px">★ TPO 180 PICK</span>`
            : '';
          const b8Badge = item.bortle8_badge
            ? `<span class="badge" style="font-size:9px;padding:1px 5px;margin-left:4px">${item.bortle8_badge}</span>`
            : '';
          const altBadge = item.current_alt_deg !== undefined
            ? `<span class="badge" style="font-size:10px">Alt ${item.current_alt_deg}°</span>`
            : '';
          const airmassText = item.airmass
            ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${item.airmass}x airmass</div>`
            : '';
          return `
            <button class="catalog-item ${isSel ? 'selected' : ''}" data-target-id="${item.id}" data-target-name="${item.common_name}" data-ra="${item.ra_hours}" data-dec="${item.dec_deg}">
              <div style="padding-right:8px">
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">
                  <strong>${item.common_name}</strong>
                  ${tpoBadge}${b8Badge}
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                  ${item.catalog_ids || item.id} • ${item.constellation || ''} ${item.notes ? `— ${item.notes}` : ''}
                </div>
              </div>
              <div style="text-align:right;white-space:nowrap">
                ${altBadge}
                ${airmassText}
              </div>
            </button>`;
        }).join('') || `<div style="padding:14px;font-size:12px;color:var(--text-muted);text-align:center">No matching objects found.</div>`;
      }
      return;
    } else if (t.id === 'custom-name-inp') {
      store.customTargetName = t.value;
    } else if (t.id === 'custom-ra-inp') {
      store.customTargetRa = t.value;
    } else if (t.id === 'custom-dec-inp') {
      store.customTargetDec = t.value;
    } else if (t.dataset && t.dataset.stepIdx !== undefined) {
      const idx = Number(t.dataset.stepIdx);
      const field = t.dataset.stepField;
      if (store.editingSteps && store.editingSteps[idx]) {
        store.editingSteps[idx][field] =
          field === 'frame_type' || field === 'iso' ? t.value : Number(t.value);
        store.planSavedBanner = false;
      }
    }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'target-quick-pick') {
      const selectedId = t.value;
      if (selectedId === 'CUSTOM') {
        store.customTargetOpen = true;
        render();
        return;
      }
      const rawTargets = (store.catalog && store.catalog.length > 0) ? store.catalog : DEFAULT_TARGETS;
      const allTargets = enrichCatalogLive(rawTargets);
      const item = allTargets.find((c) => c.id === selectedId);
      if (item) {
        await api('/api/framing/select-target', 'POST', {
          target_id: item.id,
          target_name: item.common_name,
          target_ra_hours: Number(item.ra_hours),
          target_dec_deg: Number(item.dec_deg),
        });
        await refreshAll();
      }
      return;
    }
    if (t.id === 'preview-exp-sel') {
      store.manualExposure = t.value;
      render();
      await api('/api/camera/config', 'POST', { exposure_s: Number(t.value) }).catch(() => {});
    } else if (t.id === 'preview-iso-sel') {
      store.manualIso = t.value;
      render();
      await api('/api/camera/config', 'POST', { iso: t.value }).catch(() => {});
    }
  });

  document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'drawer-backdrop') {
      store.drawerOpen = false;
      render();
      return;
    }
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.tab) {
      store.activeTab = btn.dataset.tab;
      store.abortArmed = false;
      render();
      if (store.activeTab === 'FRAME') {
        loadCatalog().catch(() => {});
      }
      refreshAll().catch(() => {});
      return;
    }
    if (btn.dataset.subtab) {
      store.subTabFrame = btn.dataset.subtab;
      render();
      return;
    }
    if (btn.dataset.targetId) {
      await api('/api/framing/select-target', 'POST', {
        target_id: btn.dataset.targetId,
        target_name: btn.dataset.targetName,
        target_ra_hours: Number(btn.dataset.ra),
        target_dec_deg: Number(btn.dataset.dec),
      });
      await refreshAll();
      return;
    }

    const act = btn.dataset.action;
    if (!act) return;

    if (act === 'dismiss-notice') {
      store.notice = null;
      render();
      return;
    }

    const expVal = Number(store.manualExposure || 2.0);
    const isoVal = String(store.manualIso || '1600');

    try {
      if (act === 'toggle-nv') {
        store.nightVision = !store.nightVision;
        document.documentElement.classList.toggle('night-vision', store.nightVision);
        render();
      } else if (act === 'toggle-stretch') {
        await api('/api/camera/preview-stretch', 'POST', {});
        await refreshAll();
      } else if (act === 'toggle-hist-mode') {
        store.histMode = isFlatHistActive() ? 'LIGHT' : 'FLAT';
        render();
      } else if (act === 'toggle-zoom') {
        if (store.zoom === 1.0) {
          store.zoom = 2.0;
        } else if (store.zoom === 2.0) {
          store.zoom = 4.0;
        } else {
          store.zoom = 1.0;
          store.panX = 0.5;
          store.panY = 0.5;
        }
        render();
        renderPreviewCanvas();
      } else if (act === 'reset-pan') {
        store.panX = 0.5;
        store.panY = 0.5;
        renderPreviewCanvas();
      } else if (act === 'open-drawer') {
        store.drawerOpen = true;
        const pr = await api('/api/system/presets');
        store.presets = pr.presets || [];
        render();
      } else if (act === 'close-drawer') {
        store.drawerOpen = false;
        render();
      } else if (act === 'toggle-sim-controls') {
        store.showSimControls = !store.showSimControls;
        render();
      } else if (act === 'apply-preset') {
        await api('/api/system/location-time', 'PUT', {
          latitude_deg: Number(btn.dataset.lat),
          longitude_deg: Number(btn.dataset.lon),
          elevation_m: Number(btn.dataset.elev || 300),
          client_utc_timestamp: Date.now() / 1000,
          sync_source: `Preset: ${btn.dataset.name}`,
        });
        showNotice(`Site set to ${btn.dataset.name} & UTC clock synced.`, 'ok', 4000);
        await refreshAll();
      } else if (act === 'save-site-coords') {
        const lat = Number(document.getElementById('drawer-lat')?.value ?? 38.8951);
        const lon = Number(document.getElementById('drawer-lon')?.value ?? -77.0364);
        const name = document.getElementById('drawer-preset-name')?.value || 'Custom Site';
        await api('/api/system/presets', 'POST', {
          name,
          latitude_deg: lat,
          longitude_deg: lon,
          make_default: true,
        });
        await api('/api/system/location-time', 'PUT', {
          latitude_deg: lat,
          longitude_deg: lon,
          client_utc_timestamp: Date.now() / 1000,
          sync_source: `Saved: ${name}`,
        });
        const pr = await api('/api/system/presets');
        store.presets = pr.presets || [];
        showNotice(`Saved observing site "${name}" & synced UTC clock.`, 'ok', 4000);
        await refreshAll();
      } else if (act === 'sync-gps') {
        const doSync = async (coords = null) => {
          try {
            const payload = {
              client_utc_timestamp: Date.now() / 1000,
              sync_source: coords ? 'Browser GPS & Clock' : 'Browser Device Clock',
            };
            if (coords) {
              payload.latitude_deg = coords.latitude;
              payload.longitude_deg = coords.longitude;
              if (coords.altitude) payload.elevation_m = coords.altitude;
            }
            await api('/api/system/location-time', 'PUT', payload);
            showNotice(
              coords ? 'Synced GPS coordinates & UTC clock!' : 'Synced UTC clock from device!',
              'ok',
              4000
            );
            await refreshAll();
            loadCatalog().catch(() => {});
          } catch (err) {
            showNotice(`Clock/GPS sync failed: ${err.message}`, 'err');
          }
        };

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => doSync(pos.coords),
            () => doSync(null),
            { timeout: 6000 }
          );
        } else {
          await doSync(null);
        }
      } else if (act === 'connect-camera') {
        store.busyAction = 'connect-camera';
        render();
        const res = await api('/api/camera/connect', 'POST');
        if (res.driver_mode === 'gphoto2') {
          showNotice('Connected to physical Canon EOS M200 via USB PTP!', 'ok', 5000);
        } else {
          const detail = res.last_error ? ` (${res.last_error})` : '';
          showNotice(
            `Canon EOS M200 not detected on USB. Verify camera is ON in Manual ("M") mode with data USB cable.${detail}`,
            'warn',
            12000
          );
        }
        await refreshAll();
      } else if (act === 'toggle-live-loop') {
        if (store.liveLoopRunning) {
          store.liveLoopRunning = false;
          render();
          await api('/api/camera/live-loop/stop', 'POST').catch(() => {});
        } else {
          store.liveLoopRunning = true;
          render();
          await api('/api/camera/live-loop/start', 'POST', { exposure_s: expVal, iso: isoVal }).catch((err) => {
            store.liveLoopRunning = false;
            showNotice(`Live Viewfinder error: ${err.message}`, 'err');
          });
        }
        await refreshAll();
      } else if (act === 'usb-reset') {
        store.busyAction = 'usb-reset';
        render();
        await api('/api/camera/reset-usb', 'POST');
        showNotice('Issued USB port reset to Canon EOS M200.', 'ok', 5000);
        await refreshAll();
      } else if (act === 'manual-shot') {
        store.busyAction = 'manual-shot';
        render();
        await api('/api/camera/capture', 'POST', {
          exposure_s: expVal,
          iso: isoVal,
          fast_jpeg: true,
        });
        await refreshAll();
      } else if (act === 'pa-mode-3') {
        await api('/api/pa/start', 'POST', { mode_points: 3 });
        await refreshAll();
      } else if (act === 'pa-mode-2') {
        await api('/api/pa/start', 'POST', { mode_points: 2 });
        await refreshAll();
      } else if (act === 'pa-capture') {
        store.busyAction = 'pa-capture';
        render();
        if ((store.state.pa.points || []).length < store.state.pa.mode_points) {
          await api('/api/pa/capture-point', 'POST', { exposure_s: expVal, iso: isoVal });
        } else {
          await api('/api/pa/live-step', 'POST', { exposure_s: expVal, iso: isoVal });
        }
        await refreshAll();
      } else if (act === 'pa-loop') {
        if (store.state.pa.loop_running) {
          await api('/api/pa/live-loop/stop', 'POST', { restore_raw: true });
        } else {
          await api('/api/pa/live-loop/start', 'POST', { exposure_s: expVal, iso: isoVal });
        }
        await refreshAll();
      } else if (act === 'pa-sim-align') {
        await api('/api/pa/sim-control', 'POST', {
          d_alt_arcmin: -store.state.pa.alt_error_arcmin * 0.92,
          d_az_arcmin: -store.state.pa.az_error_arcmin * 0.92,
        });
        await refreshAll();
      } else if (act === 'toggle-horizon-filter') {
        store.catalogAboveHorizon = !store.catalogAboveHorizon;
        loadCatalog().catch(() => {});
        render();
      } else if (act === 'toggle-tpo180-filter') {
        store.catalogTpo180Only = !store.catalogTpo180Only;
        loadCatalog().catch(() => {});
        render();
      } else if (act === 'toggle-custom-target') {
        store.customTargetOpen = !store.customTargetOpen;
        render();
      } else if (act === 'apply-custom-target') {
        await api('/api/framing/select-target', 'POST', {
          target_id: 'CUSTOM',
          target_name: store.customTargetName || 'Custom Target',
          target_ra_hours: store.customTargetRa,
          target_dec_deg: store.customTargetDec,
        });
        store.customTargetOpen = false;
        showNotice(`Custom target "${store.customTargetName}" selected.`, 'ok', 4000);
        await refreshAll();
      } else if (act === 'frame-solve') {
        store.busyAction = 'frame-solve';
        render();
        await api('/api/framing/solve', 'POST', { exposure_s: expVal, iso: isoVal });
        await refreshAll();
      } else if (act === 'frame-sim-center') {
        store.busyAction = 'frame-solve';
        render();
        await api('/api/framing/solve', 'POST', { exposure_s: expVal, iso: isoVal, sim_center_on_target: true });
        await refreshAll();
      } else if (act === 'focus-shot') {
        store.busyAction = 'focus-shot';
        render();
        await api('/api/framing/focus-step', 'POST', { exposure_s: expVal, iso: isoVal });
        await refreshAll();
      } else if (act === 'focus-loop') {
        if (store.state.focus.loop_running) {
          await api('/api/framing/focus-loop/stop', 'POST');
        } else {
          await api('/api/framing/focus-loop/start', 'POST', { exposure_s: expVal, iso: isoVal });
        }
        await refreshAll();
      } else if (act === 'focus-reset-min') {
        await api('/api/framing/focus-roi', 'POST', {
          roi: store.state.focus.roi,
          reset_history: true,
        });
        await refreshAll();
      } else if (act === 'focus-toggle-roi') {
        const hasRoi = Boolean(store.state.focus.roi);
        await api('/api/framing/focus-roi', 'POST', {
          clear: hasRoi,
          roi: hasRoi ? null : { x: 0.5, y: 0.5, size: 240 },
        });
        await refreshAll();
      } else if (act === 'focus-sim-in') {
        store.busyAction = 'focus-shot';
        render();
        await api('/api/framing/focus-step', 'POST', { exposure_s: expVal, iso: isoVal, sim_focus_delta: -0.5 });
        await refreshAll();
      } else if (act === 'seq-preset-b8-broad') {
        store.editingSteps = [
          { frame_type: 'Light', exposure_s: 30, iso: '400', total_count: 60, cooldown_s: 1.5 },
          { frame_type: 'Dark', exposure_s: 30, iso: '400', total_count: 20, cooldown_s: 1.0 },
          { frame_type: 'Bias', exposure_s: 0.001, iso: '400', total_count: 30, cooldown_s: 0.5 },
          { frame_type: 'Flat', exposure_s: 0.5, iso: '100', total_count: 20, cooldown_s: 1.0 },
        ];
        store.planSavedBanner = false;
        render();
      } else if (act === 'seq-preset-b8-dual') {
        store.editingSteps = [
          { frame_type: 'Light', exposure_s: 120, iso: '800', total_count: 25, cooldown_s: 2.0 },
          { frame_type: 'Dark', exposure_s: 120, iso: '800', total_count: 10, cooldown_s: 1.0 },
          { frame_type: 'Bias', exposure_s: 0.001, iso: '800', total_count: 25, cooldown_s: 0.5 },
          { frame_type: 'Flat', exposure_s: 1.0, iso: '100', total_count: 20, cooldown_s: 1.0 },
        ];
        store.planSavedBanner = false;
        render();
      } else if (act === 'seq-preset-dark') {
        store.editingSteps = [
          { frame_type: 'Light', exposure_s: 90, iso: '800', total_count: 25, cooldown_s: 2.0 },
          { frame_type: 'Dark', exposure_s: 90, iso: '800', total_count: 10, cooldown_s: 1.0 },
          { frame_type: 'Bias', exposure_s: 0.001, iso: '800', total_count: 25, cooldown_s: 0.5 },
          { frame_type: 'Flat', exposure_s: 0.5, iso: '100', total_count: 20, cooldown_s: 1.0 },
        ];
        store.planSavedBanner = false;
        render();
      } else if (act === 'seq-add-step') {
        if (!store.editingSteps) store.editingSteps = [];
        store.editingSteps.push({
          frame_type: 'Light',
          exposure_s: 90,
          iso: '800',
          total_count: 15,
          cooldown_s: 2.0,
        });
        render();
      } else if (act === 'seq-remove-step') {
        const idx = Number(btn.dataset.idx);
        if (store.editingSteps && store.editingSteps.length > 1) {
          store.editingSteps.splice(idx, 1);
          render();
        }
      } else if (act === 'seq-save-plan') {
        const saved = await api('/api/sequence/plans', 'POST', {
          id: store.editingPlanId,
          name: store.editingPlanName || `${store.state.framing.target_name} Plan`,
          target_name: store.state.framing.target_name,
          target_ra_hours: store.state.framing.target_ra_hours,
          target_dec_deg: store.state.framing.target_dec_deg,
          steps: store.editingSteps,
        });
        store.editingPlanId = saved.id;
        store.planSavedBanner = true;
        await refreshAll();
      } else if (act === 'seq-start') {
        store.busyAction = 'seq-start';
        render();
        const saved = await api('/api/sequence/plans', 'POST', {
          id: store.editingPlanId,
          name: store.editingPlanName || `${store.state.framing.target_name} Plan`,
          target_name: store.state.framing.target_name,
          target_ra_hours: store.state.framing.target_ra_hours,
          target_dec_deg: store.state.framing.target_dec_deg,
          steps: store.editingSteps,
        });
        store.editingPlanId = saved.id;
        await api(`/api/sequence/plans/${saved.id}/start`, 'POST', { reset_progress: true });
        showNotice(`Started .CR3 imaging sequence for ${store.state.framing.target_name}!`, 'ok', 5000);
        await refreshAll();
      } else if (act === 'seq-pause') {
        await api('/api/sequence/pause', 'POST');
        await refreshAll();
      } else if (act === 'seq-resume') {
        await api('/api/sequence/resume', 'POST');
        await refreshAll();
      } else if (act === 'flat-test-shot') {
        store.busyAction = 'flat-test-shot';
        store.histMode = 'FLAT';
        render();
        const flatIso = String(store.state?.sequence?.pending_step_iso || '100');
        await api('/api/camera/capture', 'POST', {
          exposure_s: expVal,
          iso: flatIso,
          fast_jpeg: true,
          auto_stretch: false,
        });
        store.flatCalibratedExp = expVal;
        await refreshAll();
        const fEval = evaluateFlatHistogram(store.state?.preview?.histogram);
        showNotice(`Flat Test (${expVal}s @ ISO ${flatIso}): ${fEval.pct}% ADU — ${fEval.label}`, fEval.ok ? 'ok' : 'warn', 8000);
      } else if (act === 'seq-confirm-interlock') {
        const confirmPayload = {};
        if (store.state?.sequence?.interlock_type === 'Flat' && store.flatCalibratedExp !== null) {
          confirmPayload.exposure_s = Number(store.flatCalibratedExp);
        }
        store.flatCalibratedExp = null;
        if (store.histMode === 'FLAT') store.histMode = 'AUTO';
        await api('/api/sequence/confirm-interlock', 'POST', confirmPayload);
        await refreshAll();
      } else if (act === 'seq-abort') {
        if (!store.abortArmed) {
          store.abortArmed = true;
          render();
          setTimeout(() => {
            store.abortArmed = false;
            render();
          }, 4000);
          return;
        }
        store.abortArmed = false;
        await api('/api/sequence/abort', 'POST');
        showNotice('Imaging sequence aborted & camera restored to RAW (.CR3).', 'warn', 5000);
        await refreshAll();
      } else if (act === 'usb-eject') {
        const r = await api('/api/system/storage/eject', 'POST');
        showNotice(r.message, 'ok', 8000);
        await refreshAll();
      } else if (act === 'sess-toggle-frames') {
        const sid = btn.dataset.session;
        store.expandedSessionId = store.expandedSessionId === sid ? null : sid;
        render();
      } else if (act === 'frame-cull-toggle') {
        const sid = btn.dataset.session;
        const fid = btn.dataset.frame;
        const nextStatus = btn.dataset.nextStatus;
        await api(`/api/sessions/${sid}/frames/${fid}/cull`, 'POST', {
          status: nextStatus,
          reject_reason: nextStatus === 'rejected' ? 'Manual user cull' : '',
        });
        await refreshAll();
      } else if (act === 'sess-autocull') {
        const res = await api(`/api/sessions/${btn.dataset.session}/auto-cull`, 'POST', { hfr_sigma_limit: 2.0 });
        showNotice(`Auto-cull complete: flagged ${res.rejected_count || 0} outlier sub-frame(s).`, 'ok', 5000);
        await refreshAll();
      } else if (act === 'sess-purge') {
        const res = await api(`/api/sessions/${btn.dataset.session}/purge-rejected`, 'POST');
        showNotice(`Deleted ${res.deleted_frames || 0} rejected file(s) (${res.freed_mb || 0} MB freed).`, 'ok', 5000);
        await refreshAll();
      }
    } catch (err) {
      showNotice(err.message || 'Action failed', 'err', 12000);
    } finally {
      if (store.busyAction) {
        store.busyAction = null;
        render();
      }
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  // Automatically sync Raspberry Pi UTC sidereal clock from phone/browser on load (works over plain HTTP!)
  api('/api/system/location-time', 'PUT', {
    client_utc_timestamp: Date.now() / 1000,
    sync_source: 'Auto Clock Sync',
  }).catch(() => {});

  loadCatalog().catch(() => {});
  refreshAll().catch(() => {});
  connectWs();

  // Keep HUD and drawer clocks ticking live every 1 second
  setInterval(() => {
    const nowSec = (store.state?.observer?.clock_offset_s !== undefined)
      ? (Date.now() / 1000 + (store.state.observer.clock_offset_s || 0))
      : (Date.now() / 1000);
    const d = new Date(nowSec * 1000);
    const utcStr = d.toISOString().substring(11, 19);

    const hudEl = document.getElementById('hud-clock-time');
    if (hudEl) hudEl.textContent = `${utcStr} UTC`;

    const dUtc = document.getElementById('drawer-utc-clock');
    if (dUtc) dUtc.textContent = `${utcStr} UTC`;

    const dLoc = document.getElementById('drawer-local-clock');
    if (dLoc) dLoc.textContent = d.toLocaleTimeString([], { hour12: false });

    const dLst = document.getElementById('drawer-lst-clock');
    if (dLst && store.state?.observer?.longitude_deg !== undefined) {
      dLst.textContent = computeLst(nowSec, store.state.observer.longitude_deg);
    }
  }, 1000);
})();

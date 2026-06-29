/*
 * AstroBin Depth Translator - equipment data
 * --------------------------------------------------------------------------
 * Seed table of common gear + Ido's gear. Specs the AstroBin page does not
 * show (sensor QE, filter transmission/bandwidth) live here.
 *
 * QE conventions:
 *   qe_lum  = effective BROADBAND/luminance QE for the whole sensor.
 *             For colour cameras this already bakes in the Bayer light loss.
 *   qe_ha / qe_oiii / qe_sii = NATIVE QE of the pixels sensitive to that line
 *             (e.g. red pixels for Ha). The engine multiplies by the Bayer
 *             AREA fraction for colour sensors (0.25 red, 0.50 green/blue),
 *             and by 1.0 for mono.
 *
 * You can edit this file directly, edit equipment.csv in Excel and import it
 * from the options page, or add gear from the options UI (stored separately
 * in chrome.storage and merged on top of this seed).
 */
(function (root) {
  "use strict";

  // ---- Cameras ----------------------------------------------------------
  const CAMERAS = [
    { model: "ZWO ASI2600MM Pro", type: "mono", bayer: "", pixel_um: 3.76, qe_lum: 0.82, qe_ha: 0.80, qe_oiii: 0.88, qe_sii: 0.78 },
    { model: "ZWO ASI2600MC Pro", type: "color", bayer: "RGGB", pixel_um: 3.76, qe_lum: 0.50, qe_ha: 0.42, qe_oiii: 0.55, qe_sii: 0.40 },
    { model: "ZWO ASI6200MM Pro", type: "mono", bayer: "", pixel_um: 3.76, qe_lum: 0.82, qe_ha: 0.80, qe_oiii: 0.88, qe_sii: 0.78 },
    { model: "ZWO ASI533MC Pro", type: "color", bayer: "RGGB", pixel_um: 3.76, qe_lum: 0.50, qe_ha: 0.45, qe_oiii: 0.55, qe_sii: 0.43 },
    { model: "ZWO ASI294MC Pro", type: "color", bayer: "RGGB", pixel_um: 4.63, qe_lum: 0.48, qe_ha: 0.42, qe_oiii: 0.52, qe_sii: 0.40 },
    { model: "ZWO ASI1600MM Pro", type: "mono", bayer: "", pixel_um: 3.8, qe_lum: 0.55, qe_ha: 0.50, qe_oiii: 0.58, qe_sii: 0.48 },
    { model: "ZWO ASI183MM Pro", type: "mono", bayer: "", pixel_um: 2.4, qe_lum: 0.78, qe_ha: 0.72, qe_oiii: 0.80, qe_sii: 0.70 },
    { model: "ToupTek ATR2600M", type: "mono", bayer: "", pixel_um: 3.76, qe_lum: 0.82, qe_ha: 0.80, qe_oiii: 0.88, qe_sii: 0.78 },
    { model: "ZWO ASI533MM Pro", type: "mono", bayer: "", pixel_um: 3.76, qe_lum: 0.80, qe_ha: 0.78, qe_oiii: 0.85, qe_sii: 0.75 },
    { model: "ZWO ASI533MC Pro (v2)", type: "color", bayer: "RGGB", pixel_um: 3.76, qe_lum: 0.50, qe_ha: 0.45, qe_oiii: 0.55, qe_sii: 0.43 },
    { model: "ZWO ASI294MM Pro", type: "mono", bayer: "", pixel_um: 4.63, qe_lum: 0.75, qe_ha: 0.70, qe_oiii: 0.78, qe_sii: 0.68 },
    { model: "ZWO ASI071MC Pro", type: "color", bayer: "RGGB", pixel_um: 4.78, qe_lum: 0.50, qe_ha: 0.42, qe_oiii: 0.52, qe_sii: 0.40 },
    { model: "ZWO ASI178MM", type: "mono", bayer: "", pixel_um: 2.4, qe_lum: 0.78, qe_ha: 0.72, qe_oiii: 0.80, qe_sii: 0.70 },
    { model: "QHY268M", type: "mono", bayer: "", pixel_um: 3.76, qe_lum: 0.82, qe_ha: 0.80, qe_oiii: 0.88, qe_sii: 0.78 },
    { model: "QHY268C", type: "color", bayer: "RGGB", pixel_um: 3.76, qe_lum: 0.50, qe_ha: 0.42, qe_oiii: 0.55, qe_sii: 0.40 },
    { model: "Player One Poseidon-M", type: "mono", bayer: "", pixel_um: 3.76, qe_lum: 0.82, qe_ha: 0.80, qe_oiii: 0.88, qe_sii: 0.78 },
    { model: "Sony A7 III (stock)", type: "color", bayer: "RGGB", pixel_um: 5.93, qe_lum: 0.45, qe_ha: 0.20, qe_oiii: 0.50, qe_sii: 0.15, note: "stock - blocks most Ha" },
    // ----- Ido's gear -----
    { model: "ToupTek G3M178C", type: "color", bayer: "RGGB", pixel_um: 2.4, qe_lum: 0.42, qe_ha: 0.45, qe_oiii: 0.55, qe_sii: 0.43, aka: "the 178" },
    { model: "Canon EOS R6", type: "color", bayer: "RGGB", pixel_um: 6.56, qe_lum: 0.40, qe_ha: 0.12, qe_oiii: 0.45, qe_sii: 0.10, note: "stock (un-modified) - blocks most Ha" },
    { model: "ZWO ASI120MM Mini", type: "mono", bayer: "", pixel_um: 3.75, qe_lum: 0.60, qe_ha: 0.55, qe_oiii: 0.62, qe_sii: 0.52, note: "guide camera" }
  ];

  // ---- Telescopes / lenses ---------------------------------------------
  const SCOPES = [
    { model: "Askar SQA55", aperture_mm: 55, focal_mm: 264, f_ratio: 4.8 },
    { model: "Stellarvue SVX080T-3SV", aperture_mm: 80, focal_mm: 480, f_ratio: 6.0 },
    { model: "William Optics RedCat 51", aperture_mm: 51, focal_mm: 250, f_ratio: 4.9 },
    { model: "Sky-Watcher Esprit 100ED", aperture_mm: 100, focal_mm: 550, f_ratio: 5.5 },
    { model: "Sky-Watcher Esprit 120ED", aperture_mm: 120, focal_mm: 840, f_ratio: 7.0 },
    { model: "Askar FRA400", aperture_mm: 72, focal_mm: 400, f_ratio: 5.6 },
    { model: "Radian Raptor 61", aperture_mm: 61, focal_mm: 275, f_ratio: 4.5 },
    { model: "Celestron EdgeHD 8", aperture_mm: 203, focal_mm: 2032, f_ratio: 10.0 },
    { model: "William Optics GT81", aperture_mm: 81, focal_mm: 478, f_ratio: 5.9 },
    { model: "William Optics ZenithStar 61", aperture_mm: 61, focal_mm: 360, f_ratio: 5.9 },
    { model: "William Optics RedCat 71", aperture_mm: 71, focal_mm: 350, f_ratio: 4.9 },
    { model: "Sky-Watcher Evostar 72ED", aperture_mm: 72, focal_mm: 420, f_ratio: 5.8 },
    { model: "Askar 120APO", aperture_mm: 120, focal_mm: 840, f_ratio: 7.0 },
    { model: "Sky-Watcher Quattro 200P", aperture_mm: 200, focal_mm: 800, f_ratio: 4.0 },
    { model: "Celestron RASA 8", aperture_mm: 203, focal_mm: 400, f_ratio: 2.0 },
    { model: "Samyang 135mm f/2", aperture_mm: 67, focal_mm: 135, f_ratio: 2.0, note: "camera lens" },
    // ----- Ido's gear -----
    { model: "Sky-Watcher 150PDS", aperture_mm: 150, focal_mm: 750, f_ratio: 5.0, aka: "150PDS (main)" },
    { model: "Sky-Watcher HAC125", aperture_mm: 125, focal_mm: 250, f_ratio: 2.0, aka: "HAC125 (fast)" },
    { model: "Sky-Watcher SkyMax 127", aperture_mm: 127, focal_mm: 1500, f_ratio: 11.8, aka: "the 1500" },
    { model: "Canon EF 100-400 f/4.5-5.6", aperture_mm: 71, focal_mm: 400, f_ratio: 5.6, aka: "the 400 (at 400mm)" },
    { model: "SVBony SV503 60 guide", aperture_mm: 60, focal_mm: 240, f_ratio: 4.0, note: "guide scope" }
  ];

  // ---- Filters ----------------------------------------------------------
  // kind: "broadband" (signal grows with bandwidth) or "line" (emission line)
  // bands: which bands/lines this filter delivers.
  const FILTERS = [
    { model: "Luminance (generic)", kind: "broadband", bands: ["L"], bandwidth_nm: 300, transmission: 0.97 },
    { model: "Astronomik Deep-Sky L", kind: "broadband", bands: ["L"], bandwidth_nm: 300, transmission: 0.97 },
    { model: "Astronomik Deep-Sky R", kind: "broadband", bands: ["R"], bandwidth_nm: 100, transmission: 0.95 },
    { model: "Astronomik Deep-Sky G", kind: "broadband", bands: ["G"], bandwidth_nm: 90, transmission: 0.95 },
    { model: "Astronomik Deep-Sky B", kind: "broadband", bands: ["B"], bandwidth_nm: 90, transmission: 0.92 },
    { model: "Astronomik H-alpha CCD 12nm", kind: "line", bands: ["Ha"], bandwidth_nm: 12, transmission: 0.90 },
    { model: "Astronomik H-alpha 6nm", kind: "line", bands: ["Ha"], bandwidth_nm: 6, transmission: 0.90 },
    { model: "Optolong L-eXtreme", kind: "line", bands: ["Ha", "OIII"], bandwidth_nm: 7, transmission: 0.90, aka: "L-eXtreme (dual-band)" },
    { model: "Optolong L-Ultimate", kind: "line", bands: ["Ha", "OIII"], bandwidth_nm: 3, transmission: 0.90 },
    { model: "Optolong L-Pro", kind: "broadband", bands: ["L"], bandwidth_nm: 180, transmission: 0.90, note: "multi-bandpass broadband" },
    { model: "Antlia 3nm Ha", kind: "line", bands: ["Ha"], bandwidth_nm: 3, transmission: 0.88 },
    { model: "Antlia 3nm OIII", kind: "line", bands: ["OIII"], bandwidth_nm: 3, transmission: 0.88 },
    { model: "Antlia 3nm SII", kind: "line", bands: ["SII"], bandwidth_nm: 3, transmission: 0.88 },
    { model: "ZWO 7nm Ha", kind: "line", bands: ["Ha"], bandwidth_nm: 7, transmission: 0.85 },
    { model: "Chroma 3nm Ha", kind: "line", bands: ["Ha"], bandwidth_nm: 3, transmission: 0.95 },
    { model: "Baader 6.5nm Ha", kind: "line", bands: ["Ha"], bandwidth_nm: 6.5, transmission: 0.90 },
    { model: "Optolong L-eNhance", kind: "line", bands: ["Ha", "OIII"], bandwidth_nm: 10, transmission: 0.90, aka: "L-eNhance (tri-band)" },
    { model: "SVBony SV220 (Ha+OIII 7nm)", kind: "line", bands: ["Ha", "OIII"], bandwidth_nm: 7, transmission: 0.85 },
    { model: "Antlia ALP-T (Ha+OIII 5nm)", kind: "line", bands: ["Ha", "OIII"], bandwidth_nm: 5, transmission: 0.88 },
    { model: "ZWO Duo-Band (Ha+OIII)", kind: "line", bands: ["Ha", "OIII"], bandwidth_nm: 7, transmission: 0.85 },
    { model: "IDAS NBZ (Ha+OIII)", kind: "line", bands: ["Ha", "OIII"], bandwidth_nm: 10, transmission: 0.88 },
    { model: "Optolong UV/IR Cut", kind: "broadband", bands: ["L"], bandwidth_nm: 300, transmission: 0.97, note: "OSC broadband" },
    { model: "Antlia 3nm SHO set", kind: "line", bands: ["Ha", "OIII", "SII"], bandwidth_nm: 3, transmission: 0.88, aka: "Antlia 3nm S/H/O bundle" },
    { model: "ZWO 7nm SHO set", kind: "line", bands: ["Ha", "OIII", "SII"], bandwidth_nm: 7, transmission: 0.85, aka: "ZWO 7nm S/H/O bundle" },
    { model: "ZWO 3nm SHO set", kind: "line", bands: ["Ha", "OIII", "SII"], bandwidth_nm: 3, transmission: 0.90, aka: "ZWO 3nm S/H/O bundle" },
    { model: "Chroma 3nm SHO set", kind: "line", bands: ["Ha", "OIII", "SII"], bandwidth_nm: 3, transmission: 0.95, aka: "Chroma 3nm S/H/O bundle" },
    // ----- Ido's gear -----
    { model: "Optolong L-eXtreme 1.25\"", kind: "line", bands: ["Ha", "OIII"], bandwidth_nm: 7, transmission: 0.90, aka: "Ido's L-eXtreme" },
    // ----- generic widths for the quick radio-button picker -----
    { model: "Generic 3nm narrowband", kind: "line", bands: ["Ha"], bandwidth_nm: 3, transmission: 0.88 },
    { model: "Generic 7nm narrowband", kind: "line", bands: ["Ha"], bandwidth_nm: 7, transmission: 0.88 },
    { model: "No filter / OSC broadband", kind: "broadband", bands: ["L"], bandwidth_nm: 300, transmission: 0.97 }
  ];

  // ---- Bortle -> representative SQM (mag/arcsec^2). Approximate. ---------
  const BORTLE_SQM = {
    "1": 22.0, "2": 21.8, "3": 21.5, "4": 21.2, "4.5": 21.1,
    "5": 20.7, "6": 19.9, "7": 19.0, "8": 18.4, "9": 18.0
  };

  // ---- Reference rig (the universal yardstick). Tunable. ----------------
  // NOTE: only the aperture, sensor QE, filter widths and sky matter - focal
  // length / pixel scale never enter the per-area metric. Change APERTURE
  // here to retune the yardstick.
  const REFERENCE = {
    label: "Reference (203mm / 8\" aperture, ASI2600MM, 7nm NB, Bortle 4, no moon)",
    sky_label: "Bortle 4",
    aperture_mm: 203,
    camera_label: "ASI2600MM",
    camera: { type: "mono", qe_lum: 0.82, qe_ha: 0.80, qe_oiii: 0.88, qe_sii: 0.78 },
    broadband: { bandwidth_nm: 300, transmission: 0.97 },
    narrowband: { bandwidth_nm: 7, transmission: 0.90 },
    sky_sqm: 21.2,
    moon_fraction: 0.0
  };

  // ---- Physical model constants ----------------------------------------
  const CONST = {
    BROADBAND_REF_NM: 300,      // reference width for broadband weighting
    MOON_MAX_DELTA_SQM: 3.0,    // sky brightening at 100% moon (coarse)
    NARROWBAND_SKY_SQM_FLOOR: 21.3, // narrowband rejects skyglow/moon → treat sky as ~dark regardless of Bortle

    BAYER_FRACTION: { Ha: 0.25, SII: 0.25, OIII: 0.50, L: 1.0, R: 0.25, G: 0.50, B: 0.25 },
    PRACTICAL_HOUR_LIMIT: 3000  // beyond this, flag as "not feasible"
  };

  const DATA = { CAMERAS, SCOPES, FILTERS, BORTLE_SQM, REFERENCE, CONST };

  root.ADT_DATA = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof window !== "undefined" ? window : globalThis);

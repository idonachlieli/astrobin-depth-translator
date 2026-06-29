/*
 * AstroBin Depth Translator - page parser
 * --------------------------------------------------------------------------
 * Reads the technical card rendered on an app.astrobin.com image page.
 * Pinned to the real DOM (June 2026): integration lives in
 * <astrobin-image-viewer-acquisition>, equipment in
 * <astrobin-image-viewer-equipment>, sky/pixel-scale in the astrometry header.
 * Every selector has a text-based fallback so a class/markup change degrades
 * gracefully instead of breaking.
 */
(function (root) {
  "use strict";

  const DATA = root.ADT_DATA;

  const BAND_MAP = [
    [/lum|clear|^l\b|luminance|no.?filter|\bnone\b|uv.{0,2}ir|\bosc\b/i, "L"],
    [/^r\b|^red\b/i, "R"],
    [/^g\b|^green\b/i, "G"],
    [/^b\b|^blue\b/i, "B"],
    [/h(?:a|α|ά|-?alpha)|hydrogen/i, "Ha"],
    [/o\s*-?\s*iii|oiii|o3|oxygen/i, "OIII"],
    [/s\s*-?\s*ii|sii|s2|sulphur|sulfur/i, "SII"],
    // duo/tri-band integration rows (one lumped narrowband total) - treat as Ha
    [/multi.?band|duo.?band|dual.?band|tri.?band|\bsho\b|\bhoo\b|\bhso\b/i, "Ha"]
  ];
  function bandFromLabel(label) {
    for (const [re, code] of BAND_MAP) if (re.test(label)) return code;
    return null;
  }

  // "6h 30′" / "2h" / "45′"  -> hours
  function parseDuration(str) {
    if (!str) return null;
    let h = 0;
    const hm = str.match(/(\d+(?:\.\d+)?)\s*h/i);
    const mm = str.match(/(\d+)\s*[′']/);
    if (hm) h += parseFloat(hm[1]);
    if (mm) h += parseFloat(mm[1]) / 60;
    return h || null;
  }
  // "130×180″" -> {count, sec, hours}
  function parseSubs(str) {
    const m = str && str.match(/(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[″"]?/);
    if (!m) return null;
    const count = parseInt(m[1], 10), sec = parseFloat(m[2]);
    return { count, sec, hours: count * sec / 3600 };
  }

  function norm(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function nospace(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function numTokens(s) { return (String(s).match(/\d+/g)) || []; }
  function matchModel(list, pageStr) {
    const p = norm(pageStr), pn = nospace(pageStr);
    if (!p) return null;
    let best = null, bestScore = 0, bestVia = null;
    for (const item of list) {
      const m = norm(item.model), mn = nospace(item.model);
      let score = 0, via = "token";
      // ignore spacing/punctuation first ("G3M 178C" == "G3M178C") - a strong, specific match
      if (pn && mn && (pn.includes(mn) || mn.includes(pn))) { score = Math.min(pn.length, mn.length) * 2; via = "strong"; }
      else if (p.includes(m) || m.includes(p)) { score = Math.min(p.length, m.length); via = "strong"; }
      else {
        const pt = new Set(p.split(" ")), mt = m.split(" ");
        score = mt.filter(t => t.length > 1 && pt.has(t)).join("").length;
        via = "token";
      }
      if (score > bestScore) { bestScore = score; best = item; bestVia = via; }
    }
    // A token match (won on shared brand/family words, not a substring) is trusted
    // only if the page confirms the candidate's model number. If the candidate has
    // a model number the page doesn't share (e.g. "Fluorostar 132" vs "RedCat 51",
    // or "200PDS" vs "150PDS"), reject it so the caller falls back to AstroBin's
    // authoritative spec. Scope: token matches only. A bare substring like
    // "William Optics" can still match via the substring path above; that's
    // acceptable because AstroBin equipment values reliably carry full model names.
    if (best && bestVia === "token") {
      const pN = numTokens(pageStr), mN = numTokens(best.model);
      if (mN.length && !pN.some(n => mN.includes(n))) return null;
    }
    // Even a "strong" substring match is untrustworthy if the page string is too
    // generic to name a model: no digit at all and not an exact full-name match
    // (e.g. a bare "William Optics"). Let the caller use AstroBin's spec instead (#8).
    if (best && !/\d/.test(pageStr) && nospace(pageStr) !== nospace(best.model)) return null;
    return bestScore >= 3 ? best : null;
  }

  function getContainer() {
    return document.querySelector("astrobin-image-viewer-acquisition");
  }

  function parseIntegration() {
    const container = getContainer() || document;
    const tables = Array.from(container.querySelectorAll("table"));
    // choose the table whose rows contain band labels
    let table = null;
    for (const t of tables) {
      const rows = Array.from(t.rows);
      if (rows.some(r => r.cells[0] && bandFromLabel(r.cells[0].textContent || ""))) { table = t; break; }
    }
    const channels = [];
    let totalsMoon = null;
    if (table) {
      for (const row of Array.from(table.rows)) {
        const cells = Array.from(row.cells).map(c => (c.textContent || "").trim());
        if (!cells.length) continue;
        const label = cells[0];
        if (/total/i.test(label)) {
          const mp = cells.join(" ").match(/(\d+)\s*%/);
          if (mp) totalsMoon = parseInt(mp[1], 10) / 100;
          continue;
        }
        const band = bandFromLabel(label);
        if (!band) continue;
        const joined = cells.join("  ");
        const subs = parseSubs(joined);
        const dur = (() => { for (const c of cells) { const d = parseDuration(c); if (d) return d; } return null; })();
        const moonM = joined.match(/(\d+)\s*%/);
        const hours = (subs && subs.hours) || dur;
        const mb = /multi.?band|duo.?band|dual.?band|tri.?band|\bsho\b|\bhoo\b|\bhso\b/i.test(label);
        if (hours) channels.push({ band, hours, moon: moonM ? parseInt(moonM[1], 10) / 100 : null, multiband: mb });
      }
    }
    // fallback: parse flat text if no table matched
    if (!channels.length && container) {
      const text = container.innerText || "";
      const re = /(Lum\/Clear|No\s*filter|UV.{0,2}IR|Clear|Lum|None|OSC|\bR\b|\bG\b|\bB\b|H[aα]|OIII|SII)\s+(\d+)\s*[×x]\s*(\d+)\s*[″"]/gi;
      let m;
      while ((m = re.exec(text))) {
        const band = bandFromLabel(m[1]); if (!band) continue;
        channels.push({ band, hours: parseInt(m[2], 10) * parseFloat(m[3]) / 3600, moon: null });
      }
    }
    return { channels, totalsMoon };
  }

  function parseEquipment() {
    const eq = document.querySelector("astrobin-image-viewer-equipment") || document;
    const out = { telescope: null, camera: null, filters: [] };
    const tables = Array.from(eq.querySelectorAll("table"));
    for (const t of tables) {
      for (const row of Array.from(t.rows)) {
        const label = (row.cells[0] && row.cells[0].textContent || "").trim();
        const valCell = row.cells[1];
        if (!valCell) continue;
        const val = (valCell.textContent || "").trim();
        if (/telescope|optics|lens/i.test(label) && !/guid/i.test(label) && !out.telescope) {
          out.telescope = val.split("\n")[0].trim();
          // camera lenses are telescope-class records; on image pages they link via /telescope/{id}
          const a = valCell.querySelector('a[href*="/telescope/"]') || valCell.querySelector('a[href*="/camera-lens/"]');
          const m = a && (a.getAttribute("href") || a.href || "").match(/(?:telescope|camera-lens)\/(\d+)/);
          if (m) out.telescopeId = m[1];
        } else if (/camera/i.test(label) && !/guid/i.test(label) && !out.camera) {
          out.camera = val.split("\n")[0].trim();
          const a = valCell.querySelector('a[href*="/camera/"]');
          const m = a && (a.getAttribute("href") || a.href || "").match(/camera\/(\d+)/);
          if (m) out.cameraId = m[1];
        } else if (/filter/i.test(label)) {
          const items = Array.from(valCell.querySelectorAll("astrobin-equipment-item-display-name"));
          if (items.length) out.filters = items.map(i => i.textContent.trim());
          else out.filters = val.split("\n").map(s => s.trim()).filter(Boolean);
          const flinks = Array.from(valCell.querySelectorAll('a[href*="/filter/"]'));
          out.filterIds = flinks.map((a) => {
            const m = (a.getAttribute("href") || a.href || "").match(/filter\/(\d+)/);
            return m ? { name: a.textContent.trim(), id: m[1] } : null;
          }).filter(Boolean);
        }
      }
    }
    return out;
  }

  function parseSky() {
    // Search the viewer text for Bortle / SQM / pixel scale.
    const scope = document.querySelector("astrobin-image-viewer") || document.body;
    const text = (scope.innerText || "").replace(/ /g, " ");
    const out = { bortle: null, sqm: null, pixel_scale: null, source: "none" };
    const sqmM = text.match(/SQM[^\d]{0,6}(\d{2}(?:\.\d+)?)/i) || text.match(/(\d{2}\.\d+)\s*mag\s*\/?\s*arc/i);
    if (sqmM) { out.sqm = parseFloat(sqmM[1]); out.source = "sqm"; }
    const bM = text.match(/BORTLE[^\d]{0,6}(\d(?:\.\d)?)/i);
    if (bM) { out.bortle = bM[1]; if (out.source === "none") out.source = "bortle"; }
    const pxM = text.match(/([\d.]+)\s*[″"]\s*\/\s*px/);
    if (pxM) out.pixel_scale = parseFloat(pxM[1]);
    return out;
  }

  // Assemble the engine-ready image object.
  function buildImage() {
    if (!DATA || !root.ADT_ENGINE) return null;     // dependencies not loaded (manifest load order normally guarantees they are)
    const integ = parseIntegration();
    if (!integ.channels.length) return null;        // not an image page / no data
    const equip = parseEquipment();
    const sky = parseSky();

    const scope = matchModel(DATA.SCOPES, equip.telescope);
    const camMatch = matchModel(DATA.CAMERAS, equip.camera);
    const cam = camMatch
      ? Object.assign({ _matched: true }, camMatch)
      : { _matched: false, type: "mono", qe_lum: 0.55, qe_ha: 0.50, qe_oiii: 0.58, qe_sii: 0.48 };

    // filters -> per-band specs
    const filterSpecs = (equip.filters || []).map(fstr => matchModel(DATA.FILTERS, fstr)).filter(Boolean);
    const bandFilter = {};
    filterSpecs.forEach(fs => (fs.bands || []).forEach(bnd => {
      bandFilter[bnd] = { kind: fs.kind, bandwidth_nm: fs.bandwidth_nm, transmission: fs.transmission, model: fs.model };
    }));

    const sqm = sky.sqm != null ? sky.sqm
      : (sky.bortle != null ? root.ADT_ENGINE.bortleToSqm(sky.bortle) : 21.0);

    const channels = integ.channels.map(c => ({
      band: c.band,
      hours: c.hours,
      filter: bandFilter[c.band] || null,
      moon: c.moon != null ? c.moon : integ.totalsMoon,
      multiband: !!c.multiband
    }));
    // image-level moon = average of broadband channel moons (for the sky discount)
    const bbMoons = channels.filter(c => ["L", "R", "G", "B"].includes(c.band) && c.moon != null).map(c => c.moon);
    const moonFraction = bbMoons.length ? bbMoons.reduce((a, b) => a + b, 0) / bbMoons.length
                       : (integ.totalsMoon || 0);

    let pixel_scale = sky.pixel_scale, scaleSource = pixel_scale != null ? "page" : null;
    const focal_mm = scope ? scope.focal_mm : null;
    // no plate-solved scale on the page? compute it from camera pixel size + focal length
    if (pixel_scale == null && cam && cam.pixel_um && focal_mm) { pixel_scale = 206.265 * cam.pixel_um / focal_mm; scaleSource = "derived"; }
    return {
      aperture_mm: scope ? scope.aperture_mm : null,
      focal_mm: focal_mm,
      camera: cam,
      sky_sqm: sqm,
      _skySource: sky.source,
      moon_fraction: moonFraction,
      pixel_scale: pixel_scale,
      _scaleSource: scaleSource,
      channels,
      raw: { telescope: equip.telescope, camera: equip.camera, filters: equip.filters,
             telescopeId: equip.telescopeId, cameraId: equip.cameraId, filterIds: equip.filterIds,
             bortle: sky.bortle, sqm: sky.sqm, scopeMatched: !!scope }
    };
  }

  root.ADT_PARSER = { buildImage, getContainer, parseIntegration, parseEquipment, parseSky, matchModel };
  if (typeof module !== "undefined" && module.exports) module.exports = root.ADT_PARSER;
})(typeof window !== "undefined" ? window : globalThis);

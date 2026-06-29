/*
 * AstroBin Depth Translator - calculation engine
 * --------------------------------------------------------------------------
 * Per-AREA depth model (depth measured per patch of sky, not per pixel).
 *
 *   broadband:  depth  ~  sqrt(t) * aperture * sqrt(QE * T * bandwidth / skyFlux)
 *   line (NB):  depth  ~  sqrt(t) * aperture * sqrt(QE * T / (skyFlux * bandwidth))
 *
 * The target's intrinsic surface brightness is a constant that cancels in any
 * comparison, so it never appears. To match an image's depth in a band:
 *
 *   your_time = ( image_depth / your_coeff )^2
 *
 * Units of the coefficient differ between broadband and line, but we only ever
 * compare like-for-like (same band kind), so the ratio is well defined.
 */
(function (root) {
  "use strict";

  const DATA = root.ADT_DATA || (typeof require !== "undefined" ? require("./equipment.js") : null);
  const C = DATA.CONST;

  const BROADBAND_BANDS = ["L", "R", "G", "B"];
  const isBroadband = (band) => BROADBAND_BANDS.includes(band);

  function skyFlux(sqm) { return Math.pow(10, -0.4 * sqm); }

  function bortleToSqm(bortle) {
    if (bortle == null) return null;
    const key = String(bortle).replace(/[^0-9.]/g, "");
    if (DATA.BORTLE_SQM[key] != null) return DATA.BORTLE_SQM[key];
    const n = Math.round(parseFloat(key));
    return DATA.BORTLE_SQM[String(n)] != null ? DATA.BORTLE_SQM[String(n)] : 21.0;
  }

  // Effective sky SQM after moonlight. Moon brightens broadband only.
  // Moon sky-brightness rises steeply toward full, so we use fraction^2 as a
  // cheap nonlinear proxy (full moon ~ MOON_MAX_DELTA_SQM mag of brightening).
  function effectiveSqm(sqm, moonFraction, broadband) {
    if (!broadband || !moonFraction) return sqm;
    const f = Math.max(0, Math.min(1, moonFraction));
    return sqm - C.MOON_MAX_DELTA_SQM * f * f;
  }

  function qeForBand(cam, band) {
    if (isBroadband(band)) return cam.qe_lum;
    if (band === "Ha") return cam.qe_ha;
    if (band === "OIII") return cam.qe_oiii;
    if (band === "SII") return cam.qe_sii;
    return cam.qe_lum;
  }

  function defaultFilter(band) {
    if (isBroadband(band)) {
      return { kind: "broadband", bandwidth_nm: band === "L" ? 300 : (band === "R" ? 100 : 90),
               transmission: band === "B" ? 0.92 : (band === "L" ? 0.97 : 0.95) };
    }
    return { kind: "line", bandwidth_nm: 7, transmission: 0.90 };
  }

  // Depth-rate coefficient for one band on one rig (depth = coeff * sqrt(hours)).
  function coeff(rig, band, filter) {
    const broadband = isBroadband(band);
    const cam = rig.camera;
    const qeNative = qeForBand(cam, band);
    // Bayer area fraction only applies to EMISSION LINES on colour sensors;
    // broadband colour QE (qe_lum) already bakes in the Bayer loss.
    const bayer = (!broadband && cam.type === "color") ? (C.BAYER_FRACTION[band] || 0.25) : 1.0;
    const qeEff = qeNative * bayer;
    const f = filter || defaultFilter(band);
    let sqmEff = effectiveSqm(rig.sky_sqm, rig.moon_fraction, broadband);
    // Narrowband filters reject most light pollution and moonlight, so a bright
    // broadband sky doesn't translate to a bright narrowband sky - floor it.
    if (!broadband) sqmEff = Math.max(sqmEff, C.NARROWBAND_SKY_SQM_FLOOR);
    const sf = skyFlux(sqmEff);
    if (broadband) {
      return rig.aperture_mm * Math.sqrt((qeEff * f.transmission * f.bandwidth_nm) / sf);
    }
    return rig.aperture_mm * Math.sqrt((qeEff * f.transmission) / (sf * f.bandwidth_nm));
  }

  // Pixel scale (arcsec/px) if focal length & pixel size known.
  function pixelScale(focal_mm, pixel_um) {
    if (!focal_mm || !pixel_um) return null;
    return 206.265 * pixel_um / focal_mm;
  }

  /*
   * Main entry. Returns a structured result.
   *   image: { aperture_mm, camera, sky_sqm, moon_fraction, pixel_scale,
   *            channels: [{band, hours, filter?}] }
   *   userRig: { label, aperture_mm, camera, focal_mm, pixel_um, sky_sqm,
   *              moon_fraction, broadbandFilter?, narrowbandFilter? }
   */
  function compute(image, userRig) {
    const ref = buildReferenceRig();
    const result = { broadband: null, lines: [], reference: { broadband: null, lines: [] },
                     resolution: null, notes: [], headlineReferenceHours: null };

    const bbChannels = image.channels.filter(c => isBroadband(c.band));
    const lineChannels = image.channels.filter(c => !isBroadband(c.band));

    // ===== BROADBAND =====
    if (bbChannels.length) {
      const depths = bbChannels.map(c => {
        const f = c.filter || defaultFilter(c.band);
        return { band: c.band, hours: c.hours, depth: coeff(image, c.band, f) * Math.sqrt(c.hours) };
      });
      const totalBBdepth = Math.sqrt(depths.reduce((s, d) => s + d.depth * d.depth, 0));

      const userBB = userRig.camera.type === "mono"
        ? perChannelTimes(depths, userRig)
        : combinedColorTime(totalBBdepth, userRig);
      const refBBhours = sq(totalBBdepth / coeff(ref, "L",
        { kind: "broadband", bandwidth_nm: ref.broadbandFilter.bandwidth_nm, transmission: ref.broadbandFilter.transmission }));

      result.broadband = {
        imageHours: bbChannels.reduce((s, c) => s + c.hours, 0),
        imageChannels: bbChannels.map(c => ({ band: c.band, hours: c.hours })),
        user: userBB,
        userIsColor: userRig.camera.type === "color"
      };
      result.reference.broadband = { hours: round1(refBBhours) };
      result.headlineReferenceHours = round1(refBBhours);
      if (result.broadband.userIsColor) {
        const apF = sq(image.aperture_mm) / sq(userRig.aperture_mm);
        const userLumT = userRig.broadbandFilter ? userRig.broadbandFilter.transmission : 0.97;
        const effF = (image.camera.qe_lum * 0.97) / (userRig.camera.qe_lum * userLumT);
        result.broadband.calc = { imageHours: result.broadband.imageHours, apThem: image.aperture_mm, apYou: userRig.aperture_mm,
                                  apFactor: apF, effFactor: effF, yourHours: userBB.combinedHours, colorYou: true };
      }
    }

    // ===== NARROWBAND LINES =====
    lineChannels.forEach(c => {
      const f = c.filter || defaultFilter(c.band);
      const depth = coeff(image, c.band, f) * Math.sqrt(c.hours);
      const userNb = bestUserLineFilter(userRig, c.band);
      const userLineCoeff = userNb ? coeff(userRig, c.band, { kind: "line", bandwidth_nm: userNb.bandwidth_nm, transmission: userNb.transmission }) : null;
      let userHours = null, feasible = true, infeasibleReason = null, calc = null;
      if (userLineCoeff == null) {
        feasible = false; infeasibleReason = "no filter covering " + c.band;
      } else {
        userHours = sq(depth / userLineCoeff);
        const apF = sq(image.aperture_mm) / sq(userRig.aperture_mm);
        const bayerThem = image.camera.type === "color" ? (C.BAYER_FRACTION[c.band] || 0.25) : 1;
        const bayerYou = userRig.camera.type === "color" ? (C.BAYER_FRACTION[c.band] || 0.25) : 1;
        const qtThem = qeForBand(image.camera, c.band) * bayerThem * f.transmission;
        const qtYou = qeForBand(userRig.camera, c.band) * bayerYou * userNb.transmission;
        const effF = qtThem / qtYou;
        const envF = userHours / (c.hours * apF * effF);
        calc = { imageHours: c.hours, apThem: image.aperture_mm, apYou: userRig.aperture_mm,
                 apFactor: apF, effFactor: effF, envFactor: envF, colorYou: userRig.camera.type === "color",
                 bayerYou: bayerYou, yourHours: userHours };
        if (userHours > C.PRACTICAL_HOUR_LIMIT) { feasible = false; infeasibleReason = "beyond practical limit"; }
      }
      const refLineCoeff = coeff(ref, c.band,
        { kind: "line", bandwidth_nm: ref.narrowbandFilter.bandwidth_nm, transmission: ref.narrowbandFilter.transmission });
      const refHours = sq(depth / refLineCoeff);

      result.lines.push({ band: c.band, imageHours: c.hours, userHours: round1(userHours), feasible, infeasibleReason, calc, multiband: !!c.multiband, _filter: userNb });
      result.reference.lines.push({ band: c.band, hours: round1(refHours) });
    });

    // note how a multi-line filter behaves: a true dual/tri-band captures its lines
    // together (slowest wins); a SHO set is shot line-by-line, so the times add up
    (userRig.narrowbandFilters || (userRig.narrowbandFilter ? [userRig.narrowbandFilter] : [])).forEach((nb) => {
      if (!nb.bands || nb.bands.length <= 1) return;
      const covered = result.lines.filter(l => l.feasible && nb.bands.includes(l.band));
      if (covered.length <= 1) return;
      if (nb.set) {
        result.notes.push("Your " + (nb.label || "filter set") + " is separate filters (" +
          covered.map(l => l.band).join(", ") + ") shot one at a time, so their times add up.");
      } else {
        const maxH = Math.max.apply(null, covered.map(l => l.userHours));
        result.notes.push("Your " + (nb.label || "dual-band filter") + " captures " +
          covered.map(l => l.band).join(" + ") + " in one exposure - " +
          round1(maxH) + " h covers all of them (limited by the slowest band).");
      }
    });

    // resolution note
    const userScale = pixelScale(userRig.focal_mm, userRig.pixel_um);
    if (userScale && image.pixel_scale) {
      const ratio = image.pixel_scale / userScale;
      result.resolution = { imageScale: round2(image.pixel_scale), userScale: round2(userScale), ratio: round2(ratio) };
    }

    // headline reference-hours = TOTAL across all bands (combined broadband as
    // one group + each narrowband line) - i.e. the whole time the scope spends
    // shooting to reach this image's depth in every band, not just the deepest.
    const allRef = [];
    if (result.reference.broadband) allRef.push(result.reference.broadband.hours);
    result.reference.lines.forEach((l) => allRef.push(l.hours));
    const validRef = allRef.filter((x) => x != null && isFinite(x));
    if (validRef.length) result.headlineReferenceHours = round1(validRef.reduce((a, b) => a + b, 0));
    // split the headline into its broadband vs narrowband parts (for display)
    result.referenceBroadbandHours = result.reference.broadband ? result.reference.broadband.hours : null;
    result.referenceNarrowbandHours = result.reference.lines.length
      ? round1(result.reference.lines.reduce((s, l) => s + (l.hours || 0), 0)) : null;

    // ---- total exposure on YOUR rig (for the table subtotals) ----
    if (result.broadband) {
      result.broadband.userTotalHours = result.broadband.userIsColor
        ? (result.broadband.user && result.broadband.user.combinedHours)
        : round1((result.broadband.user || []).reduce((s, c) => s + (c.hours || 0), 0));
    }
    // Narrowband: lines captured by ONE filter (dual/tri-band) are shot together,
    // so within a filter group the cost is the slowest line; sum across filters.
    const nbGroups = new Map();
    result.lines.forEach((l) => {
      if (!l.feasible || l.userHours == null) return;
      // a true dual/multi-band filter captures its lines in ONE exposure (lines share a
      // group, slowest wins); a filter SET is shot sequentially (each line its own exposure)
      const f = l._filter;
      const key = (f && !f.set) ? f : ("solo:" + l.band);
      nbGroups.set(key, Math.max(nbGroups.get(key) || 0, l.userHours));
    });
    let nbTotal = 0; nbGroups.forEach((v) => { nbTotal += v; });
    result.narrowbandTotalHours = nbGroups.size ? round1(nbTotal) : null;
    const bbT = result.broadband ? result.broadband.userTotalHours : null;
    result.combinedTotalHours = (bbT != null || result.narrowbandTotalHours != null)
      ? round1((bbT || 0) + (result.narrowbandTotalHours || 0)) : null;

    result.confidence = confidence(image, userRig);
    return result;
  }

  function perChannelTimes(depths, userRig) {
    return depths.map(d => {
      const f = userBroadbandFilter(userRig, d.band);
      const cc = coeff(userRig, d.band, f);
      return { band: d.band, hours: round1(sq(d.depth / cc)) };
    });
  }

  function combinedColorTime(totalBBdepth, userRig) {
    const f = userBroadbandFilter(userRig, "L");
    const cc = coeff(userRig, "L", f);
    return { combinedHours: round1(sq(totalBBdepth / cc)) };
  }

  function userBroadbandFilter(userRig, band) {
    if (userRig.broadbandFilter && band === "L") return userRig.broadbandFilter;
    return defaultFilter(band);
  }

  // A rig may carry several narrowband filters. For a given line, use the most
  // efficient filter that covers it (highest coeff = least time).
  function userLineCoeffFor(userRig, band) {
    const f = bestUserLineFilter(userRig, band);
    return f ? coeff(userRig, band, { kind: "line", bandwidth_nm: f.bandwidth_nm, transmission: f.transmission }) : null;
  }
  function bestUserLineFilter(userRig, band) {
    const list = userRig.narrowbandFilters || (userRig.narrowbandFilter ? [userRig.narrowbandFilter] : []);
    let best = null, bestC = -1;
    list.forEach((nb) => {
      if (nb.bands && nb.bands.indexOf(band) === -1) return;
      const c = coeff(userRig, band, { kind: "line", bandwidth_nm: nb.bandwidth_nm, transmission: nb.transmission });
      if (c > bestC) { bestC = c; best = nb; }
    });
    return best;
  }

  function buildReferenceRig() {
    const R = DATA.REFERENCE;
    return {
      label: R.label,
      aperture_mm: R.aperture_mm,
      camera: { type: R.camera.type, qe_lum: R.camera.qe_lum, qe_ha: R.camera.qe_ha,
                qe_oiii: R.camera.qe_oiii, qe_sii: R.camera.qe_sii },
      sky_sqm: R.sky_sqm,
      moon_fraction: R.moon_fraction,
      broadbandFilter: { bandwidth_nm: R.broadband.bandwidth_nm, transmission: R.broadband.transmission },
      narrowbandFilter: { bandwidth_nm: R.narrowband.bandwidth_nm, transmission: R.narrowband.transmission }
    };
  }

  // A check can be fully solid ("ok"), a reasonable approximation ("partial"),
  // or missing ("no"). Partial inputs (e.g. sky from Bortle instead of a logged
  // SQM reading) still count for most of their weight - enough to lift the
  // overall rating, but not all the way to full confidence.
  function chk(label, state, note) {
    const score = state === "ok" ? 1 : (state === "partial" ? 0.75 : 0);
    return { label, state, ok: state === "ok", score, note };
  }

  function confidence(image, userRig) {
    const checks = [];
    const camOk = !!(image.camera && image.camera._matched);
    const camQe = (image.camera && image.camera.qe_lum != null) ? Math.round(image.camera.qe_lum * 100) / 100 : null;
    checks.push(chk("Image camera QE", camOk ? "ok" : "no",
      camOk ? "known" : ("estimated" + (camQe != null ? " (lum QE ≈ " + camQe + ")" : ""))));
    // Sky: a measured SQM is solid; a Bortle class is a good estimate (partial).
    const skyState = image._skySource === "sqm" ? "ok" : (image._skySource === "bortle" ? "partial" : "no");
    checks.push(chk("Sky brightness", skyState,
      skyState === "ok" ? "from SQM" : (skyState === "partial" ? "from Bortle (no SQM)" : "not given")));
    const isBB = (b) => ["L", "R", "G", "B"].includes(b);
    const nbUnmatched = image.channels.some((c) => !isBB(c.band) && !c.filter);
    const anyAssumed = image.channels.some((c) => !c.filter);
    checks.push(chk("Image filters", nbUnmatched ? "no" : "ok",
      nbUnmatched ? "narrowband width assumed" : (anyAssumed ? "broadband standard specs" : "identified")));
    const rigOk = !!(userRig.camera && userRig.aperture_mm);
    checks.push(chk("Your rig specs", rigOk ? "ok" : "no", rigOk ? "complete" : "incomplete"));
    const total = checks.length;
    const score = checks.reduce((s, c) => s + c.score, 0);
    const known = checks.filter((c) => c.state === "ok").length;
    const ratio = score / total;
    let level = "Low";
    if (ratio >= 0.95) level = "High";
    else if (ratio >= 0.8) level = "Medium-High";
    else if (ratio >= 0.5) level = "Medium";
    const flags = checks.filter((c) => c.state !== "ok").map((c) => c.label.toLowerCase() + " " + c.note);
    return { level, known, total, checks, flags };
  }

  const sq = (x) => x * x;
  const round1 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 10) / 10;
  const round2 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;

  const ENGINE = { compute, coeff, skyFlux, bortleToSqm, pixelScale, isBroadband, buildReferenceRig, defaultFilter };
  root.ADT_ENGINE = ENGINE;
  if (typeof module !== "undefined" && module.exports) module.exports = ENGINE;
})(typeof window !== "undefined" ? window : globalThis);
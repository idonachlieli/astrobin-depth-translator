/*
 * AstroBin Depth Translator - content script (orchestration + inline panel)
 * --------------------------------------------------------------------------
 * Panel above the Integration table. Gear setup is inline (click ⚙ gear):
 *  - type-ahead suggestions from the table (no giant dropdowns)
 *  - raw-spec entry (skip picking a model, just give aperture / QE / etc.)
 *  - your own private custom gear (stored locally, appears in suggestions)
 *  - multiple narrowband filters at once, with a per-line result
 */
(function () {
  "use strict";

  const PANEL_ID = "adt-panel";
  let lastImageId = null, rendering = false, renderQueued = false, settingsOpen = false, editingIndex = null;

  // ---- opt-in anonymous analytics (OFF by default) ----
  let analyticsConsent = false, installId = null;
  // Load consent + install id as a promise so track() never fires before init,
  // which would drop early events or send a null install id (#8).
  const analyticsReady = new Promise((res) => {
    try {
      chrome.storage.local.get(["adt_analytics", "adt_install"], (r) => {
        analyticsConsent = !!(r && r.adt_analytics);
        installId = (r && r.adt_install) || ("adt-" + ((self.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Math.random().toString(36).slice(2) + Date.now().toString(36))));
        if (!(r && r.adt_install)) { try { chrome.storage.local.set({ adt_install: installId }); } catch (e) {} }
        res();
      });
    } catch (e) { res(); }
  });
  function track(event, data) {
    const ts = Date.now();                          // stamp the event now; the send may wait for init
    analyticsReady.then(() => {
      if (!analyticsConsent) return;                // nothing leaves the browser unless opted in
      try { chrome.runtime.sendMessage({ type: "adt_track", payload: { id: installId, v: "0.1.1", event: event, ts: ts, data: data || {} } }); } catch (e) {}
    });
  }

  // ---------- storage ----------
  function loadSettings() {
    return new Promise((res) => {
      try { chrome.storage.local.get(["adt_rigs", "adt_active", "adt_custom"], (r) => res(r || {})); }
      catch (e) { res({}); }
    });
  }
  function persistSettings(s, cb) {
    try { chrome.storage.local.set({ adt_rigs: s.adt_rigs, adt_active: s.adt_active, adt_custom: s.adt_custom }, cb || (() => {})); }
    catch (e) { if (cb) cb(); }
  }
  function mergeCustomGear(custom) {
    if (!custom) return;
    ["CAMERAS", "SCOPES", "FILTERS"].forEach((k) => {
      (custom[k] || []).forEach((item) => {
        if (!window.ADT_DATA[k].some((x) => x.model === item.model)) window.ADT_DATA[k].push(Object.assign({ _custom: true }, item));
      });
    });
  }

  function defaultRig() {
    return {
      label: "Celestron 8″ + 2600MM + 3nm SHO", scopeModel: "Celestron EdgeHD 8", aperture_mm: 203, focal_mm: 2032,
      cameraModel: "ZWO ASI2600MM Pro", cameraType: "mono", pixel_um: 3.76, qe_lum: 0.82,
      broadbandFilterModel: "",
      narrowbandFilterModels: ["ZWO 3nm SHO set"],
      sky_bortle: "4", sky_sqm: null, moonless: true
    };
  }
  function find(list, model) {
    const m = (model || "").trim().toLowerCase();
    if (!m) return null;
    const exact = list.find((x) => (x.model || "").trim().toLowerCase() === m);
    if (exact) return exact;
    const mn = m.replace(/[^a-z0-9]/g, "");                 // tolerate spacing/punctuation ("ZWO 7nm SHO set" == "ZWO7nmSHOset"), but 3nm != 7nm
    return list.find((x) => (x.model || "").toLowerCase().replace(/[^a-z0-9]/g, "") === mn) || null;
  }

  function buildUserRig(spec) {
    const D = window.ADT_DATA;
    const scope = spec.scopeModel ? find(D.SCOPES, spec.scopeModel) : null;
    const cam = spec.cameraModel ? find(D.CAMERAS, spec.cameraModel) : null;
    const bb = spec.broadbandFilterModel ? find(D.FILTERS, spec.broadbandFilterModel) : null;
    const nbModels = (spec.narrowbandFilterModels && spec.narrowbandFilterModels.length)
      ? spec.narrowbandFilterModels : (spec.narrowbandFilterModel ? [spec.narrowbandFilterModel] : []);
    const narrowbandFilters = nbModels.map((m) => find(D.FILTERS, m)).filter(Boolean)
      .map((f) => ({ bands: f.bands, bandwidth_nm: f.bandwidth_nm, transmission: f.transmission, label: f.aka || f.model,
        // a "set"/"bundle" (e.g. SHO) is separate filters shot one at a time - NOT a single
        // dual/tri-band that captures multiple lines in one exposure. Flag it so the engine
        // sums its lines instead of taking the slowest.
        set: !!(f.set || (f.kind === "line" && f.bands && f.bands.length >= 3) || /\b(set|bundle)\b/i.test((f.model || "") + " " + (f.aka || ""))) }));
    const sqm = spec.sky_sqm != null ? spec.sky_sqm
      : (spec.sky_bortle != null ? window.ADT_ENGINE.bortleToSqm(spec.sky_bortle) : 21.0);
    return {
      label: spec.label || "your rig",
      aperture_mm: spec.aperture_mm || (scope ? scope.aperture_mm : null),
      focal_mm: spec.focal_mm || (scope ? scope.focal_mm : null),
      pixel_um: spec.pixel_um || (cam ? cam.pixel_um : null),
      camera: cam ? { type: cam.type, qe_lum: cam.qe_lum, qe_ha: cam.qe_ha, qe_oiii: cam.qe_oiii, qe_sii: cam.qe_sii }
                  : { type: spec.cameraType || "color",
                      qe_lum: spec.qe_lum || 0.42, qe_ha: spec.qe_ha || 0.45,
                      qe_oiii: spec.qe_oiii || 0.55, qe_sii: spec.qe_sii || 0.43 },
      sky_sqm: sqm,
      moon_fraction: spec.moonless ? 0 : (spec.moon_fraction || 0),
      broadbandFilter: bb ? { bandwidth_nm: bb.bandwidth_nm, transmission: bb.transmission } : null,
      narrowbandFilters: narrowbandFilters
    };
  }

  // ---------- dom helpers ----------
  const fmtH = (h) => {
    if (h == null || !isFinite(h)) return "-";
    const mins = h * 60;
    if (mins < 1) return "<1 min";
    if (h < 1) return Math.round(mins) + " min";
    if (h < 100) { const H = Math.floor(h), M = Math.round((h - H) * 60); return M ? (H + "h " + M + "m") : (H + " h"); }
    return Math.round(h) + " h";
  };
  const f1 = (x) => (x >= 10 ? String(Math.round(x)) : (x >= 1 ? x.toFixed(1) : x.toFixed(2)));
  const FORMULA =
    "full model (depth per patch of sky):\n" +
    "  broadband:     depth = aperture × √( t · QE · T · bandwidth ÷ sky )\n" +
    "  emission line: depth = aperture × √( t · QE · T ÷ (sky · bandwidth) )\n" +
    "  where sky = 10^(−0.4 · SQM),  coeff = depth ÷ √t\n" +
    "  to match an image:  your_time = ( their_depth ÷ your_coeff )²\n" +
    "the √t and aperture² cancel when you divide the two rigs' coeffs, leaving:\n" +
    "your time = image time × (their ÷ your aperture)² × sensor+filter efficiency × (sky+bandwidth)";
  function calcTip(calc) {
    if (!calc) return FORMULA;
    const parts = ["image " + fmtH(calc.imageHours),
      "aperture " + calc.apThem + "→" + calc.apYou + " mm (×" + f1(calc.apFactor) + ")"];
    if (calc.effFactor != null) parts.push("sensor+filter (×" + f1(calc.effFactor) + (calc.colorYou && calc.bayerYou ? ", color Bayer 1/" + Math.round(1 / calc.bayerYou) : "") + ")");
    if (calc.envFactor != null) parts.push("(sky+bandwidth ×" + f1(calc.envFactor) + ")");
    return FORMULA + "\n" + fmtH(calc.yourHours) + " = " + parts.join(" × ");
  }
  // el() is safe by default: text goes in as textContent (no HTML injection).
  // Use htmlEl() only for the few places that deliberately build trusted markup.
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function htmlEl(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function input(type, val) { const i = document.createElement("input"); i.type = type; i.className = "adt-input"; if (val != null && val !== "") i.value = val; return i; }
  function combo(listId, val, ph) { const i = input("text", val); i.setAttribute("list", listId); if (ph) i.placeholder = ph; return i; }
  function opt(v, l, sel) { const o = document.createElement("option"); o.value = v; o.textContent = l; if (sel) o.selected = true; return o; }
  function selectEl(pairs, selected, ph) {
    const s = document.createElement("select"); s.className = "adt-input";
    if (ph != null) s.appendChild(opt("", ph, !selected));
    pairs.forEach(([v, l]) => s.appendChild(opt(v, l, v === selected)));
    return s;
  }
  function datalistEl(id) { const d = document.createElement("datalist"); d.id = id; return d; }
  function fillDatalist(dl, items, labelFn) {
    dl.innerHTML = "";
    items.forEach((x) => { const o = document.createElement("option"); o.value = x.model; const lab = labelFn ? labelFn(x) : ""; if (lab) o.label = lab; dl.appendChild(o); });
  }
  function simpleRow(label, valueHtml, warn, title, extraCls) {
    const tr = el("tr", ((warn ? "adt-warn " : "") + (extraCls || "")).trim());
    if (title) tr.title = title;
    tr.appendChild(el("td", "adt-cell-label", label));
    tr.appendChild(htmlEl("td", "adt-cell-val", valueHtml));
    return tr;
  }
  function escapeHtml(s) { return (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  // Validate/clamp custom gear before it is saved (#3): bad values (negative
  // aperture, QE > 1, bandwidth 0, unknown type/bands) would otherwise flow into
  // the math and produce NaN / Infinity / nonsense estimates. Returns an error
  // string to show the user, or null if the item is acceptable.
  const ADT_BANDS = ["L", "R", "G", "B", "Ha", "OIII", "SII"];
  function validateGear(cat, item) {
    const bad = (k) => item[k] != null && !(item[k] > 0);            // present but not a positive number (also catches NaN)
    const frac = (k) => item[k] != null && !(item[k] > 0 && item[k] <= 1);
    if (cat === "CAMERAS") {
      if (item.type != null) { if (!/^(color|mono)$/i.test(item.type)) return 'Camera type must be "color" or "mono".'; item.type = item.type.toLowerCase(); }
      if (bad("pixel_um")) return "Pixel size must be a positive number (µm).";
      for (const q of ["qe_lum", "qe_ha", "qe_oiii", "qe_sii"]) if (frac(q)) return "QE values must be between 0 and 1 (e.g. 0.80).";
    } else if (cat === "SCOPES") {
      if (bad("aperture_mm")) return "Aperture must be a positive number (mm).";
      if (bad("focal_mm")) return "Focal length must be a positive number (mm).";
      if (bad("f_ratio")) return "f-ratio must be a positive number.";
    } else if (cat === "FILTERS") {
      if (item.kind != null) { if (!/^(broadband|line)$/i.test(item.kind)) return 'Filter kind must be "broadband" or "line".'; item.kind = item.kind.toLowerCase(); }
      if (item.bands && item.bands.some((b) => !ADT_BANDS.includes(b))) return "Bands must be from: " + ADT_BANDS.join(", ") + ".";
      if (bad("bandwidth_nm")) return "Bandwidth must be a positive number (nm).";
      if (frac("transmission")) return "Transmission must be between 0 and 1.";
    }
    for (const k in item) if (typeof item[k] === "number" && !isFinite(item[k])) return '"' + k + '" is not a valid number.';
    return null;
  }
  // Validate the main rig fields on "Save & apply" too (#7) - the custom-gear
  // mini-form isn't the only way bad numbers reach the engine.
  function validateRigInputs(v) {
    if (!(v.aperture_mm > 0)) return "Aperture must be a positive number (mm).";
    if (isFinite(v.focal_mm) && !(v.focal_mm > 0)) return "Focal length must be a positive number (mm).";
    if (isFinite(v.pixel_um) && !(v.pixel_um > 0)) return "Pixel size must be a positive number (µm).";
    if (isFinite(v.qe_lum) && !(v.qe_lum > 0 && v.qe_lum <= 1)) return "Camera QE must be between 0 and 1 (e.g. 0.80).";
    if (v.sky_bortle != null && isFinite(v.sky_bortle) && !(v.sky_bortle >= 1 && v.sky_bortle <= 9)) return "Bortle must be between 1 and 9.";
    if (v.sky_sqm != null && !(v.sky_sqm >= 15 && v.sky_sqm <= 23)) return "SQM must be between 15 and 23 (mag/arcsec²).";
    return null;
  }
  function forceRerender() { lastImageId = null; const e = document.getElementById(PANEL_ID); if (e) e.remove(); render(); }

  // ---------- credit + optional support ----------
  // Donations use PayPal's own hosted PayPal.Me page (HTTPS), opened in a new tab.
  // No payment is handled inside the extension and no extra permissions are needed.
  const PAYPAL_USER = "IdoNachlieli";
  function buildCredit() {
    const box = el("div", "adt-credit-wrap");
    const row = el("div", "adt-credit");
    row.appendChild(el("span", "adt-by", "Made by Ido Nachlieli"));
    const contact = el("a", "adt-support adt-contact", "✉ Contact");
    contact.href = "mailto:ido@nachlieli.net?subject=AstroBin%20Depth%20Translator";
    contact.target = "_blank"; contact.rel = "noopener noreferrer";
    contact.title = "Questions, bugs or ideas - email me";
    row.appendChild(contact);
    const sup = el("span", "adt-support", "♥ Support");
    sup.title = "If this is useful, you can chip in to keep it maintained - entirely optional.";
    row.appendChild(sup);
    box.appendChild(row);

    const donate = el("div", "adt-donate"); donate.style.display = "none";
    donate.appendChild(el("span", "adt-donate-lbl", "Keep it maintained & growing:"));
    const mk = (amt, label) => {
      const a = document.createElement("a");
      a.className = "adt-donate-btn" + (amt ? "" : " adt-donate-other");
      a.textContent = label;
      a.href = "https://www.paypal.com/paypalme/" + PAYPAL_USER + (amt ? "/" + amt + "USD" : "");
      a.target = "_blank"; a.rel = "noopener noreferrer";
      return a;
    };
    [["5", "$5"], ["10", "$10"], ["15", "$15"]].forEach(([a, l]) => donate.appendChild(mk(a, l)));
    donate.appendChild(mk("", "Other"));
    box.appendChild(donate);

    sup.addEventListener("click", () => {
      const open = donate.style.display === "none";
      donate.style.display = open ? "flex" : "none";
      sup.classList.toggle("adt-support-open", open);
    });
    return box;
  }

  // ---------- per-pixel match planner ----------
  // Detail (arcsec/pixel) is set by pixel size and focal length only. Time to
  // match the image's per-pixel depth = your per-area total, scaled by aperture
  // (time grows as 1/aperture^2) and by how your sampling compares to the image's
  // (time grows as (image scale / your scale)^2). Matching the image's scale is
  // the efficient point; going finer costs time without adding real detail.
  function buildPerPixel(image, userRig, baseHours) {
    const SEEING = 2.5; // representative typical seeing, arcsec
    const wrap = el("div", "adt-pp");
    const toggle = el("div", "adt-pp-toggle");
    const tTitle = el("div", "adt-pp-title", "▸  Could your gear capture this detail?");
    toggle.appendChild(tTitle);
    toggle.appendChild(el("div", "adt-pp-sub", "Per-pixel: what scope or camera reproduces this image's detail at 1:1 on your sensor, and how long it would take."));
    wrap.appendChild(toggle);
    const body = el("div", "adt-pp-body"); body.style.display = "none";
    wrap.appendChild(body);
    toggle.addEventListener("click", function () {
      const open = body.style.display === "none";
      body.style.display = open ? "" : "none";
      tTitle.textContent = (open ? "▾  " : "▸  ") + "Could your gear capture this detail?";
    });

    const imgScale = image.pixel_scale || null;
    const pixel = userRig.pixel_um || null;
    if (!imgScale || !pixel) {
      body.appendChild(el("div", "adt-set-hint", !imgScale
        ? "This image doesn't list a pixel scale, so 100% matching isn't available here."
        : "Add your camera's pixel size (under ⚙ gear) to use per-pixel matching."));
      return wrap;
    }

    const rigAp = Math.round(userRig.aperture_mm || 150);
    const rigFocal = Math.round(userRig.focal_mm || rigAp * 5);
    const imageTotal = (image.channels || []).reduce(function (s, c) { return s + (c.hours || 0); }, 0);
    let focal = rigFocal, aperture = rigAp, fratio = focal / aperture, locked = "aperture";

    body.appendChild(el("div", "adt-pp-hint",
      "How big a target looks at 100% (1:1) depends only on focal length and pixel size. Set a hypothetical scope/camera below and it tells you whether it matches this image's detail, and the integration time to reach the same result."));
    body.appendChild(el("div", "adt-pp-img",
      "This image: " + imgScale.toFixed(2) + "″/px" +
      (imageTotal ? "  ·  shot in " + fmtH(imageTotal) : "") +
      "   ·   your camera: " + pixel + " µm"));

    const SPECS = {
      focal: { label: "Focal (mm)", min: 50, max: 4000, dec: 0, btnStep: 5, split: { at: 1500, frac: 0.80 } },
      aperture: { label: "Aperture (mm)", min: 30, max: 600, expo: false, dec: 0 },
      fratio: { label: "f-ratio", min: 1, max: 20, expo: false, dec: 1 }
    };
    function clampSp(v, sp) { return Math.max(sp.min, Math.min(sp.max, v)); }
    function valToS(v, sp) {
      v = clampSp(v, sp);
      if (sp.split) {                         // linear up to split.at (takes split.frac of the bar), exponential above
        const a = sp.split.at, f = sp.split.frac;
        return v <= a ? 1000 * f * (v - sp.min) / (a - sp.min)
                      : 1000 * (f + (1 - f) * Math.log(v / a) / Math.log(sp.max / a));
      }
      return sp.expo ? 1000 * Math.log(v / sp.min) / Math.log(sp.max / sp.min) : 1000 * (v - sp.min) / (sp.max - sp.min);
    }
    function sToVal(s, sp) {
      if (sp.split) {
        const a = sp.split.at, f = sp.split.frac, t = s / 1000;
        return t <= f ? sp.min + (a - sp.min) * (t / f)
                      : a * Math.pow(sp.max / a, (t - f) / (1 - f));
      }
      return sp.expo ? sp.min * Math.pow(sp.max / sp.min, s / 1000) : sp.min + (sp.max - sp.min) * s / 1000;
    }
    function fmtVal(v, sp) { return sp.dec ? v.toFixed(sp.dec) : String(Math.round(v)); }
    const getV = { focal: function () { return focal; }, aperture: function () { return aperture; }, fratio: function () { return fratio; } };
    const setV = { focal: function (v) { focal = v; }, aperture: function (v) { aperture = v; }, fratio: function (v) { fratio = v; } };

    function applyConstraint(changed) {
      if (locked === "aperture") {
        if (changed === "focal") fratio = focal / aperture;
        else if (changed === "fratio") focal = aperture * fratio;
      } else if (locked === "focal") {
        if (changed === "aperture") fratio = focal / aperture;
        else if (changed === "fratio") aperture = focal / fratio;
      } else {
        if (changed === "focal") aperture = focal / fratio;
        else if (changed === "aperture") focal = aperture * fratio;
      }
    }

    const rows = {};
    const rigVal = { focal: rigFocal, aperture: rigAp, fratio: rigFocal / rigAp };
    function makeRow(key) {
      const sp = SPECS[key];
      const row = el("div", "adt-pp-row");
      row.appendChild(el("span", "adt-pp-lbl", sp.label));
      const sld = document.createElement("input"); sld.type = "range"; sld.min = "0"; sld.max = "1000"; sld.step = "1"; sld.className = "adt-pp-slider";
      const minus = el("button", "adt-pp-arrow", "−");
      const num = document.createElement("input"); num.type = "number"; num.className = "adt-pp-num"; num.step = sp.dec ? "0.1" : "1";
      const plus = el("button", "adt-pp-arrow", "+");
      const reset = el("span", "adt-pp-rrst", "↻"); reset.title = "Reset to your rig's value";
      const lock = el("span", "adt-pp-lock", ""); lock.title = "Hold this value fixed";
      row.appendChild(sld); row.appendChild(minus); row.appendChild(num); row.appendChild(plus); row.appendChild(reset); row.appendChild(lock);
      body.appendChild(row);
      function edited() { applyConstraint(key); refresh(); }
      sld.addEventListener("input", function () { setV[key](clampSp(sToVal(parseFloat(sld.value), sp), sp)); edited(); });
      num.addEventListener("input", function () { const v = parseFloat(num.value); if (isFinite(v)) { setV[key](clampSp(v, sp)); edited(); } });
      minus.addEventListener("click", function () { setV[key](clampSp(getV[key]() - (sp.btnStep || (sp.dec ? 0.1 : 1)), sp)); edited(); });
      plus.addEventListener("click", function () { setV[key](clampSp(getV[key]() + (sp.btnStep || (sp.dec ? 0.1 : 1)), sp)); edited(); });
      reset.addEventListener("click", function () { if (locked === key) return; setV[key](clampSp(rigVal[key], sp)); edited(); });
      lock.addEventListener("click", function () { locked = key; refresh(); });
      rows[key] = { sp: sp, sld: sld, num: num, minus: minus, plus: plus, reset: reset, lock: lock };
    }
    ["focal", "aperture", "fratio"].forEach(makeRow);

    const reset = el("button", "adt-pp-reset", "↻ reset to my gear");
    reset.addEventListener("click", function () { focal = rigFocal; aperture = rigAp; fratio = focal / aperture; locked = "aperture"; refresh(); });
    body.appendChild(reset);

    const out = el("div", "adt-pp-out"); body.appendChild(out);

    function refresh() {
      ["focal", "aperture", "fratio"].forEach(function (key) {
        const r = rows[key], v = getV[key]();
        r.num.value = fmtVal(v, r.sp);
        r.sld.value = String(Math.round(valToS(v, r.sp)));
        const isLocked = locked === key;
        r.lock.textContent = isLocked ? "🔒" : "🔓";
        r.lock.className = "adt-pp-lock" + (isLocked ? " adt-pp-locked" : "");
        r.reset.className = "adt-pp-rrst" + (isLocked ? " adt-pp-rrst-off" : "");
        [r.sld, r.num, r.minus, r.plus].forEach(function (e) { e.disabled = isLocked; });
      });
      const yourScale = 206.265 * pixel / focal;
      const eff = Math.max(yourScale, SEEING);
      const ratio = imgScale / yourScale;          // >1 means you sample FINER than the image
      const rel = ratio > 1.1 ? (ratio.toFixed(2) + "x finer than this image")
        : (ratio < 0.9 ? ((1 / ratio).toFixed(2) + "x coarser than this image") : "same detail as this image");
      const matchFocal = Math.round(206.265 * pixel / imgScale);
      const altPixel = (imgScale * focal / 206.265).toFixed(1);
      const haveT = baseHours != null && isFinite(baseHours);
      const Tmatch = haveT ? baseHours * (rigAp / aperture) * (rigAp / aperture) : null;   // match the image's own scale
      const There = haveT ? Tmatch * ratio * ratio : null;                                  // at the current focal's finer/coarser scale
      out.innerHTML = "";
      out.appendChild(htmlEl("div", "adt-pp-line",
        "Your sampling here: <b>" + yourScale.toFixed(2) + "″/px</b> (feels like ~" + eff.toFixed(1) + "″ in typical seeing) · " + rel));
      out.appendChild(htmlEl("div", "adt-pp-line",
        "Match its detail at <b>" + matchFocal + " mm</b> on your camera, or a <b>" + altPixel + " µm</b> camera on " + Math.round(focal) + " mm."));
      if (There == null) {
        out.appendChild(el("div", "adt-pp-line adt-pp-time", "Integration to match: not available for this image."));
      } else if (ratio > 1.01) {
        out.appendChild(htmlEl("div", "adt-pp-line adt-pp-time adt-pp-warn",
          "At your current <b>" + yourScale.toFixed(2) + "″/px</b>: <b>" + fmtH(There) + "</b> - " + (ratio * ratio).toFixed(2) + "x longer than at its native scale, for a more detailed image."));
      } else if (ratio < 0.99) {
        out.appendChild(htmlEl("div", "adt-pp-line adt-pp-time adt-pp-warn",
          "At your current <b>" + yourScale.toFixed(2) + "″/px</b>: <b>" + fmtH(There) + "</b> - " + (ratio * ratio).toFixed(2) + "x the native-scale time (coarser, faster, less detail)."));
      } else {
        out.appendChild(htmlEl("div", "adt-pp-line adt-pp-time adt-pp-warn",
          "At this image's own scale: <b>" + fmtH(There) + "</b> to match it."));
      }
    }
    refresh();
    return wrap;
  }

  // Persistent cache for AstroBin equipment lookups - avoids re-hitting their
  // API across page views / sessions (fair use). Stored in chrome.storage.
  let eqCache = {};
  // Load the persisted cache as a promise so cachedJson can await it instead of
  // racing the async storage callback (#6).
  const eqCacheReady = (async () => {
    try {
      const r = await new Promise((res) => chrome.storage.local.get(["adt_eqcache"], res));
      eqCache = (r && r.adt_eqcache) || {};
    } catch (e) { eqCache = {}; }
  })();
  let eqSaveT = null;
  function eqSave() { clearTimeout(eqSaveT); eqSaveT = setTimeout(() => { try { chrome.storage.local.set({ adt_eqcache: eqCache }); } catch (e) {} }, 1500); }
  async function cachedJson(key, url) {
    await eqCacheReady;
    if (Object.prototype.hasOwnProperty.call(eqCache, key)) return eqCache[key];
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, credentials: "omit" });
      if (!r.ok) return null;                 // never cache a failure (#5): a transient AstroBin outage must not poison the cache forever
      const j = await r.json();
      // cache successful results, capped so the persisted cache can't grow unbounded (#9)
      if (j && Object.keys(eqCache).length < 1500) { eqCache[key] = j; eqSave(); }
      return j;
    } catch (e) { return null; }
  }

  // Fetch aperture/focal for any scope from AstroBin's own equipment DB.
  // Pull an f-number out of an equipment name: "f/2.8", "F2.0", "T2.2", "f1.8",
  // or a bare "2.0" (e.g. "135mm 2.0/1E5"). Camera lenses store it only in the name.
  function fNumberFromName(name) {
    if (!name) return null;
    let m = name.match(/[ft]\/?(\d{1,2}(?:\.\d{1,2})?)/i);
    if (!m) m = name.match(/(?:^|\s)(\d{1,2}\.\d)(?=[\s\/]|$)/);
    const f = m ? parseFloat(m[1]) : NaN;
    return (isFinite(f) && f >= 0.7 && f <= 64) ? f : null;
  }

  async function fetchAstroBinScope(id) {
    if (!id) return null;
    const j = await cachedJson("tel:" + id, "/api/v2/equipment/telescope/" + id + "/");
    if (!j) return null;
    const fl = parseFloat(j.maxFocalLength || j.minFocalLength);
    let ap = parseFloat(j.aperture);
    // camera lenses (AstroBin type CAMERA_LENS) carry no aperture field - the f-number
    // lives in the name, so aperture diameter = focal length / f-number
    if (!isFinite(ap)) { const fn = fNumberFromName(j.name); if (isFinite(fl) && fn) ap = fl / fn; }
    return isFinite(ap) ? { aperture_mm: ap, focal_mm: isFinite(fl) ? fl : null, name: j.name } : null;
  }

  // Fetch filter type + bandwidth from AstroBin (no transmission field exists there).
  async function fetchAstroBinFilter(id) {
    if (!id) return null;
    const j = await cachedJson("flt:" + id, "/api/v2/equipment/filter/" + id + "/");
    if (!j) return null;
    const bw = parseFloat(j.bandwidth);
    return { type: j.type, bandwidth: isFinite(bw) ? bw : null, name: j.name };
  }
  function filterBandsFromType(type) {
    const t = (type || "").toUpperCase();
    if (/LUM|CLEAR|^L$/.test(t)) return { bands: ["L"], kind: "broadband" };
    if (/^R$|RED/.test(t)) return { bands: ["R"], kind: "broadband" };
    if (/^G$|GREEN/.test(t)) return { bands: ["G"], kind: "broadband" };
    if (/^B$|BLUE/.test(t)) return { bands: ["B"], kind: "broadband" };
    if (/HA|ALPHA/.test(t)) return { bands: ["Ha"], kind: "line" };
    if (/OIII|O3/.test(t)) return { bands: ["OIII"], kind: "line" };
    if (/SII|S2/.test(t)) return { bands: ["SII"], kind: "line" };
    if (/MULTI|DUAL|TRI/.test(t)) return { bands: ["Ha", "OIII"], kind: "line" };
    return null;
  }
  // assumed transmission by band (AstroBin doesn't publish it)
  function assumedT(band, kind) { return kind === "line" ? 0.90 : (band === "B" ? 0.92 : band === "L" ? 0.97 : 0.95); }

  // Fetch camera specs (pixel + peak QE via its sensor) from AstroBin. Often partial.
  async function fetchAstroBinCamera(id) {
    if (!id) return null;
    const j = await cachedJson("cam:" + id, "/api/v2/equipment/camera/" + id + "/");
    if (!j) return null;
    let pixel = null, qe = null, type = null;
    if (j.sensor) {
      const sj = await cachedJson("sen:" + j.sensor, "/api/v2/equipment/sensor/" + j.sensor + "/");
      if (sj) {
        const px = parseFloat(sj.pixelSize), q = parseFloat(sj.quantumEfficiency);
        pixel = isFinite(px) ? px : null;
        qe = isFinite(q) ? Math.round(q) / 100 : null;              // AstroBin stores % peak QE
        if (sj.name && /mono/i.test(sj.name)) type = "mono";
        else if (sj.name && /colou?r/i.test(sj.name)) type = "color";
      }
    }
    return { type: type, pixel: pixel, qe: qe, name: j.name };
  }

  // AstroBin lists one PEAK sensor QE; spread it into the broadband + per-line QEs
  // the model uses. Peak is the sensor maximum (usually green); broadband - especially
  // colour/OSC, via the Bayer matrix - sits well below it, and each emission line sits
  // at its own point on the curve. Multipliers calibrated against known mono/colour rigs.
  function applyAstroBinQE(cam, peak, type) {
    const mono = (type === "mono") || (!type && cam.type === "mono");
    const m = mono ? { lum: 0.90, ha: 0.88, oiii: 0.97, sii: 0.86 }
                   : { lum: 0.62, ha: 0.52, oiii: 0.69, sii: 0.50 };
    const r2 = (x) => Math.round(x * 100) / 100;
    cam.qe_lum = r2(peak * m.lum);
    cam.qe_ha = r2(peak * m.ha);
    cam.qe_oiii = r2(peak * m.oiii);
    cam.qe_sii = r2(peak * m.sii);
    if (type) cam.type = type;
  }

  // ---------- inline settings ----------
  function buildSettings(settings) {
    const D = window.ADT_DATA;
    const rigs = settings.adt_rigs && settings.adt_rigs.length ? settings.adt_rigs : [defaultRig()];
    if (editingIndex == null || (editingIndex >= 0 && editingIndex >= rigs.length))
      editingIndex = (typeof settings.adt_active === "number" && settings.adt_active < rigs.length) ? settings.adt_active : 0;
    const editing = editingIndex === -1 ? {} : rigs[editingIndex];

    const wrap = el("div", "adt-settings");
    if (!settingsOpen) wrap.style.display = "none";

    // datalists - populated LIVE as the user types (empty when blank), merging
    // our local/custom gear with live results from AstroBin's equipment search.
    const dlScope = datalistEl("adt-dl-scope"), dlCam = datalistEl("adt-dl-cam"),
          dlBB = datalistEl("adt-dl-bb"), dlNB = datalistEl("adt-dl-nb");
    [dlScope, dlCam, dlBB, dlNB].forEach((d) => wrap.appendChild(d));
    function refreshLists() {}  // suggestions are type-driven now; nothing to pre-fill

    function localDetail(klass, x) {
      if (klass === "telescope") return x.aperture_mm + "mm f/" + x.f_ratio + (x._custom ? " (yours)" : "");
      if (klass === "camera") return x.type + (x._custom ? " (yours)" : "");
      return (x.bands || []).join("+") + " " + x.bandwidth_nm + "nm" + (x._custom ? " (yours)" : "");
    }
    function remoteDetail(klass, x) {
      if (klass === "telescope") return (x.aperture ? x.aperture + "mm" : "AstroBin");
      if (klass === "filter") return (x.type || "AstroBin") + (x.bandwidth ? " " + x.bandwidth + "nm" : "");
      return "AstroBin";
    }
    function attachAC(inp, dl, klass, kind) {
      let localList = klass === "telescope" ? D.SCOPES : klass === "camera" ? D.CAMERAS : D.FILTERS;
      if (klass === "filter" && kind) localList = D.FILTERS.filter((f) => f.kind === kind);
      inp._acMap = {}; let timer = null;
      function setOpts(items) {
        dl.innerHTML = "";
        items.slice(0, 15).forEach((it) => {
          const o = document.createElement("option"); o.value = it.name; if (it.detail) o.label = it.detail;
          dl.appendChild(o); inp._acMap[it.name.toLowerCase()] = it;
        });
      }
      inp.addEventListener("input", () => {
        const q = inp.value.trim(); clearTimeout(timer);
        if (q.length < 2) { dl.innerHTML = ""; return; }    // nothing when blank/short (keep cache so a prior pick still resolves)
        const ql = q.toLowerCase();
        const loc = localList.filter((x) => x.model.toLowerCase().includes(ql))
          .map((x) => ({ name: x.model, detail: localDetail(klass, x), local: true, item: x }));
        setOpts(loc);
        timer = setTimeout(async () => {
          try {
            const r = await fetch("/api/v2/equipment/" + klass + "/?q=" + encodeURIComponent(q), { headers: { Accept: "application/json" }, credentials: "omit" });
            const j = await r.json(); const arr = j.results || j;
            let rem = (arr || []).slice(0, 15).map((x) => ({ name: ((x.brandName ? x.brandName + " " : "") + (x.name || "")).trim(), id: x.id, raw: x, detail: remoteDetail(klass, x), remote: true }));
            if (klass === "filter" && kind) rem = rem.filter((it) => { const cl = filterBandsFromType(it.raw && it.raw.type); return !cl || cl.kind === kind; });
            const seen = new Set(), merged = [];
            loc.concat(rem).forEach((it) => { const k = it.name.toLowerCase(); if (k && !seen.has(k)) { seen.add(k); merged.push(it); } });
            if (inp.value.trim() === q) setOpts(merged);
          } catch (e) {}
        }, 250);
      });
    }
    function registerRemoteFilter(it) {
      const exist = find(D.FILTERS, it.name); if (exist) return exist.model;
      const cl = filterBandsFromType(it.raw && it.raw.type);
      if (!cl) {   // unknown AstroBin filter type: don't guess Ha (#11) - that would silently mis-estimate. Ask the user to add it explicitly.
        alert('Couldn\'t identify the bands for "' + it.name + '". Add it under "Add custom gear" with its bands so the estimate stays correct.');
        return null;
      }
      const bw = parseFloat(it.raw && it.raw.bandwidth);
      const item = { model: it.name, kind: cl.kind, bands: cl.bands,
        bandwidth_nm: isFinite(bw) ? bw : (cl.kind === "line" ? 7 : (cl.bands[0] === "L" ? 300 : 100)),
        transmission: assumedT(cl.bands[0], cl.kind) };
      D.FILTERS.push(Object.assign({ _custom: true, _fromAstrobin: true }, item));
      settings.adt_custom = settings.adt_custom || { CAMERAS: [], SCOPES: [], FILTERS: [] };
      settings.adt_custom.FILTERS.push(item); persistSettings(settings);
      return item.model;
    }

    // rig selector row
    const rigSel = selectEl(rigs.map((r, i) => [String(i), r.label || ("rig " + (i + 1))]), editingIndex >= 0 ? String(editingIndex) : null);
    rigSel.appendChild(opt("new", "➕ New rig…", editingIndex === -1));
    const editBtn = el("button", "adt-icon adt-icon-edit", "✎"); editBtn.title = "Rename this rig";
    const delBtn = el("button", "adt-icon adt-icon-del", "🗑"); delBtn.title = "Delete this rig";
    const rigRow = el("div", "adt-set-row");
    rigRow.appendChild(el("span", "adt-set-lbl", "Rig")); rigRow.appendChild(rigSel); rigRow.appendChild(editBtn); rigRow.appendChild(delBtn);
    wrap.appendChild(rigRow);

    const fields = el("div", "adt-set-fields");
    const field = (t, node, hint, marker) => {
      const r = el("div", "adt-set-row");
      const lbl = el("span", "adt-set-lbl", t); if (marker) lbl.appendChild(marker);
      r.appendChild(lbl); r.appendChild(node);
      if (hint) r.appendChild(el("div", "adt-set-rhint", hint));
      fields.appendChild(r);
    };
    // a compact row of short labelled fields; first label takes the gutter so it
    // lines up with the full-width rows above it
    const groupRow = (pairs) => {
      const r = el("div", "adt-set-row adt-set-grp");
      pairs.forEach((p, i) => {
        r.appendChild(el("span", i === 0 ? "adt-set-lbl" : "adt-set-lbl2", p[0]));
        r.appendChild(p[1]);
      });
      fields.appendChild(r);
    };

    const scopeI = combo("adt-dl-scope", editing.scopeModel || "", "type to search, or leave blank");
    const apI = input("number", editing.aperture_mm || ""); apI.placeholder = "aperture mm (required)";
    const focI = input("number", editing.focal_mm || ""); focI.placeholder = "focal mm (optional)";
    // marker + reset next to "Scope" when aperture/focal differ from the picked model
    const scopeMarker = el("span", "adt-modmark"); scopeMarker.style.display = "none";
    const scopeStar = el("span", "adt-star", " *");
    const scopeReset = el("span", "adt-reset-mark", "↻"); scopeReset.title = "Reset these to the model's values";
    scopeMarker.appendChild(scopeStar); scopeMarker.appendChild(scopeReset);
    let scopeSpec = null;
    const scopeSpecFrom = (o) => ({ ap: o.aperture_mm != null ? String(o.aperture_mm) : "", focal: o.focal_mm != null ? String(o.focal_mm) : "" });
    function checkScopeMods() {
      if (!scopeSpec) { scopeMarker.style.display = "none"; return; }
      const diffs = [];
      if (String(apI.value) !== String(scopeSpec.ap)) diffs.push("Aperture");
      if (String(focI.value) !== String(scopeSpec.focal)) diffs.push("Focal");
      if (diffs.length) { scopeMarker.style.display = ""; scopeStar.title = "Changed from " + (scopeI.value || "the model") + " spec - " + diffs.join(", "); }
      else scopeMarker.style.display = "none";
    }
    scopeReset.addEventListener("click", () => { if (scopeSpec) { apI.value = scopeSpec.ap; focI.value = scopeSpec.focal; checkScopeMods(); } });
    const initScope = editing.scopeModel ? find(D.SCOPES, editing.scopeModel) : null;
    if (initScope) scopeSpec = scopeSpecFrom(initScope);
    apI.addEventListener("input", checkScopeMods);
    focI.addEventListener("input", checkScopeMods);
    checkScopeMods();
    const camI = combo("adt-dl-cam", editing.cameraModel || "", "type to search, or leave blank");
    const initCam = editing.cameraModel ? find(D.CAMERAS, editing.cameraModel) : null;  // fall back to the catalog model's specs if the rig didn't store them
    const camType = selectEl([["color", "color"], ["mono", "mono"]], editing.cameraType || (initCam && initCam.type) || "color");
    const pixI = input("number", editing.pixel_um || (initCam && initCam.pixel_um) || ""); pixI.placeholder = "pixel µm"; pixI.step = "0.01";
    const qeI = input("number", editing.qe_lum || (initCam && initCam.qe_lum) || ""); qeI.placeholder = "lum QE 0–1 (optional)"; qeI.step = "0.01";
    // marker + reset shown next to "Camera" when type/pixel/QE differ from the picked model
    const camMarker = el("span", "adt-modmark"); camMarker.style.display = "none";
    const camStar = el("span", "adt-star", " *");
    const camReset = el("span", "adt-reset-mark", "↻"); camReset.title = "Reset these to the model's values";
    camMarker.appendChild(camStar); camMarker.appendChild(camReset);
    let camSpec = null;  // {type, pixel, qe} of the named model, as strings
    const camSpecFrom = (o) => ({ type: o.type != null ? String(o.type) : "", pixel: o.pixel_um != null ? String(o.pixel_um) : "", qe: o.qe_lum != null ? String(o.qe_lum) : "" });
    function checkCamMods() {
      if (!camSpec) { camMarker.style.display = "none"; return; }
      const diffs = [];
      if (String(camType.value) !== String(camSpec.type)) diffs.push("Type");
      if (String(pixI.value) !== String(camSpec.pixel)) diffs.push("Pixel");
      if (String(qeI.value) !== String(camSpec.qe)) diffs.push("Lum QE");
      if (diffs.length) { camMarker.style.display = ""; camStar.title = "Changed from " + (camI.value || "the model") + " spec - " + diffs.join(", "); }
      else camMarker.style.display = "none";
    }
    camReset.addEventListener("click", () => { if (camSpec) { camType.value = camSpec.type; pixI.value = camSpec.pixel; qeI.value = camSpec.qe; checkCamMods(); } });
    if (initCam) camSpec = camSpecFrom(initCam);
    camType.addEventListener("change", checkCamMods);
    pixI.addEventListener("input", checkCamMods);
    qeI.addEventListener("input", checkCamMods);
    checkCamMods();
    const bbI = combo("adt-dl-bb", editing.broadbandFilterModel || "", "No filter, OSC, or LRGB / luminance");
    const bortleI = input("number", editing.sky_bortle != null ? editing.sky_bortle : ""); bortleI.min = "1"; bortleI.max = "9"; bortleI.step = "any"; bortleI.placeholder = "Bortle 1–9";
    const sqmI = input("number", editing.sky_sqm != null ? editing.sky_sqm : ""); sqmI.placeholder = "optional"; sqmI.step = "0.01";
    const moonChk = document.createElement("input"); moonChk.type = "checkbox"; moonChk.checked = editing.moonless !== false;
    const moonLbl = el("label", "adt-set-check"); moonLbl.appendChild(moonChk); moonLbl.appendChild(el("span", null, " I shoot moonless"));

    // multi-select narrowband: chips + add input
    let nbSelected = (editing.narrowbandFilterModels && editing.narrowbandFilterModels.slice()) ||
                     (editing.narrowbandFilterModel ? [editing.narrowbandFilterModel] : []);
    const nbChips = el("div", "adt-chips");
    const nbI = combo("adt-dl-nb", "", "add a narrowband filter…");
    const nbAdd = el("button", "adt-btn-sm", "Add");
    function renderChips() {
      nbChips.innerHTML = "";
      if (!nbSelected.length) { nbChips.appendChild(el("span", "adt-set-hint", "none - broadband only")); }
      nbSelected.forEach((m, i) => {
        const chip = htmlEl("span", "adt-chip", escapeHtml(m) + " ");
        const x = el("span", "adt-chip-x", "✕");
        x.addEventListener("click", () => { nbSelected.splice(i, 1); renderChips(); markDirty(); });
        chip.appendChild(x); nbChips.appendChild(chip);
      });
    }
    renderChips();
    nbAdd.addEventListener("click", () => {
      const v = nbI.value.trim(); if (!v) return;
      let f = find(D.FILTERS, v);
      if (!f) { const it = nbI._acMap[v.toLowerCase()]; if (it && it.remote) f = find(D.FILTERS, registerRemoteFilter(it)); }
      if (f) { if (!nbSelected.includes(f.model)) nbSelected.push(f.model); nbI.value = ""; nbI._acMap = {}; dlNB.innerHTML = ""; renderChips(); markDirty(); }
      else alert('"' + v + '" isn\'t a known narrowband filter. Add it under "Add custom gear" first.');
    });

    field("Scope", scopeI, "Pick a model, or leave blank and just enter the specs below.", scopeMarker);
    groupRow([["Aperture", apI], ["Focal", focI]]);
    field("Camera", camI, null, camMarker);
    groupRow([["Type", camType], ["Pixel", pixI], ["Lum QE", qeI]]);
    field("Broadband", bbI);
    const nbRow = el("div", "adt-set-row"); nbRow.appendChild(el("span", "adt-set-lbl", "Narrowband")); nbRow.appendChild(nbI); nbRow.appendChild(nbAdd);
    fields.appendChild(nbRow); fields.appendChild(nbChips);
    groupRow([["Bortle", bortleI], ["SQM", sqmI]]);
    fields.appendChild(moonLbl);
    wrap.appendChild(fields);

    // live autocomplete (only suggests once you type), then resolve specs on pick
    attachAC(scopeI, dlScope, "telescope");
    attachAC(camI, dlCam, "camera");
    attachAC(bbI, dlBB, "filter", "broadband");
    attachAC(nbI, dlNB, "filter", "line");

    scopeI.addEventListener("change", async () => {
      const it = scopeI._acMap[scopeI.value.trim().toLowerCase()];
      if (it && it.local) { apI.value = it.item.aperture_mm; focI.value = it.item.focal_mm || ""; scopeSpec = scopeSpecFrom(it.item); }
      else if (it && it.remote) { const s = await fetchAstroBinScope(it.id); if (s) { apI.value = s.aperture_mm; focI.value = s.focal_mm || ""; scopeSpec = { ap: String(apI.value), focal: String(focI.value) }; } }
      else { scopeSpec = null; }
      checkScopeMods();
    });
    camI.addEventListener("change", async () => {
      const it = camI._acMap[camI.value.trim().toLowerCase()];
      if (it && it.local) {
        camType.value = it.item.type; pixI.value = it.item.pixel_um || ""; qeI.value = it.item.qe_lum || "";
        camSpec = camSpecFrom(it.item);
      } else if (it && it.remote) {
        const c = await fetchAstroBinCamera(it.id);
        if (c) {
          if (c.type) camType.value = c.type;
          if (c.pixel) pixI.value = c.pixel;
          if (c.qe != null) { const mono = (c.type || camType.value) === "mono"; qeI.value = Math.round(c.qe * (mono ? 0.90 : 0.62) * 100) / 100; }
          camSpec = { type: String(camType.value), pixel: String(pixI.value), qe: String(qeI.value) };
        }
      } else { camSpec = null; }
      checkCamMods();
    });

    // ---- custom gear mini-form ----
    const addToggle = el("a", "adt-add-gear", "➕ Add custom gear (private to you)");
    const cform = el("div", "adt-custom-form"); cform.style.display = "none";
    addToggle.addEventListener("click", () => { cform.style.display = cform.style.display === "none" ? "" : "none"; });
    const cCat = selectEl([["CAMERAS", "camera"], ["SCOPES", "scope"], ["FILTERS", "filter"]], "CAMERAS");
    const cName = input("text", ""); cName.placeholder = "model name";
    const cFields = el("div", "adt-cfields");
    function renderCFields() {
      cFields.innerHTML = "";
      const mk = (ph, step) => { const i = input(step ? "number" : "text", ""); i.placeholder = ph; if (step) i.step = step; i.dataset.k = ph; return i; };
      const cat = cCat.value;
      let inputs = [];
      if (cat === "CAMERAS") inputs = [["type"], ["pixel_um", "0.01"], ["qe_lum", "0.01"], ["qe_ha", "0.01"], ["qe_oiii", "0.01"], ["qe_sii", "0.01"]];
      else if (cat === "SCOPES") inputs = [["aperture_mm", "1"], ["focal_mm", "1"], ["f_ratio", "0.1"]];
      else inputs = [["kind (broadband/line)"], ["bands (e.g. Ha,OIII)"], ["bandwidth_nm", "0.1"], ["transmission", "0.01"]];
      inputs.forEach(([ph, step]) => cFields.appendChild(mk(ph, step)));
    }
    cCat.addEventListener("change", renderCFields); renderCFields();
    const cAdd = el("button", "adt-btn-sm adt-btn-primary", "Add to my gear");
    cAdd.addEventListener("click", () => {
      const cat = cCat.value, name = cName.value.trim();
      if (!name) { alert("Give the gear a model name."); return; }
      const item = { model: name };
      cFields.querySelectorAll("input").forEach((inp) => {
        const key = inp.dataset.k.split(" ")[0]; const v = inp.value.trim(); if (!v) return;
        if (key === "bands") item.bands = v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
        else if (key === "type" || key === "kind") item[key] = v;
        else item[key] = parseFloat(v);
      });
      if (cat === "FILTERS" && !item.kind) item.kind = (item.bands && item.bands[0] && /L|R|G|B/.test(item.bands[0])) ? "broadband" : "line";
      const gearErr = validateGear(cat, item);
      if (gearErr) { alert(gearErr); return; }
      window.ADT_DATA[cat].push(Object.assign({ _custom: true }, item));
      settings.adt_custom = settings.adt_custom || { CAMERAS: [], SCOPES: [], FILTERS: [] };
      settings.adt_custom[cat] = settings.adt_custom[cat] || []; settings.adt_custom[cat].push(item);
      persistSettings(settings);
      track("custom_gear", { cat: cat, model: item.model, item: item });
      refreshLists(); renderCFields(); cName.value = "";
      const ok = htmlEl("div", "adt-set-hint", "✓ added “" + escapeHtml(name) + "” to your private gear - it'll show in suggestions.");
      cform.appendChild(ok); setTimeout(() => ok.remove(), 3000);
    });
    const cTitleRow = el("div", "adt-set-row"); cTitleRow.appendChild(el("span", "adt-set-lbl", "Category")); cTitleRow.appendChild(cCat);
    const cNameRow = el("div", "adt-set-row"); cNameRow.appendChild(el("span", "adt-set-lbl", "Model")); cNameRow.appendChild(cName);
    cform.appendChild(cTitleRow); cform.appendChild(cNameRow); cform.appendChild(cFields); cform.appendChild(cAdd);
    wrap.insertBefore(addToggle, fields); wrap.insertBefore(cform, fields);

    // ---- save / close / delete ----
    // opt-in analytics toggle - clear wording, unticked by default
    const consentChk = document.createElement("input"); consentChk.type = "checkbox"; consentChk.checked = analyticsConsent;
    const consentLbl = el("label", "adt-set-check"); consentLbl.appendChild(consentChk);
    consentLbl.appendChild(el("span", null, " Help improve this extension (share usage data)"));
    const consentInfo = el("span", "adt-info", " ⓘ");
    consentInfo.title = "Shares the AstroBin image you open and its public acquisition details, the gear & settings you use, and errors - tagged with a random install id. No login or personal info.";
    consentLbl.appendChild(consentInfo);
    consentChk.addEventListener("change", () => {
      analyticsConsent = consentChk.checked;
      try { chrome.storage.local.set({ adt_analytics: analyticsConsent }); } catch (e) {}
      if (analyticsConsent) track("opt_in", {});
    });
    wrap.appendChild(consentLbl);

    const saveBtn = el("button", "adt-btn-sm adt-btn-primary", "Save & apply"); saveBtn.disabled = true;
    function markDirty() { saveBtn.disabled = false; }
    fields.addEventListener("input", markDirty);
    fields.addEventListener("change", markDirty);
    const closeBtn = el("button", "adt-btn-sm", "Close");
    const btnRow = el("div", "adt-set-row adt-set-btns"); btnRow.appendChild(saveBtn); btnRow.appendChild(closeBtn);
    wrap.appendChild(btnRow);

    rigSel.addEventListener("change", () => {
      settingsOpen = true;
      if (rigSel.value === "new") { editingIndex = -1; forceRerender(); }
      else { editingIndex = parseInt(rigSel.value, 10); settings.adt_active = editingIndex; persistSettings(settings, forceRerender); }
    });
    delBtn.addEventListener("click", () => {
      if (editingIndex >= 0 && rigs.length > 1) {
        rigs.splice(editingIndex, 1); settings.adt_rigs = rigs; settings.adt_active = 0; editingIndex = 0;
        settingsOpen = true; persistSettings(settings, forceRerender);
      }
    });
    editBtn.addEventListener("click", () => {
      if (editingIndex < 0 || !rigs[editingIndex]) return;
      const cur = rigs[editingIndex];
      const nameInp = input("text", cur.label || ""); nameInp.placeholder = "rig name";
      const okBtn = el("button", "adt-icon adt-icon-ok", "✓"); okBtn.title = "Save name";
      rigRow.innerHTML = "";
      rigRow.appendChild(el("span", "adt-set-lbl", "Name"));
      rigRow.appendChild(nameInp); rigRow.appendChild(okBtn);
      nameInp.focus();
      const save = () => { cur.label = nameInp.value.trim() || cur.label; settings.adt_rigs = rigs; settingsOpen = true; persistSettings(settings, forceRerender); };
      okBtn.addEventListener("click", save);
      nameInp.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    });
    saveBtn.addEventListener("click", () => {
      const sc = find(D.SCOPES, scopeI.value), cm = find(D.CAMERAS, camI.value);
      const apertureVal = parseFloat(apI.value) || (sc ? sc.aperture_mm : null);
      if (!apertureVal) { alert("Pick a scope or type an aperture (mm)."); return; }
      const rigErr = validateRigInputs({
        aperture_mm: apertureVal,
        focal_mm: parseFloat(focI.value),
        pixel_um: parseFloat(pixI.value),
        qe_lum: parseFloat(qeI.value),
        sky_bortle: bortleI.value !== "" ? parseFloat(bortleI.value) : null,
        sky_sqm: sqmI.value !== "" ? parseFloat(sqmI.value) : null
      });
      if (rigErr) { alert(rigErr); return; }   // validate before auto-remembering or saving (#7)
      // auto-remember raw gear as private custom gear
      settings.adt_custom = settings.adt_custom || { CAMERAS: [], SCOPES: [], FILTERS: [] };
      if (scopeI.value && !sc) {
        const it = { model: scopeI.value, aperture_mm: apertureVal, focal_mm: parseFloat(focI.value) || null };
        window.ADT_DATA.SCOPES.push(Object.assign({ _custom: true }, it)); settings.adt_custom.SCOPES.push(it);
      }
      if (camI.value && !cm) {
        const it = { model: camI.value, type: camType.value, pixel_um: parseFloat(pixI.value) || null, qe_lum: parseFloat(qeI.value) || 0.42 };
        window.ADT_DATA.CAMERAS.push(Object.assign({ _custom: true }, it)); settings.adt_custom.CAMERAS.push(it);
      }
      let bbModel = bbI.value || "";
      if (bbModel && !find(D.FILTERS, bbModel)) { const it = bbI._acMap[bbModel.toLowerCase()]; if (it && it.remote) bbModel = registerRemoteFilter(it); }
      const autoLabel = [sc ? sc.model : scopeI.value, cm ? cm.model : camI.value].filter(Boolean).join(" + ") || "rig";
      const spec = {
        label: editing.label || autoLabel,
        scopeModel: sc ? sc.model : (scopeI.value || ""),
        aperture_mm: apertureVal, focal_mm: parseFloat(focI.value) || (sc ? sc.focal_mm : null),
        cameraModel: cm ? cm.model : (camI.value || ""),
        cameraType: camType.value || (cm ? cm.type : "color"),
        pixel_um: parseFloat(pixI.value) || (cm ? cm.pixel_um : null),
        qe_lum: parseFloat(qeI.value) || (cm ? cm.qe_lum : null),
        broadbandFilterModel: bbModel,
        narrowbandFilterModels: nbSelected.slice(),
        sky_bortle: bortleI.value || null, sky_sqm: sqmI.value !== "" ? parseFloat(sqmI.value) : null,
        moonless: moonChk.checked
      };
      if (editingIndex === -1) { rigs.push(spec); editingIndex = rigs.length - 1; } else { rigs[editingIndex] = spec; }
      settings.adt_rigs = rigs; settings.adt_active = editingIndex; settingsOpen = true;
      track("rig_saved", { scope: spec.scopeModel || "(custom)", camera: spec.cameraModel || spec.cameraType, bb: spec.broadbandFilterModel, nb: spec.narrowbandFilterModels, bortle: spec.sky_bortle, sqm: spec.sky_sqm != null, moonless: spec.moonless });
      persistSettings(settings, forceRerender);
    });
    closeBtn.addEventListener("click", () => { settingsOpen = false; wrap.style.display = "none"; });

    return wrap;
  }

  // ---------- panel ----------
  function buildPanel(image, settings) {
    const D = window.ADT_DATA;
    const rigs = settings.adt_rigs && settings.adt_rigs.length ? settings.adt_rigs : [defaultRig()];
    const activeIdx = (typeof settings.adt_active === "number" && rigs[settings.adt_active]) ? settings.adt_active : 0;
    const userRig = buildUserRig(rigs[activeIdx]);
    const refData = D.REFERENCE || { aperture_mm: 203, sky_label: "Bortle 4" };

    const p = el("div", "adt-panel"); p.id = PANEL_ID;
    const head = el("div", "adt-head");
    head.appendChild(el("span", "adt-title", "Depth Translator"));
    const confWrap = el("span", "adt-conf-wrap");
    const confBadge = el("span", "adt-conf", "");
    const confTip = el("div", "adt-conf-tip", "");
    confWrap.appendChild(confBadge); confWrap.appendChild(confTip); head.appendChild(confWrap);
    const gear = el("span", "adt-gear", "⚙ gear"); gear.title = "Choose your gear"; head.appendChild(gear);
    p.appendChild(head);

    const settingsEl = buildSettings(settings); p.appendChild(settingsEl);
    gear.addEventListener("click", () => { settingsOpen = !settingsOpen; settingsEl.style.display = settingsOpen ? "" : "none"; });

    let includeMoon = false;
    const hasMoon = image.moonPhase && image.moonPhase > 0.30;
    if (hasMoon) {
      const ctrl = el("label", "adt-moon-ctrl");
      const cb = document.createElement("input"); cb.type = "checkbox"; ctrl.appendChild(cb);
      ctrl.appendChild(el("span", null, " Include image moon (~" + Math.round(image.moonPhase * 100) + "% phase)"));
      cb.addEventListener("change", () => { includeMoon = cb.checked; draw(); });
      p.appendChild(ctrl);
    }
    const body = el("div", "adt-body"); p.appendChild(body);
    let ppBase = null;
    try { ppBase = window.ADT_ENGINE.compute(image, userRig).combinedTotalHours; } catch (e) {}
    p.appendChild(buildPerPixel(image, userRig, ppBase));
    p.appendChild(el("div", "adt-foot", "Time for your rig to match this image's depth, not a judgment of image quality."));
    p.appendChild(buildCredit());

    function draw() {
      const img = Object.assign({}, image, { moon_fraction: includeMoon ? (image.moonPhase || 0) : 0 });
      const result = window.ADT_ENGINE.compute(img, userRig);
      const conf = result.confidence;
      confBadge.className = "adt-conf adt-conf-" + conf.level.toLowerCase();
      confBadge.textContent = conf.level + " Confidence";
      confTip.innerHTML = "";
      confTip.appendChild(el("div", "adt-tip-head", conf.known + " of " + conf.total + " inputs solid"));
      (conf.checks || []).forEach((c) => {
        const st = c.state || (c.ok ? "ok" : "no");
        const mark = st === "ok" ? "✓ " : (st === "partial" ? "≈ " : "✗ ");
        const cls = st === "ok" ? "adt-tip-ok" : (st === "partial" ? "adt-tip-mid" : "adt-tip-no");
        confTip.appendChild(htmlEl("div", "adt-tip-row " + cls, mark + escapeHtml(c.label) + " - " + escapeHtml(c.note)));
      });
      body.innerHTML = "";
      const hl = el("div", "adt-headline");
      const hlMain = el("div", "adt-hl-main");
      hlMain.appendChild(el("span", "adt-hl-num", "≈ " + fmtH(result.headlineReferenceHours)));
      const apIn = Math.round(refData.aperture_mm / 25.4 * 10) / 10;
      const apInStr = (apIn % 1 === 0 ? String(apIn) : apIn.toFixed(1));
      hlMain.appendChild(el("span", "adt-hl-lbl", "on a set rig for reference: " + apInStr + "″ scope · " + (refData.camera_label || "ASI2600MM") + " · " + (refData.sky_label || "Bortle 4").toLowerCase() + ", no moon"));
      hl.appendChild(hlMain);
      if (result.referenceBroadbandHours != null && result.referenceNarrowbandHours != null) {
        hl.appendChild(el("div", "adt-hl-break",
          fmtH(result.referenceBroadbandHours) + " broadband + " + fmtH(result.referenceNarrowbandHours) + " narrowband"));
      }
      hl.title = FORMULA + "\n\nTotal across all bands - the whole time the reference scope would spend shooting " +
        "(combined broadband + each narrowband line) to reach this image's depth in every band.\n\n" +
        "Reference setup: " + refData.aperture_mm + " mm aperture, ASI2600MM-class sensor QE, 7 nm narrowband, " +
        (refData.sky_label || "Bortle 4") + ", no moon. (Focal length & pixel size don't affect per-area depth.)";
      body.appendChild(hl);

      const tbl = el("table", "adt-table"); const tb = el("tbody");
      const rr = el("tr", "adt-rig-row");
      rr.title = FORMULA + "\nTime for your rig to reach the same depth per unit sky as this image. Hover a row for your actual numbers.";
      rr.appendChild(htmlEl("td", "adt-rig-label", "On <b>" + escapeHtml(userRig.label) + "</b>" + (includeMoon ? " · with moon" : "")));
      rr.appendChild(el("td", "", "")); tb.appendChild(rr);
      const bbMonoRows = (result.broadband && !result.broadband.userIsColor) ? (result.broadband.user || []).length : 0;
      if (result.broadband) {
        if (result.broadband.userIsColor) tb.appendChild(simpleRow("Broadband (one exposure, color)", fmtH(result.broadband.user.combinedHours), false, calcTip(result.broadband.calc), "adt-detail"));
        else (result.broadband.user || []).forEach((c) => tb.appendChild(simpleRow("Broadband · " + c.band, fmtH(c.hours), false, null, "adt-detail")));
      }
      if (bbMonoRows > 1) tb.appendChild(simpleRow("Broadband total", fmtH(result.broadband.userTotalHours), false,
        "Sum of your L / R / G / B sub-exposures.", "adt-subtotal"));
      let feasibleLines = 0;
      result.lines.forEach((l, idx) => {
        let val, title;
        if (l.feasible) { val = fmtH(l.userHours); title = calcTip(l.calc); feasibleLines++; }
        else if (/no filter/i.test(l.infeasibleReason || "")) {
          val = '<span class="adt-infeasible">no matching filter</span>';
          title = "Your rig has no filter that passes " + l.band + " - add one under ⚙ gear to get an estimate.";
        } else {
          val = '<span class="adt-infeasible">not practical</span>';
          title = "≈ " + fmtH(l.userHours) + " with your rig - beyond a realistic project (over 3000 h). This was likely shot with a much larger telescope or a dedicated mono narrowband filter; a colour camera with a dual-band can't match it.";
        }
        const lineLabel = l.multiband ? "Narrowband · multi-band" : "Narrowband · " + l.band;
        const gap = "adt-detail" + ((idx === 0 && result.broadband) ? " adt-band-gap" : "");
        tb.appendChild(simpleRow(lineLabel, val, !l.feasible, title, gap));
      });
      if (feasibleLines > 1 && result.narrowbandTotalHours != null) tb.appendChild(simpleRow("Narrowband total", fmtH(result.narrowbandTotalHours), false,
        "Total narrowband time on your rig - a filter that captures several lines at once (dual/tri-band) is counted once, at the slowest line.", "adt-subtotal"));
      if (result.broadband && feasibleLines >= 1 && result.combinedTotalHours != null) tb.appendChild(simpleRow("Total · broadband + narrowband", fmtH(result.combinedTotalHours), false,
        "The whole time your rig spends shooting to match this image across every band.", "adt-subtotal adt-subtotal-grand"));
      tbl.appendChild(tb); body.appendChild(tbl);

      const notes = [];
      if (result.resolution) {
        const r = result.resolution;
        const rel = r.ratio > 1.15 ? ("~" + r.ratio + "× finer detail than the original")
          : (r.ratio < 0.87 ? ("~" + (1 / r.ratio).toFixed(1) + "× coarser than the original") : "similar sampling");
        notes.push("Your " + r.userScale + "″/px vs image " + r.imageScale + "″/px - " + rel + ".");
      }
      (result.notes || []).forEach((n) => notes.push(n));
      if (hasMoon && !includeMoon) notes.push("Dark-sky estimate: image had ~" + Math.round(image.moonPhase * 100) + "% moon; tick the box to include it.");
      if (image.raw && !image.raw.scopeMatched) notes.push("Telescope aperture not found - estimated.");
      if (image._scaleSource === "derived") notes.push("Pixel scale computed from camera pixel size + focal length (this image wasn't plate-solved).");
      const abF = (image.channels || []).filter((c) => c.filter && c.filter.source === "astrobin");
      if (abF.length) notes.push("Filter bandwidth from AstroBin's database (transmission assumed): " + abF.map((c) => c.band + "≈" + c.filter.bandwidth_nm + "nm").join(", ") + ".");
      const assumedF = (image.channels || []).filter((c) => !c.filter);
      if (assumedF.length) {
        const parts = assumedF.map((c) => { const d = window.ADT_ENGINE.defaultFilter(c.band); return c.band + " " + d.bandwidth_nm + "nm"; });
        notes.push("Filter specs not published - assumed: " + parts.join(", ") + ".");
      }
      const sqmShown = image.sky_sqm != null ? Math.round(image.sky_sqm * 10) / 10 : null;
      if (image._skySource === "bortle") notes.push("Sky brightness from Bortle " + (image.raw && image.raw.bortle) + " (assumed SQM ≈ " + sqmShown + ").");
      else if (image._skySource !== "sqm") notes.push("Sky brightness not listed - assumed SQM ≈ " + sqmShown + ".");
      if (result.lines.length && image.sky_sqm != null && image.sky_sqm < 21.0) notes.push("Narrowband rejects most skyglow, so the bright sky barely affects the narrowband estimate.");
      const otherFlags = (conf.flags || []).filter((f) => !/filter|sky/i.test(f));
      if (otherFlags.length) notes.push("Assumed: " + otherFlags.join("; ") + ".");
      if (notes.length) {
        const nd = el("div", "adt-notes");
        notes.forEach((n) => nd.appendChild(htmlEl("div", "adt-note", "• " + escapeHtml(n).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>"))));
        body.appendChild(nd);
      }
    }
    draw();
    return p;
  }

  function errorPanel(msg, settings) {
    const p = el("div", "adt-panel"); p.id = PANEL_ID;
    const head = el("div", "adt-head");
    head.appendChild(el("span", "adt-title", "Depth Translator"));
    const gear = el("span", "adt-gear", "⚙ gear"); head.appendChild(gear);
    p.appendChild(head);
    const settingsEl = buildSettings(settings); p.appendChild(settingsEl);
    gear.addEventListener("click", () => { settingsOpen = !settingsOpen; settingsEl.style.display = settingsOpen ? "" : "none"; });
    p.appendChild(htmlEl("div", "adt-notes", '<div class="adt-note">• ' + escapeHtml(msg) + "</div>"));
    return p;
  }

  // ---------- orchestration ----------
  async function render() {
    if (rendering) { renderQueued = true; return; }   // don't drop a render requested mid-flight (#7)
    rendering = true;
    try {
      const container = window.ADT_PARSER.getContainer();
      if (!container) { const e = document.getElementById(PANEL_ID); if (e) e.remove(); lastImageId = null; return; }
      const existing = document.getElementById(PANEL_ID);
      const idMatch = location.href.match(/\/i\/([^/?#]+)/) || location.href.match(/[?&]i=([^&#]+)/);
      const imageId = (idMatch && idMatch[1]) || location.href;
      if (existing && imageId === lastImageId) return;
      if (existing) existing.remove();
      lastImageId = imageId;

      const settings = await loadSettings();
      mergeCustomGear(settings.adt_custom);
      const image = window.ADT_PARSER.buildImage();
      if (!image) return;

      // scope not in our table? pull aperture from AstroBin's equipment DB
      if (!image.aperture_mm && image.raw && image.raw.telescopeId) {
        const s = await fetchAstroBinScope(image.raw.telescopeId);
        if (s) { image.aperture_mm = s.aperture_mm; if (s.focal_mm && !image.focal_mm) image.focal_mm = s.focal_mm; image.raw.scopeMatched = true; image.raw.scopeSource = "astrobin"; }
      }

      // camera not in our table? pull the sensor's pixel size + peak QE from AstroBin
      if (image.camera && !image.camera._matched && image.raw && image.raw.cameraId) {
        const c = await fetchAstroBinCamera(image.raw.cameraId);
        if (c) {
          if (c.pixel && !image.camera.pixel_um) image.camera.pixel_um = c.pixel;
          if (c.qe != null) {
            applyAstroBinQE(image.camera, c.qe, c.type);
            image.camera._matched = true;
            image.raw.cameraQeSource = "astrobin";
            image.raw.cameraQePeak = Math.round(c.qe * 100);
          } else if (c.type) { image.camera.type = c.type; }
        }
      }

      // no plate-solved pixel scale on the page? derive it from camera pixel + focal length
      if (image.pixel_scale == null && image.focal_mm && image.camera && image.camera.pixel_um) {
        image.pixel_scale = 206.265 * image.camera.pixel_um / image.focal_mm;
        image._scaleSource = "derived";
      }

      // fill missing filter bandwidths from AstroBin's filter API (transmission still assumed)
      if (image.raw && image.raw.filterIds && image.raw.filterIds.length && image.channels.some((c) => !c.filter)) {
        const map = {};
        for (const fi of image.raw.filterIds) {
          const fd = await fetchAstroBinFilter(fi.id);
          if (!fd || fd.bandwidth == null) continue;          // only use real bandwidths
          const cl = filterBandsFromType(fd.type);
          if (!cl) continue;
          cl.bands.forEach((b) => { if (!map[b]) map[b] = { kind: cl.kind, bandwidth_nm: fd.bandwidth, transmission: assumedT(b, cl.kind), source: "astrobin" }; });
        }
        let used = false;
        image.channels.forEach((c) => { if (!c.filter && map[c.band]) { c.filter = map[c.band]; used = true; } });
        if (used) image.raw.filterBwSource = "astrobin";
      }

      let panel;
      if (!image.aperture_mm) {
        panel = errorPanel("Couldn't read this image's aperture - AstroBin lists no aperture for its optics, and no focal length / f-number to derive one from. Depth needs an aperture to estimate.", settings);
      } else {
        image.moonPhase = image.moon_fraction || 0;
        image.moon_fraction = 0;
        panel = buildPanel(image, settings);
        track("image_analyzed", {
          url: idMatch ? "https://app.astrobin.com/i/" + imageId : "(unknown)", // canonical image page only; no query/tracking params (opt-in only)
          telescope: image.raw && image.raw.telescope,
          camera: image.raw && image.raw.camera,
          filters: image.raw && image.raw.filters,
          bortle: image.raw && image.raw.bortle,
          sqm: image.raw && image.raw.sqm,
          pixel_scale: image.pixel_scale,
          aperture: image.aperture_mm,
          channels: image.channels.map((c) => ({ band: c.band, hours: c.hours }))
        });
      }
      // The awaits above can outlast an AstroBin route change. Re-check that we're
      // still on the same image and the container is still live before inserting,
      // so we never drop a stale panel onto the wrong page (#7).
      const nowMatch = location.href.match(/\/i\/([^/?#]+)/) || location.href.match(/[?&]i=([^&#]+)/);
      const nowId = (nowMatch && nowMatch[1]) || location.href;
      const live = window.ADT_PARSER.getContainer();
      if (nowId !== imageId || !live || !live.parentElement) { lastImageId = null; return; }
      live.parentElement.insertBefore(panel, live);
    } catch (e) { console.error("[ADT] render error", e); track("error", { msg: String(e).slice(0, 200) }); }
    finally {
      rendering = false;
      if (renderQueued) { renderQueued = false; render(); }   // a navigation arrived mid-render; run once more (#7)
    }
  }

  // ---------- SPA watch ----------
  let timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 400); }
  const mo = new MutationObserver(() => schedule());
  mo.observe(document.body, { childList: true, subtree: true });
  ["pushState", "replaceState"].forEach((m) => {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); setTimeout(schedule, 50); return r; };
  });
  window.addEventListener("popstate", schedule);
  schedule();
})();
/* AstroBin Depth Translator - options page logic */
(function () {
  "use strict";
  const D = window.ADT_DATA;
  const $ = (id) => document.getElementById(id);
  const status = (msg) => { $("status").textContent = msg; if (msg) setTimeout(() => { if ($("status").textContent === msg) $("status").textContent = ""; }, 2500); };

  let state = { adt_rigs: [], adt_active: 0, adt_custom: { CAMERAS: [], SCOPES: [], FILTERS: [] } };
  let editIndex = null;

  function allOf(cat) { return D[cat].concat((state.adt_custom && state.adt_custom[cat]) || []); }
  function findModel(cat, name) { return allOf(cat).find((x) => x.model.toLowerCase() === (name || "").toLowerCase()); }

  // ---------- datalists ----------
  function fillDatalists() {
    const fill = (id, cat, fmt) => {
      const dl = $(id); dl.innerHTML = "";
      allOf(cat).forEach((x) => {
        const o = document.createElement("option");
        o.value = x.model; o.label = fmt ? fmt(x) : "";
        dl.appendChild(o);
      });
    };
    fill("dl_scopes", "SCOPES", (s) => `${s.aperture_mm}mm f/${s.f_ratio}`);
    fill("dl_cameras", "CAMERAS", (c) => `${c.type}, ${c.pixel_um}µm`);
    fill("dl_filters", "FILTERS", (f) => `${f.kind}, ${f.bandwidth_nm}nm`);
  }

  // ---------- load / save ----------
  function load() {
    chrome.storage.local.get(["adt_rigs", "adt_active", "adt_custom"], (r) => {
      state.adt_rigs = r.adt_rigs || defaultRigs();
      state.adt_active = typeof r.adt_active === "number" ? r.adt_active : 0;
      state.adt_custom = r.adt_custom || { CAMERAS: [], SCOPES: [], FILTERS: [] };
      fillDatalists();
      renderRigs();
    });
  }
  function persist(cb) { chrome.storage.local.set({ adt_rigs: state.adt_rigs, adt_active: state.adt_active, adt_custom: state.adt_custom }, cb || (() => {})); }

  function defaultRigs() {
    return [{
      label: "150PDS + 178", scopeModel: "Sky-Watcher 150PDS", aperture_mm: 150, focal_mm: 750,
      cameraModel: "ToupTek G3M178C", cameraType: "color", pixel_um: 2.4,
      broadbandFilterModel: "No filter / OSC broadband", narrowbandFilterModel: "Optolong L-eXtreme 1.25\"",
      sky_bortle: "4.5", sky_sqm: null, moonless: true
    }];
  }

  // ---------- rig list ----------
  function renderRigs() {
    const list = $("rigList"); list.innerHTML = "";
    if (!state.adt_rigs.length) { list.innerHTML = '<p class="hint">No rigs yet. Add one to get personal numbers.</p>'; return; }
    state.adt_rigs.forEach((rig, i) => {
      const div = document.createElement("div");
      div.className = "rig" + (i === state.adt_active ? " active" : "");
      const ap = rig.aperture_mm || (findModel("SCOPES", rig.scopeModel) || {}).aperture_mm || "?";
      const sky = rig.sky_sqm != null ? `SQM ${rig.sky_sqm}` : (rig.sky_bortle ? `Bortle ${rig.sky_bortle}` : "sky ?");
      div.innerHTML =
        `<span class="name">${esc(rig.label || "rig " + (i + 1))}</span>` +
        `<span class="meta">${ap}mm · ${esc(rig.cameraModel || rig.cameraType || "?")} · ${sky}${rig.moonless ? " · moonless" : ""}</span>` +
        `<span class="spacer"></span>` +
        (i === state.adt_active ? '<span class="pill">active</span>' : '<a data-act="activate">set active</a>') +
        '<a data-act="edit">edit</a>';
      div.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
        if (a.dataset.act === "activate") { state.adt_active = i; persist(); renderRigs(); status("Active rig updated."); }
        else openEditor(i);
      }));
      list.appendChild(div);
    });
  }

  // ---------- editor ----------
  function openEditor(i) {
    editIndex = i;
    const rig = i == null ? {} : state.adt_rigs[i];
    $("editorTitle").textContent = i == null ? "Add rig" : "Edit rig";
    $("f_label").value = rig.label || "";
    $("f_scope").value = rig.scopeModel || "";
    $("f_aperture").value = rig.aperture_mm || "";
    $("f_focal").value = rig.focal_mm || "";
    $("f_fratio").value = rig.f_ratio || "";
    $("f_camera").value = rig.cameraModel || "";
    $("f_camtype").value = rig.cameraType || "color";
    $("f_pixel").value = rig.pixel_um || "";
    $("f_qelum").value = rig.qe_lum || "";
    $("f_bb").value = rig.broadbandFilterModel || "";
    $("f_nb").value = rig.narrowbandFilterModel || "";
    $("f_bortle").value = rig.sky_bortle || "";
    $("f_sqm").value = rig.sky_sqm != null ? rig.sky_sqm : "";
    $("f_moonless").checked = rig.moonless !== false;
    $("deleteRig").hidden = i == null;
    $("editorCard").hidden = false;
    $("editorCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeEditor() { $("editorCard").hidden = true; editIndex = null; }

  function readEditor() {
    const num = (id) => { const v = parseFloat($(id).value); return isFinite(v) ? v : null; };
    const scopeModel = $("f_scope").value.trim();
    const sm = findModel("SCOPES", scopeModel);
    const cameraModel = $("f_camera").value.trim();
    const cm = findModel("CAMERAS", cameraModel);
    return {
      label: $("f_label").value.trim() || scopeModel || "rig",
      scopeModel: sm ? sm.model : "",
      aperture_mm: num("f_aperture") || (sm ? sm.aperture_mm : null),
      focal_mm: num("f_focal") || (sm ? sm.focal_mm : null),
      f_ratio: num("f_fratio") || (sm ? sm.f_ratio : null),
      cameraModel: cm ? cm.model : "",
      cameraType: cm ? cm.type : $("f_camtype").value,
      pixel_um: num("f_pixel") || (cm ? cm.pixel_um : null),
      qe_lum: num("f_qelum") || (cm ? cm.qe_lum : null),
      qe_ha: cm ? cm.qe_ha : null, qe_oiii: cm ? cm.qe_oiii : null, qe_sii: cm ? cm.qe_sii : null,
      broadbandFilterModel: $("f_bb").value.trim(),
      narrowbandFilterModel: $("f_nb").value.trim(),
      sky_bortle: $("f_bortle").value || null,
      sky_sqm: num("f_sqm"),
      moonless: $("f_moonless").checked
    };
  }

  // auto-complete third optical value
  function wireOptics() {
    const ap = $("f_aperture"), fo = $("f_focal"), fr = $("f_fratio");
    function recompute(changed) {
      const a = parseFloat(ap.value), f = parseFloat(fo.value), r = parseFloat(fr.value);
      if (changed !== "fr" && isFinite(a) && isFinite(f)) fr.value = (f / a).toFixed(1);
      else if (changed !== "fo" && isFinite(a) && isFinite(r)) fo.value = Math.round(a * r);
      else if (changed !== "ap" && isFinite(f) && isFinite(r)) ap.value = Math.round(f / r);
    }
    ap.addEventListener("input", () => recompute("ap"));
    fo.addEventListener("input", () => recompute("fo"));
    fr.addEventListener("input", () => recompute("fr"));
    $("f_scope").addEventListener("change", () => {
      const s = findModel("SCOPES", $("f_scope").value);
      if (s) { ap.value = s.aperture_mm; fo.value = s.focal_mm; fr.value = s.f_ratio; }
    });
    $("f_camera").addEventListener("change", () => {
      const c = findModel("CAMERAS", $("f_camera").value);
      if (c) { $("f_camtype").value = c.type; $("f_pixel").value = c.pixel_um; $("f_qelum").value = c.qe_lum; }
    });
  }

  // ---------- add custom gear ----------
  const FIELDS = {
    CAMERAS: [["type", "mono/color"], ["pixel_um", "µm"], ["qe_lum", "0–1"], ["qe_ha", "0–1"], ["qe_oiii", "0–1"], ["qe_sii", "0–1"]],
    SCOPES: [["aperture_mm", "mm"], ["focal_mm", "mm"], ["f_ratio", "f/"]],
    FILTERS: [["kind", "broadband/line"], ["bands", "e.g. Ha or Ha,OIII"], ["bandwidth_nm", "nm"], ["transmission", "0–1"]]
  };
  function renderGearFields() {
    const cat = $("g_cat").value, wrap = $("g_fields"); wrap.innerHTML = "";
    FIELDS[cat].forEach(([key, ph]) => {
      const l = document.createElement("label"); l.textContent = key;
      const inp = document.createElement("input"); inp.id = "g_" + key; inp.placeholder = ph;
      l.appendChild(inp); wrap.appendChild(l);
    });
  }
  function addGear() {
    const cat = $("g_cat").value, model = $("g_model").value.trim();
    if (!model) { status("Give the gear a model name."); return; }
    const item = { model };
    FIELDS[cat].forEach(([key]) => {
      let v = ($("g_" + key) || {}).value;
      if (v == null || v === "") return;
      if (key === "bands") item[key] = v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      else if (["type", "kind"].includes(key)) item[key] = v.trim();
      else item[key] = parseFloat(v);
    });
    state.adt_custom[cat] = state.adt_custom[cat] || [];
    state.adt_custom[cat].push(item);
    persist(() => { fillDatalists(); status(`Added ${model} to ${cat.toLowerCase()}.`); $("g_model").value = ""; renderGearFields(); });
  }

  // ---------- CSV ----------
  const CSV_COLS = ["category", "model", "type", "pixel_um", "qe_lum", "qe_ha", "qe_oiii", "qe_sii",
                    "aperture_mm", "focal_mm", "f_ratio", "kind", "bands", "bandwidth_nm", "transmission", "aka", "note"];
  function exportCSV() {
    const rows = [CSV_COLS.join(",")];
    const dump = (cat) => allOf(cat).forEach((x) => {
      const r = CSV_COLS.map((c) => {
        if (c === "category") return cat;
        let v = x[c]; if (v == null) return "";
        if (Array.isArray(v)) v = v.join(";");
        v = String(v); return /[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      });
      rows.push(r.join(","));
    });
    ["CAMERAS", "SCOPES", "FILTERS"].forEach(dump);
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "astrobin_depth_equipment.csv"; a.click();
    status("Exported equipment CSV.");
  }
  function importCSV(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = reader.result.split(/\r?\n/).filter((l) => l.trim());
        const head = splitCsv(lines[0]);
        let added = 0;
        for (let i = 1; i < lines.length; i++) {
          const cells = splitCsv(lines[i]); const o = {};
          head.forEach((h, j) => { o[h] = cells[j]; });
          const cat = (o.category || "").toUpperCase(); if (!FIELDS[cat] || !o.model) continue;
          const item = { model: o.model };
          FIELDS[cat].forEach(([key]) => {
            const v = o[key]; if (v == null || v === "") return;
            if (key === "bands") item[key] = v.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
            else if (["type", "kind"].includes(key)) item[key] = v;
            else item[key] = parseFloat(v);
          });
          if (o.aka) item.aka = o.aka;
          state.adt_custom[cat] = state.adt_custom[cat] || [];
          if (!state.adt_custom[cat].some((x) => x.model === item.model) && !D[cat].some((x) => x.model === item.model)) {
            state.adt_custom[cat].push(item); added++;
          }
        }
        persist(() => { fillDatalists(); status(`Imported ${added} new item(s).`); });
      } catch (e) { status("Couldn't parse that CSV."); }
    };
    reader.readAsText(file);
  }
  function splitCsv(line) {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else { if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
    }
    out.push(cur); return out.map((s) => s.trim());
  }

  function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ---------- wire up ----------
  document.addEventListener("DOMContentLoaded", () => {
    wireOptics();
    renderGearFields();
    $("addRig").addEventListener("click", () => openEditor(null));
    $("cancelRig").addEventListener("click", closeEditor);
    $("saveRig").addEventListener("click", () => {
      const rig = readEditor();
      if (!rig.aperture_mm) { status("Aperture is required (pick a scope or type it)."); return; }
      if (editIndex == null) state.adt_rigs.push(rig); else state.adt_rigs[editIndex] = rig;
      if (state.adt_active >= state.adt_rigs.length) state.adt_active = 0;
      persist(() => { renderRigs(); closeEditor(); status("Rig saved."); });
    });
    $("deleteRig").addEventListener("click", () => {
      if (editIndex != null) { state.adt_rigs.splice(editIndex, 1); if (state.adt_active >= state.adt_rigs.length) state.adt_active = Math.max(0, state.adt_rigs.length - 1); }
      persist(() => { renderRigs(); closeEditor(); status("Rig deleted."); });
    });
    $("g_cat").addEventListener("change", renderGearFields);
    $("g_add").addEventListener("click", addGear);
    $("csv_export").addEventListener("click", exportCSV);
    $("csv_import").addEventListener("change", (e) => { if (e.target.files[0]) importCSV(e.target.files[0]); });
    load();
  });
})();

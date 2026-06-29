# AstroBin Depth Translator

A Chrome extension for **app.astrobin.com**. On any image page it adds a panel
above the Integration table that answers: *how deep is this image's data really,
and how long would my rig need to match it?*

Raw integration hours can't be compared across rigs (different aperture, f-ratio,
sky). This measures **depth per unit area of sky** (signal-to-noise) and reports
the equivalent time on a fixed **reference setup** (so any two images compare at a
glance) and on **your own rig**, split by broadband and each narrowband line.

## Install (load unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `astrobin-depth-translator` folder.
3. Open any image at `app.astrobin.com/i/...` (or the Image-of-the-Day overlay).
   A default **150PDS + 178** rig is pre-loaded so it works immediately.

## Using it

- The panel shows **≈ N reference-hours** (a fixed 203 mm / Bortle 4 / no-moon
  yardstick) and, under it, the time on your rig per band.
- **Hover any number** to see the formula with your values substituted:
  `your time = image time × (their ÷ your aperture)² × sensor+filter × (sky+bandwidth)`.
- Click **⚙ gear** to set up your gear inline (no separate page):
  - Type-ahead fields search **AstroBin's equipment database** live (plus your own
    gear); or leave a field blank and just enter raw specs (aperture, QE, etc.).
  - Add **multiple narrowband filters** as chips, or a ready-made SHO bundle.
  - Bortle is a number field; SQM optional; "I shoot moonless" toggle.
  - **Add custom gear** (private, stored locally) for anything not in the database.
- A **confidence** badge (hover it) shows which inputs are known vs estimated.
- **Could your gear capture this detail?** open the per-pixel planner to find which scope/camera
  reproduces the image's detail at 1:1 on your sensor. Adjust focal length, aperture, or
  f-ratio (lock one) and it shows whether you'd match the resolution and the time to get
  there - depth tells you how much signal, this tells you how much detail.

## Where the data comes from

- The image's integration, equipment, sky, and pixel scale are read from the page.
- Telescope aperture, filter bandwidth, and camera sensor specs are pulled from
  **AstroBin's own public equipment API** and cached locally.
- A small built-in table fills the gaps AstroBin doesn't publish - chiefly sensor
  **QE** (often missing/peak-only there) and filter **transmission** (never there).

## Honest limits

- It estimates **depth** (how much signal the data holds), not artistic quality.
- Numbers are physically-grounded estimates, only as good as what each image's
  author entered. The confidence badge flags assumptions.
- Per-area depth tracks **aperture**, not f-ratio - a fast f-ratio is a per-pixel
  speed effect that this (resolution-independent) metric intentionally factors out.
- Planetary/lucky-imaging is ignored; "Multiband" totals are approximated as one
  narrowband line.

## Privacy

Everything runs in your browser. Nothing is sent anywhere by default. There is an
**optional, off-by-default** "share anonymous usage data" toggle (random install
id, gear/settings used, errors - no personal data); to actually collect it you set
`ANALYTICS_ENDPOINT` in `src/background.js` and add its domain to `host_permissions`.
See `PRIVACY.md`.

## Files

```
manifest.json        MV3 manifest + icons
icons/               extension icons (16/48/128)
src/equipment.js     gear table, Bortle→SQM, reference rig, constants
src/engine.js        per-area depth + translator math
src/parser.js        reads the AstroBin image-page DOM
src/content.js       panel, inline gear UI, AstroBin lookups, caching
src/background.js     opt-in analytics relay (off by default)
src/panel.css        styling (AstroBin dark theme)
equipment.csv/.xlsx  editable copy of the seed table
PRIVACY.md           privacy policy
STORE_LISTING.md     Chrome Web Store copy
```

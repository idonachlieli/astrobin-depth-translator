# Chrome Web Store listing - AstroBin Depth Translator

This file is a copy‑paste source for the Web Store Developer Dashboard. Each
heading maps to a field in the "Store listing" or "Privacy practices" tab.
Requirements verified against Google's current docs (June 2026).

---

## Store listing tab

### Item name
AstroBin Depth Translator

### Summary (short description - 132 characters max)
On any AstroBin image, estimate how deep its data really is and how long your own gear and sky would need to match it.

### Category
Tools  (alternative: Photos)

### Language
English

### Detailed description

**Integration time lies. Aperture, sky, and sensor decide how deep an image really is.**

AstroBin Depth Translator adds a small panel to any image on AstroBin and answers the question every astrophotographer asks while scrolling: *"how much real data is in this, and how long would it take **me** to match it?"*

Raw hours mean nothing across different apertures, f‑ratios, and skies. Instead of comparing hours, this tool measures **depth per unit area of sky** - signal‑to‑noise, the honest currency of deep‑sky imaging - and translates it into:

- a fixed **reference setup**, so any two images are comparable at a glance, and
- **your own rig and sky**, broken down by broadband and each narrowband line, with broadband / narrowband / combined totals.

**Highlights**

- Reads the image's gear and integration automatically, and pulls aperture, sensor, and filter specs straight from AstroBin's own public equipment database - so it works for virtually any setup.
- Set up your telescopes, cameras, filters, and sky once (type‑ahead search, or just enter raw specs). Switch between multiple saved rigs.
- Handles colour and mono, broadband (LRGB) and narrowband (Hα/OIII/SII), dual‑band filters and SHO filter sets, moonlight, and Bortle/SQM skies.
- Hover any number to see the full calculation with your own values substituted in - no black boxes.
- A confidence indicator shows when a value is measured vs. estimated.
- **Could your gear capture this detail?** an interactive per‑pixel planner shows which scope and camera would reproduce this image's detail at 1:1 on your sensor - adjust focal length, aperture, or f‑ratio and it tells you whether you'd match the image's resolution and the integration time to get there. So you can plan for detail, not just depth.

**What it is not:** it estimates *depth* (how much signal the data holds), not artistic quality, framing, or processing. The numbers are physically grounded estimates, only as good as the metadata each image's author entered.

**Private by design:** everything runs in your browser. It reads only the AstroBin page you're viewing and AstroBin's public equipment API; it stores your gear settings locally and sends nothing anywhere by default. See the privacy policy for details.

*Independent project - not affiliated with or endorsed by AstroBin.*

---

## Privacy practices tab

### Single purpose (required)
A single‑purpose statement Google requires - paste verbatim:

> AstroBin Depth Translator has one purpose: on app.astrobin.com / www.astrobin.com image pages, it reads the publicly shown acquisition details and estimates the image's signal‑to‑noise "depth," then translates that into the equivalent exposure time on a reference setup and on the user's own gear.

### Permission justifications (required, one per permission)
- **storage** - Saves the user's own gear/rig settings and caches equipment specifications locally so they aren't re‑fetched. Nothing is sent off‑device.
- **Host permission `https://app.astrobin.com/*` and `https://www.astrobin.com/*`** - Needed to read the acquisition details on the AstroBin image page the user is viewing, and to query AstroBin's public equipment API for telescope/camera/filter specifications.
- **Host permission `https://astrobin-analytics.idonachlieli.workers.dev/*`** - The endpoint that receives the optional, opt-in usage data. Only contacted when the user has turned on "share usage data"; otherwise never. No other sites are accessed.

> The extension requests **no** broad host permissions, no `tabs`, no `activeTab`, no scripting on other sites, and no remote code. All code is contained in the package.

### Remote code
**No** - the extension executes only code included in the package.

### Data usage / data collection disclosures
**As shipped, analytics is ON:** `ANALYTICS_ENDPOINT` in `src/background.js` points to a live Cloudflare Worker, and the `workers.dev` host is in `host_permissions`. The "Help improve this extension (share usage data)" toggle is **off by default** and data is sent **only after the user opts in** - but because a working endpoint ships, the store answer is:

- "Does this item collect user data?" -> **Yes**.
- Declare these data types: **Website content** (the image's public acquisition metadata), **Web history / Website activity** (the canonical AstroBin image-page URL the user analyzes), and **User activity** (errors). It is optional (opt-in) and used only to improve the extension.
- Certify the three required statements (all true): you do **not** sell user data; you do **not** use it for purposes unrelated to the single purpose; you do **not** use it for creditworthiness or lending.

When opted in, the analytics sends: the canonical AstroBin image-page URL, that image's public acquisition details (gear, integration, sky), the gear/settings used, custom gear, errors, and a random install id. That is pseudonymous usage data, disclosed here and in PRIVACY.md.

> To ship with analytics OFF instead: set `ANALYTICS_ENDPOINT = ""`, remove the `workers.dev` host permission, and then the answer above becomes **No**.

### Privacy policy URL (required)
A publicly accessible URL is **mandatory** because the extension uses `storage` and host permissions. Host `PRIVACY.md` somewhere public and paste the URL here. Easiest options:
- Push the GitHub repo public and use the rendered file URL, e.g. `https://github.com/idonachlieli/astrobin-depth-translator/blob/main/astrobin-depth-translator/PRIVACY.md`
- Or enable GitHub Pages and link the rendered page
- Or paste the policy text into a public GitHub Gist and link that

---

## Images to upload (see store-assets/ folder)
- **Store icon:** 128×128 PNG (the packaged `icons/icon128.png` works).
- **Screenshots:** at least one, up to five, at **1280×800** (or 640×400). Provided: `screenshot_1280x800_*.png`.
- **Small promo tile (required):** **440×280** PNG/JPEG. Provided: `promo_small_440x280.png`.
- **Marquee promo tile (optional):** **1400×560**. Provided: `promo_marquee_1400x560.png`.

---

## Manifest facts (for the reviewer's context)
- Manifest V3 ✔ · Version 0.1.1 · Permissions: `storage` + the two AstroBin host permissions + the analytics worker host (`astrobin-analytics.idonachlieli.workers.dev`, used only for opt-in usage data).

## CURRENT SHIPPING DECISION (v0.1, analytics ON)
This build has a live analytics endpoint, so on the Data-usage form:
- "Does this item collect user data?" → **Yes**.
- Declare: **Website content** (the image's public acquisition metadata) and **Web history / Website activity** (the AstroBin image-page URL analyzed) and **User activity** (errors). It is opt-in and used only to improve the extension.
- Certify all three statements (do not sell; only for the single purpose; not for creditworthiness).
- Privacy policy URL is required (PRIVACY.md, hosted on the public GitHub repo).

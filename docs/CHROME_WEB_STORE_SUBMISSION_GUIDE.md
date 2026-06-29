# Publishing AstroBin Depth Translator - step‑by‑step

A walkthrough tailored to this extension. Requirements verified against Google's
current docs (June 2026). Everything you need is already prepared:

| What | Where |
|---|---|
| Upload package | `astrobin-depth-translator_0.1.1.zip` (project root) |
| Listing text (copy‑paste) | `astrobin-depth-translator/STORE_LISTING.md` |
| Privacy policy (must be hosted) | `astrobin-depth-translator/PRIVACY.md` |
| Store images | `store-assets/` (screenshots, promo tiles) |

Plan on ~20–30 minutes of form‑filling, then a few days of review.

---

## Step 0 - Host the privacy policy first (required)

Google **requires a publicly accessible privacy‑policy URL** because the extension
uses `storage` and host permissions. You can't finish submission without it, so do
this first. Easiest route given you already use GitHub Desktop:

1. Publish the `astrobin-depth-translator` repo to GitHub as **public**
   (GitHub Desktop → Publish repository, untick "Keep this code private").
2. Your policy URL is then the rendered file, e.g.
   `https://github.com/idonachlieli/astrobin-depth-translator/blob/main/PRIVACY.md`

No public repo? Two alternatives: paste the contents of `PRIVACY.md` into a public
**GitHub Gist** and use its URL, or turn on **GitHub Pages** for the repo. Any
permanently public URL works.

---

## Step 1 - Register a developer account ($5, one‑time)

1. Go to the **Chrome Web Store Developer Dashboard**:
   `https://chrome.google.com/webstore/devconsole`
2. Sign in with the Google account you want to own the listing. (Tip: a dedicated
   account is fine; this email receives all review notices.)
3. Pay the **one‑time $5 USD** registration fee. It covers all your future
   extensions. You may also be asked to verify contact info / accept the terms.

---

## Step 2 - Create the item and upload the package

1. In the dashboard click **"Add new item."**
2. Upload **`astrobin-depth-translator_0.1.1.zip`** (it has `manifest.json` at the
   root - that's what Google expects). It's Manifest V3 with only `storage` + the
   two AstroBin host permissions, so it should validate cleanly.

---

## Step 3 - Fill the Store listing tab

Open `STORE_LISTING.md` and copy each field across:

- **Item name:** AstroBin Depth Translator
- **Summary:** the one‑line short description (≤132 chars)
- **Description:** the detailed description block
- **Category:** Tools (or Photos)
- **Language:** English

Then upload the images from `store-assets/`:

- **Store icon (128×128):** the packaged `icons/icon128.png` (already in the zip;
  re‑upload the same file here if asked).
- **Screenshots (1280×800, ≥1, up to 5):** `screenshot_1280x800_overview.png`,
  `screenshot_1280x800_yourgear.png`.
- **Small promo tile (440×280, required):** `promo_small_440x280.png`.
- **Marquee promo tile (1400×560, optional):** `promo_marquee_1400x560.png`.

---

## Step 4 - Fill the Privacy practices tab

From the matching section of `STORE_LISTING.md`:

1. **Single purpose** - paste the single‑purpose statement.
2. **Permission justifications** - paste the `storage` and host‑permission
   justifications (one per permission Google lists).
3. **Remote code:** select **No** (all code ships in the package).
4. **Data usage:** as shipped, analytics is **ON** (live endpoint, opt-in). Answer
   **"collects user data" = Yes** and declare **Website content**, **Web history /
   Website activity**, and **User activity**, then certify the three required
   statements (no selling, no unrelated use, no creditworthiness use). See
   `STORE_LISTING.md` for the exact wording.
5. **Privacy policy URL:** paste the public URL from Step 0.

> To ship with analytics OFF instead: set `ANALYTICS_ENDPOINT = ""` in
> `src/background.js`, remove the `workers.dev` host permission, rebuild, and then
> answer "collects user data" = No.

---

## Step 5 - Distribution & submit

1. Set visibility to **Public** (or **Unlisted** if you'd rather share by link
   first and make it public later - Unlisted is a great way to soft‑launch).
2. Pick regions (default: all).
3. Click **Submit for review.**

Review typically takes anywhere from a few hours to a few days. You'll get an email
when it's approved or if changes are requested. Extensions with narrow permissions
and a clear single purpose (like this one) usually pass smoothly.

---

## Step 6 - After approval

- You'll get a public listing URL like
  `https://chromewebstore.google.com/detail/<your-id>`. Share it.
- **Discoverability is weak for brand‑new extensions** - search ranking favours
  install count and reviews you don't have yet. Most early installs come from you
  sharing the link directly: your AstroBin profile, Cloudy Nights, the
  r/astrophotography subreddit, astro Discord/Facebook groups, and forum
  signatures. Ask early users to leave a rating.
- To ship updates later: bump `version` in `manifest.json`, re‑zip, and upload a
  new package to the same item.

---

## Pre‑submit checklist

- [ ] Privacy policy is live at a public URL
- [ ] $5 developer registration paid
- [ ] `astrobin-depth-translator_0.1.1.zip` uploaded and validated
- [ ] Name, summary, description, category filled
- [ ] Store icon + ≥1 screenshot (1280×800) + small promo tile (440×280) uploaded
- [ ] Single purpose + permission justifications pasted
- [ ] Data‑usage answers set and three certifications checked
- [ ] Privacy policy URL pasted
- [ ] Visibility chosen → Submit for review

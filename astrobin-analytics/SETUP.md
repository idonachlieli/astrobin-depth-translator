# AstroBin Depth Translator — analytics collector

This collects the **opt-in, anonymous** usage data your extension already
sends (only when a user ticks the consent box). It stores every event in a
free Cloudflare database, and gives you two scripts to pull that data into one
local file and summarize it.

Everything here is on Cloudflare's **free** tier (100k requests/day, 5 GB,
100k DB writes/day). A hobby extension won't get close. No credit card needed.

---

## What gets stored

One row per event, in a table called `events`. Each row has: a random
`install_id` (no name, no account), the extension version, the event name, a
timestamp, and a JSON `data` blob. Event types:

| event           | data it carries                                              |
|-----------------|--------------------------------------------------------------|
| `opt_in`        | (nothing — just marks that someone turned sharing on)        |
| `rig_saved`     | scope, camera, broadband filter, narrowband filters, sky     |
| `custom_gear`   | category + model of a custom piece of gear they added        |
| `image_analyzed`| AstroBin image URL, scope, camera, filters, sky, channels    |
| `error`         | the error message (first 200 chars)                          |

---

## One-time setup (~10 minutes)

You need [Node.js](https://nodejs.org) installed (you already have it). All
commands run from this folder (`astrobin-analytics`).

### 1. Make a free Cloudflare account
Go to https://dash.cloudflare.com/sign-up — email + password, no card.

### 2. Log in from the command line
```
npx wrangler login
```
This opens a browser to authorize. (`npx` downloads wrangler on first use.)

### 3. Create the database
```
npx wrangler d1 create astrobin-analytics
```
It prints a block ending in `database_id = "xxxxxxxx-...."`.
**Copy that id** into `wrangler.toml` (replace `PASTE_DATABASE_ID_HERE`).

### 4. Create the table
```
npx wrangler d1 execute astrobin-analytics --remote --file=schema.sql
```

### 5. Set your secret read key
Pick any long random password — this is what protects your data from being
downloaded by anyone else.
```
npx wrangler secret put DUMP_KEY
```
Paste your password when prompted. Keep a copy.

### 6. Deploy
```
npx wrangler deploy
```
It prints your live URL, e.g.
`https://astrobin-analytics.your-name.workers.dev`. **Copy it.**

### 7. Point the extension at it
Open `../astrobin-depth-translator/src/background.js` and set:
```js
const ANALYTICS_ENDPOINT = "https://astrobin-analytics.your-name.workers.dev/collect";
```
Then add your **exact** Worker host to `../astrobin-depth-translator/manifest.json`
`host_permissions` (use the real subdomain, NOT a `*.workers.dev` wildcard — the
Web Store flags broad permissions):
```json
"host_permissions": [
  "https://app.astrobin.com/*",
  "https://www.astrobin.com/*",
  "https://astrobin-analytics.your-name.workers.dev/*"
]
```
Then reload the unpacked extension at `chrome://extensions` (↻). If you publish
with a live endpoint, update STORE_LISTING.md too (it currently — correctly for
v0.1 — states the extension requests no broad host permissions).

That's it. From now on, when a user opts in, their events land in your
database.

---

## Seeing your data

Create your config once:
```
copy config.example.json config.json   (Windows)
```
Edit `config.json` and fill in your worker URL and the `DUMP_KEY` you chose.

Then any time you want fresh data:
```
python pull_data.py     # downloads new events into data/events.ndjson
python analyze.py       # prints a short summary
```

`pull_data.py` only fetches events you don't already have, then appends them to
`data/events.ndjson` — one event per line, the whole dataset in a single file.

`analyze.py` reads that file and prints counts, top gear, the funnel
(opted-in → saved a rig → analyzed an image), most-analyzed images, and any
errors. Add `--json` for machine-readable output.

### Letting Claude analyze it
Just say "pull and summarize my extension analytics." Claude runs the two
scripts and reads `analyze.py`'s short summary instead of the raw file, so it
stays cheap even with lots of data. For deeper questions Claude can read
`data/events.ndjson` directly or write one-off queries.

---

## Quick test (optional, before any real users)
Send yourself a fake event to confirm the pipe works:
```
curl -X POST https://astrobin-analytics.your-name.workers.dev/collect ^
  -H "Content-Type: application/json" ^
  -d "{\"id\":\"test\",\"v\":\"0.1.0\",\"event\":\"opt_in\",\"ts\":0,\"data\":{}}"
```
Then `python pull_data.py && python analyze.py` — you should see 1 event.

---

## Files here
- `worker.js` — the Cloudflare Worker (collect + protected dump endpoints)
- `schema.sql` — the database table
- `wrangler.toml` — Cloudflare deploy config (add your database_id)
- `pull_data.py` — download events into `data/events.ndjson`
- `analyze.py` — print a compact summary
- `config.example.json` — copy to `config.json` and fill in
- `data/` — your downloaded events live here (git-ignored)

## Abuse / limits
`/collect` is public (it has to be — browsers call it). The Worker only accepts
the five known event names and caps each payload at 8 KB, so junk is limited.
If you ever see flooding (the free tier allows 100k DB writes/day), add a free
Cloudflare **Rate limiting rule** in the dashboard (Security → WAF) on the
`/collect` path — e.g. 60 requests/min per IP. No code change needed.

## Privacy note
`config.json` and `data/` are git-ignored so your secret key and collected data
never get pushed. The data is anonymous by design, but if you publish to the
Chrome Web Store with a live endpoint, set the data-collection disclosure to
**Yes** (Website content + web activity) — see the extension's `STORE_LISTING.md`.

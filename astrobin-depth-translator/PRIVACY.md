# Privacy Policy - AstroBin Depth Translator

_Last updated: 2026-06-27_

AstroBin Depth Translator is a browser extension that runs entirely in your
browser. It is built to respect your privacy.

## What it does

- It reads the **publicly visible acquisition details** of the AstroBin image
  page you are currently viewing (integration time, equipment, sky data) to
  compute an estimate, locally, on your computer.
- It queries **AstroBin's own public equipment API** (the same data the website
  itself loads) to look up telescope, camera, sensor, and filter specifications.

## What it stores

- **Your settings** - the rigs and gear you enter, and any custom gear you add -
  are saved **locally in your browser** (Chrome's `storage.local`). They never
  leave your device.
- **Cached equipment specs** fetched from AstroBin are also stored locally, only
  so the extension doesn't have to request the same item twice.

## What it does NOT do

- It has **no advertising** and does not track you across the web.
- It does **not** require an account, login, or any sign-in.
- It does **not** read pages other than AstroBin, or your general browsing history.
- **By default it sends nothing off your device.** The only data that can ever
  leave is the optional usage data described below, and only if you switch it on.

## Optional usage data (off by default)

This is **off by default.** It does nothing unless you tick *"Help improve this
extension - share usage data"* in the settings **and** a collection endpoint has
been configured by the developer. If both are true, then when you analyze an image
the extension sends:

- the **AstroBin image page URL** you analyzed,
- that image's **public acquisition details** shown on the page (telescope, camera,
  filters, integration time, Bortle/SQM sky) - the same information AstroBin already
  displays publicly,
- the **gear and settings** you use, and any **custom gear** you add,
- **error messages**,
- all tagged with a **random install id** (not linked to your name or any account).

This is used only to understand how the extension is used and to fix bugs. It is
**pseudonymous**, not strictly anonymous: the random id ties together the events
from a single installation. It never includes your name, your AstroBin login, your
email, or any browsing outside AstroBin. You can turn it off at any time by
unticking the box.

## Permissions

- **Storage** - to save your gear settings and cache equipment specs locally.
- **Access to `app.astrobin.com` / `www.astrobin.com`** - to read the image page
  you're viewing and to query AstroBin's public equipment API.

## Changes

If a future version ever introduces optional data collection (for example, an
opt-in feature to help improve the extension), it will be **off by default**,
clearly disclosed, and this policy will be updated before it ships.

## Contact

Questions: open an issue on the project's repository, or contact the developer
listed on the Chrome Web Store page.

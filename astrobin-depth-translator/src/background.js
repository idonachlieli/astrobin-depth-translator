/*
 * AstroBin Depth Translator - background service worker
 * --------------------------------------------------------------------------
 * Relays OPT-IN, anonymous usage events to a collection endpoint.
 *
 * Disabled by default: nothing is sent unless BOTH
 *   (1) ANALYTICS_ENDPOINT below is set to your backend URL, AND
 *   (2) the user has ticked the consent box in the panel's settings
 *       (the content script only sends events when consent is on).
 *
 * To enable later: set ANALYTICS_ENDPOINT and add its domain to
 * "host_permissions" in manifest.json (add the EXACT worker subdomain, not a
 * wildcard). Events stay anonymous: no names, no AstroBin accounts. The only
 * URL sent is the public AstroBin image page the user is viewing (image_analyzed),
 * which the consent text and PRIVACY.md disclose.
 */
// After deploying the Cloudflare Worker (see ../astrobin-analytics/SETUP.md),
// paste your Worker URL + "/collect" here. Leave "" to keep collection OFF.
const ANALYTICS_ENDPOINT = ""; // e.g. "https://astrobin-analytics.YOUR-SUBDOMAIN.workers.dev/collect"

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "adt_track" || !ANALYTICS_ENDPOINT) return;
  try {
    fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload),
      keepalive: true
    }).catch(() => {});
  } catch (e) { /* ignore */ }
});

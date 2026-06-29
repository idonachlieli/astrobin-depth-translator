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
const ANALYTICS_ENDPOINT = "https://astrobin-analytics.idonachlieli.workers.dev/collect";

// Defense-in-depth (#9): validate the relayed payload before sending. The worker
// also validates, but this avoids putting junk on the wire in the first place.
const ADT_EVENTS = ["opt_in", "rig_saved", "custom_gear", "image_analyzed", "error"];
function validPayload(p) {
  if (!p || typeof p !== "object") return false;
  if (ADT_EVENTS.indexOf(p.event) === -1) return false;
  if (typeof p.id !== "string" || p.id.length > 64) return false;
  if (p.data == null || typeof p.data !== "object" || Array.isArray(p.data)) return false;
  let s; try { s = JSON.stringify(p); } catch (e) { return false; }
  return s.length <= 16000;                 // cap serialized size
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender || sender.id !== chrome.runtime.id) return;   // only our own extension contexts (#5)
  if (!msg || msg.type !== "adt_track" || !ANALYTICS_ENDPOINT) return;
  if (!validPayload(msg.payload)) return;
  // Re-confirm opt-in consent at the actual network sink, not just in content.js (#5):
  // stale or buggy senders can't leak data without consent stored on this device.
  chrome.storage.local.get(["adt_analytics"], (r) => {
    if (!(r && r.adt_analytics)) return;
    try {
      fetch(ANALYTICS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg.payload),
        keepalive: true
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  });
});

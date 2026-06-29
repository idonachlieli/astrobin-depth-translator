/*
 * AstroBin Depth Translator — analytics collector (Cloudflare Worker)
 * --------------------------------------------------------------------------
 * Two jobs:
 *   POST /collect          <- the extension sends opt-in events here. Open to
 *                             anyone (it has to be — it's called from browsers).
 *   GET  /dump?key=SECRET   -> returns EVERY stored event as NDJSON (one JSON
 *                             object per line). Protected by your DUMP_KEY so
 *                             only you can read the data back out.
 *   GET  /                  -> health check ("ok").
 *
 * Storage: a single D1 (SQLite) table called `events`. See schema.sql.
 *
 * Set DUMP_KEY as a secret:  npx wrangler secret put DUMP_KEY
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Health check
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("ok", { headers: CORS });
    }

    // ---- Collect an event ----
    if (request.method === "POST" && url.pathname === "/collect") {
      let p;
      try {
        p = await request.json();
      } catch (e) {
        return json({ error: "bad json" }, 400);
      }
      // Expected shape: { id, v, event, ts, data }
      // Only accept the known event names — keeps junk/abuse out of the table.
      const ALLOWED = ["opt_in", "rig_saved", "custom_gear", "image_analyzed", "error"];
      if (!p || typeof p.event !== "string" || !ALLOWED.includes(p.event)) {
        return json({ error: "bad event" }, 400);
      }
      // Guard against junk: cap the stored data blob size.
      let dataStr = "";
      try {
        dataStr = JSON.stringify(p.data ?? {});
      } catch (e) {
        dataStr = "{}";
      }
      if (dataStr.length > 8000) dataStr = dataStr.slice(0, 8000);

      try {
        await env.DB.prepare(
          "INSERT INTO events (install_id, v, event, ts, data, received_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
          .bind(
            str(p.id, 64),
            str(p.v, 16),
            str(p.event, 64),
            Number.isFinite(p.ts) ? Math.trunc(p.ts) : Date.now(),
            dataStr,
            Date.now()
          )
          .run();
      } catch (e) {
        return json({ error: "db" }, 500);
      }
      return new Response(null, { status: 204, headers: CORS });
    }

    // ---- Dump all events (NDJSON), protected by ?key= ----
    if (request.method === "GET" && url.pathname === "/dump") {
      if (!env.DUMP_KEY || url.searchParams.get("key") !== env.DUMP_KEY) {
        return json({ error: "unauthorized" }, 401);
      }
      // Optional incremental pull: /dump?key=...&since=<row_id>
      const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;
      const { results } = await env.DB.prepare(
        "SELECT row_id, install_id, v, event, ts, data, received_at FROM events WHERE row_id > ? ORDER BY row_id ASC"
      )
        .bind(since)
        .all();

      const lines = (results || []).map((r) =>
        JSON.stringify({
          row_id: r.row_id,
          id: r.install_id,
          v: r.v,
          event: r.event,
          ts: r.ts,
          data: safeParse(r.data),
          received_at: r.received_at,
        })
      );
      return new Response(lines.join("\n") + (lines.length ? "\n" : ""), {
        headers: { "Content-Type": "application/x-ndjson", ...CORS },
      });
    }

    return json({ error: "not found" }, 404);
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function str(v, max) {
  if (v == null) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return s;
  }
}

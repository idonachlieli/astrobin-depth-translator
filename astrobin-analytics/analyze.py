#!/usr/bin/env python3
"""
Summarize collected analytics into a short, readable report.

This is the file to run when you (or Claude) want to understand the data.
It reads data/events.ndjson and prints a compact summary instead of dumping
thousands of raw events, so analysis stays cheap.

Usage:
    python analyze.py            # compact text summary
    python analyze.py --json     # same numbers as JSON (for further processing)
"""
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
EVENTS_FILE = os.path.join(HERE, "data", "events.ndjson")


def norm(s):
    # Collapse non-breaking spaces / stray whitespace so the same gear groups together
    # (AstroBin's page markup uses   between words; saved rigs use plain spaces).
    return " ".join(str(s).replace(" ", " ").split())


def load_events():
    if not os.path.exists(EVENTS_FILE):
        sys.exit(f"No data yet at {EVENTS_FILE}. Run: python pull_data.py")
    events = []
    with open(EVENTS_FILE, encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if not ln:
                continue
            try:
                events.append(json.loads(ln))
            except ValueError:
                continue
    return events


def fmt_ts(ms):
    if not ms:
        return "?"
    try:
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    except (OverflowError, OSError, ValueError):
        return "?"


def top(counter, n=10):
    return [{"name": k, "count": c} for k, c in counter.most_common(n)]


def build_summary(events):
    installs = set()
    by_type = Counter()
    times = []
    scopes = Counter()
    cameras = Counter()
    bb_filters = Counter()
    nb_filters = Counter()
    sky_bortle = 0
    sky_sqm = 0
    urls = Counter()
    errors = Counter()
    per_install = Counter()
    opted_in = set()
    saved_rig = set()
    analyzed = set()

    for e in events:
        iid = e.get("id") or "?"
        installs.add(iid)
        per_install[iid] += 1
        evt = e.get("event", "?")
        by_type[evt] += 1
        if e.get("received_at"):
            times.append(e["received_at"])
        d = e.get("data") or {}
        if not isinstance(d, dict):
            d = {}

        if evt == "opt_in":
            opted_in.add(iid)
        elif evt == "rig_saved":
            saved_rig.add(iid)
            if d.get("scope"):
                scopes[norm(d["scope"])] += 1
            if d.get("camera"):
                cameras[norm(d["camera"])] += 1
            if d.get("bb"):
                bb_filters[norm(d["bb"])] += 1
            for nb in d.get("nb") or []:
                if nb:
                    nb_filters[norm(nb)] += 1
            if d.get("sqm"):
                sky_sqm += 1
            elif d.get("bortle") is not None:
                sky_bortle += 1
        elif evt == "image_analyzed":
            analyzed.add(iid)
            if d.get("telescope"):
                scopes[norm(d["telescope"])] += 1
            if d.get("camera"):
                cameras[norm(d["camera"])] += 1
            if d.get("url"):
                urls[d["url"]] += 1
            if d.get("sqm") is not None:
                sky_sqm += 1
            elif d.get("bortle") is not None:
                sky_bortle += 1
        elif evt == "custom_gear":
            if d.get("model"):
                cat = str(d.get("cat") or "").upper()   # content sends CAMERAS/SCOPES/FILTERS (#13)
                if cat in ("CAMERAS", "CAMERA"):
                    cameras[norm(d["model"])] += 1
                elif cat in ("SCOPES", "SCOPE", "TELESCOPE", "TELESCOPES"):
                    scopes[norm(d["model"])] += 1
        elif evt == "error":
            errors[(d.get("msg") or "?")[:120]] += 1

    return {
        "total_events": len(events),
        "unique_installs": len(installs),
        "date_range": [fmt_ts(min(times)) if times else "?", fmt_ts(max(times)) if times else "?"],
        "events_by_type": dict(by_type.most_common()),
        "funnel": {
            "opted_in": len(opted_in),
            "saved_a_rig": len(saved_rig),
            "analyzed_an_image": len(analyzed),
        },
        "sky_inputs": {"sqm": sky_sqm, "bortle_only": sky_bortle},
        "top_telescopes": top(scopes),
        "top_cameras": top(cameras),
        "top_broadband_filters": top(bb_filters),
        "top_narrowband_filters": top(nb_filters),
        "most_analyzed_images": top(urls),
        "errors": top(errors, 20),
        "most_active_installs": top(per_install, 5),
    }


def print_report(s):
    def line(label, val=""):
        print(f"{label:<26}{val}")

    print("=" * 52)
    print("AstroBin Depth Translator - analytics summary")
    print("=" * 52)
    line("Total events", s["total_events"])
    line("Unique installs", s["unique_installs"])
    line("Date range", f'{s["date_range"][0]} -> {s["date_range"][1]}')
    print()
    print("Events by type:")
    for k, v in s["events_by_type"].items():
        print(f"  {k:<18}{v}")
    print()
    f = s["funnel"]
    print(f'Funnel: opted-in {f["opted_in"]}  |  saved rig {f["saved_a_rig"]}  |  analyzed image {f["analyzed_an_image"]}')
    sk = s["sky_inputs"]
    print(f'Sky inputs: SQM {sk["sqm"]}  |  Bortle-only {sk["bortle_only"]}')

    def block(title, rows):
        if not rows:
            return
        print(f"\n{title}:")
        for r in rows:
            print(f'  {r["count"]:>4}  {r["name"]}')

    block("Top telescopes", s["top_telescopes"])
    block("Top cameras", s["top_cameras"])
    block("Top broadband filters", s["top_broadband_filters"])
    block("Top narrowband filters", s["top_narrowband_filters"])
    block("Most-analyzed images", s["most_analyzed_images"])
    block("Errors", s["errors"])
    print()


def main():
    events = load_events()
    summary = build_summary(events)
    if "--json" in sys.argv:
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    else:
        print_report(summary)


if __name__ == "__main__":
    main()

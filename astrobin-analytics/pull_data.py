#!/usr/bin/env python3
"""
Pull opt-in analytics events from your Cloudflare Worker into a local file.

Reads settings from config.json (see config.example.json), then downloads any
new events and appends them to data/events.ndjson (one JSON object per line).
It only fetches events newer than what you already have, so re-running is cheap.

Usage:
    python pull_data.py
"""
import json
import os
import sys
import urllib.request
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
EVENTS_FILE = os.path.join(DATA_DIR, "events.ndjson")
STATE_FILE = os.path.join(DATA_DIR, ".last_row_id")
CONFIG_FILE = os.path.join(HERE, "config.json")


def load_config():
    if not os.path.exists(CONFIG_FILE):
        sys.exit(
            "No config.json found. Copy config.example.json to config.json and "
            "fill in your worker URL and dump key."
        )
    with open(CONFIG_FILE, encoding="utf-8") as f:
        cfg = json.load(f)
    if not cfg.get("endpoint") or not cfg.get("dump_key"):
        sys.exit("config.json must contain 'endpoint' and 'dump_key'.")
    return cfg


def last_row_id():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return int(f.read().strip() or "0")
    except (OSError, ValueError):
        return 0


def main():
    cfg = load_config()
    os.makedirs(DATA_DIR, exist_ok=True)
    since = last_row_id()

    base = cfg["endpoint"].rstrip("/")
    q = urllib.parse.urlencode({"key": cfg["dump_key"], "since": since})
    url = f"{base}/dump?{q}"

    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            body = resp.read().decode("utf-8")
    except Exception as e:  # noqa: BLE001
        sys.exit(f"Download failed: {e}")

    lines = [ln for ln in body.splitlines() if ln.strip()]
    if not lines:
        print(f"No new events (already have through row {since}).")
        return

    max_row = since
    with open(EVENTS_FILE, "a", encoding="utf-8") as out:
        for ln in lines:
            out.write(ln + "\n")
            try:
                rid = json.loads(ln).get("row_id", 0)
                max_row = max(max_row, int(rid))
            except (ValueError, TypeError):
                pass

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        f.write(str(max_row))

    print(f"Added {len(lines)} new event(s). Total now through row {max_row}.")
    print(f"Saved to {EVENTS_FILE}")
    print("Run:  python analyze.py   to see a summary.")


if __name__ == "__main__":
    main()

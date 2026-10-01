#!/usr/bin/env python3
"""Pull time entries from Toggl Track and write data/toggl.json for the dashboard.

Mapping rule: a Toggl *project* whose name matches a language in the stack
(case-insensitive) counts toward that language. Entries with no project, or a
project that isn't a language, are ignored. Entries are aggregated per day per
language; the tag breakdown becomes the note.

Env: TOGGL_API_TOKEN (required). Optional: TOGGL_SINCE (YYYY-MM-DD, default 2026-01-01).
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

API = "https://api.track.toggl.com/api/v9"
LANGUAGES = ["english", "hindi", "khasi", "bengali", "german", "french", "spanish", "italian", "portuguese", "arabic"]
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "toggl.json")
MIN_SECONDS = 60  # ignore accidental 1–2 s timer taps


def api(path, token):
    auth = base64.b64encode(f"{token}:api_token".encode()).decode()
    req = urllib.request.Request(API + path, headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fmt_dur(seconds):
    h, m = divmod(round(seconds / 60), 60)
    return f"{h}h {m:02d}m" if h else f"{m}m"


def main():
    token = os.environ.get("TOGGL_API_TOKEN")
    if not token:
        print("TOGGL_API_TOKEN not set; nothing to do.", file=sys.stderr)
        return 0

    me = api("/me", token)
    tz = ZoneInfo(me.get("timezone") or "UTC")
    projects = {p["id"]: p["name"] for p in api("/me/projects?include_archived=true", token)}
    lang_of_project = {pid: name.strip().lower() for pid, name in projects.items() if name.strip().lower() in LANGUAGES}
    if not lang_of_project:
        print(f"No Toggl project matches a language name. Projects: {sorted(projects.values())}", file=sys.stderr)

    since = date.fromisoformat(os.environ.get("TOGGL_SINCE", "2026-01-01"))
    today = datetime.now(tz).date()

    # Toggl refuses start_date older than ~3 months, so fetch a rolling window and
    # keep older day-entries from the previous file as an archive.
    try:
        with open(OUT) as f:
            previous = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        previous = {"entries": []}
    fetch_start = max(since, today - timedelta(days=85))
    archived = [e for e in previous.get("entries", []) if e.get("date", "") < fetch_start.isoformat()]

    entries = []
    cursor = fetch_start
    while cursor <= today:
        end = min(cursor + timedelta(days=60), today + timedelta(days=1))
        entries += api(f"/me/time_entries?start_date={cursor}&end_date={end}", token)
        cursor = end

    # Aggregate: (date, lang) -> seconds, plus seconds per tag for the note.
    buckets = defaultdict(lambda: {"seconds": 0, "tags": defaultdict(int), "count": 0})
    seen = set()
    for e in entries:
        if e["id"] in seen:  # windows overlap by a day
            continue
        seen.add(e["id"])
        lang = lang_of_project.get(e.get("project_id"))
        dur = e.get("duration") or 0
        if not lang or dur < MIN_SECONDS:  # negative = still running
            continue
        day = datetime.fromisoformat(e["start"].replace("Z", "+00:00")).astimezone(tz).date().isoformat()
        b = buckets[(day, lang)]
        b["seconds"] += dur
        b["count"] += 1
        for t in e.get("tags") or []:
            b["tags"][t] += dur

    out_entries = list(archived)
    for (day, lang), b in sorted(buckets.items()):
        tags = sorted(b["tags"].items(), key=lambda kv: -kv[1])
        note = " · ".join(f"{t} {fmt_dur(s)}" for t, s in tags) if tags else "Toggl, no tags"
        out_entries.append({
            "id": f"toggl-{lang}-{day}",
            "lang": lang,
            "hours": round(b["seconds"] / 3600, 2),
            "date": day,
            "note": note,
            "source": "toggl",
        })

    payload = {
        "syncedAt": datetime.now(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "since": since.isoformat(),
        "timezone": str(tz),
        "projects": sorted(set(lang_of_project.values())),
        "entries": out_entries,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # Don't churn the commit history if only syncedAt changed.
    if previous.get("entries") == out_entries:
        print(f"No changes ({len(out_entries)} day-entries).")
        return 0
    with open(OUT, "w") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")
    total = sum(e["hours"] for e in out_entries)
    print(f"Wrote {len(out_entries)} day-entries, {total:.2f} h total, to {os.path.relpath(OUT)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as err:
        print(f"Toggl API error {err.code}: {err.read().decode(errors='replace')[:300]}", file=sys.stderr)
        sys.exit(1)

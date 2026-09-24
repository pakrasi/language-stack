# Language Stack

A single-page dashboard that counts down the study hours left until each language in the stack reaches its target level.

| Language | Target | Hours |
|---|---|---|
| English | Native | — |
| Hindi | Native | 150 |
| Khasi | Native | 250 |
| Bengali | Conversational | 200 |
| German | Business | 350 |
| French | Business | 400 |
| Spanish | Conversational | 350 |
| Italian | Conversational | 300 |
| Portuguese | Conversational | 150 |
| Arabic | Conversational | 1000 |

## How hours get in

1. **Toggl (automatic).** `.github/workflows/sync-and-deploy.yml` runs hourly, calls `scripts/toggl_sync.py` with the `TOGGL_API_TOKEN` repo secret, and commits `data/toggl.json`. A Toggl **project whose name matches a language** (e.g. `German`, `French`) counts toward that language; tags become the note. Trigger it manually from the Actions tab if you don't want to wait.
2. **Manual.** The form on the page. Those sessions live in the browser's `localStorage`; use Export / Import to move them between devices.

Toggl's API only serves the last ~3 months, so the sync keeps older day-entries from the previous `toggl.json` as an archive.

## Editing the stack

Targets live in one place: the `LANGUAGES` array at the top of `app.js` (mirrored in `scripts/toggl_sync.py` for the name→language mapping).

## Local preview

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

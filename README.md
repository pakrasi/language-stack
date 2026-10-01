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
2. **Manual.** The log row under the hero: quick chips for the focus language, or **Other…** for any language, amount, date and note. Those sessions live in the browser's `localStorage` (`language-stack.v1`); use Export / Import in the footer's Data section to move them between devices. If the saved data can't be read, the raw copy is kept under `language-stack.v1.corrupt-<timestamp>` before anything is overwritten.
3. **Hours before tracking.** Select a language in the hour field and enter the hours you studied before you started tracking. They are stored in `language-stack.start-hours`, count toward hours done, and are left out of the pace, the weekly chart and the streak.

Toggl's API only serves the last ~3 months, so the sync keeps older day-entries from the previous `toggl.json` as an archive.

## Editing the stack

Targets live in one place: the `LANGUAGES` array at the top of `app.js` (mirrored in `scripts/toggl_sync.py` for the name→language mapping).

## Target date

The hero compares the hours needed per week to finish by a target date with your recent average (the last 7 days for now; `PACE_DAYS` in `app.js`, switch to 28 once tracking has settled), and draws a timeline from today to the later of the target date and the projected finish at that pace. Set the date inline on the page; it is stored in `localStorage` under `language-stack.target-date` (default `2030-12-31`).

## Design

Tokens and rules are in `DESIGN.md`. Dark is the default edition, whatever the OS setting; the theme toggle stores an explicit choice in `language-stack.theme`.

## Visual layer

`fx.js` is an optional ES module, loaded after first paint. It renders the background gradient, the header logo and a short badge when a target is reached with [Paper Shaders](https://github.com/paper-design/shaders) (`@paper-design/shaders`, pinned in `PAPER_VERSION`, loaded file by file from jsDelivr). If WebGL2 or the CDN is unavailable, the page keeps a CSS gradient and the inline SVG logo. `app.js` only talks to it through DOM events (`stack-stats`, `session-logged`, `target-reached`).

`assets/mark-processed.png` is the pre-processed logo mask. Rebuild it with `scripts/build-mark.sh` (headless Chrome + a local server).

### Third-party notice

Paper Shaders is © Paper Design and licensed under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). This project loads it unmodified from jsDelivr and credits it in the page footer.

## Local preview

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

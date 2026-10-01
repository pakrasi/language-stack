---
version: alpha
name: Language Stack
description: "A personal countdown of study hours left to target in nine languages, built as a daily art piece. Dark is the default edition: near-black with a slow mesh-gradient atmosphere, Newsreader for the numbers, and one amber accent that means focus, action and your pace. The hour field (one square per target hour) and the hero timeline (today, target date, projected finish) are the focal visuals; everything below is quiet, hairline-separated sections on the same atmosphere."

colors:            # light edition (warm paper)
  canvas: "#f3efe7"
  surface-glass: "rgba(249,246,240,0.74)"   # log sheet and toast only
  topbar: "rgba(246,243,236,0.97)"
  ink: "#1c1915"
  ink-2: "#423b33"
  ink-muted: "#4f483f"
  hairline: "rgba(28,25,21,0.12)"
  field-border: "rgba(28,25,21,0.50)"
  primary: "#b83c0d"        # primary button, active segment
  primary-ink: "#7a2707"    # accent text
  mark: "#a63508"           # accent marks on the atmosphere: pace bar, chart bars, timeline overrun
  on-primary: "#fbf7f0"
  primary-track: "rgba(184,60,13,0.09)"
  bar-track: "rgba(28,25,21,0.07)"
  needed: "rgba(28,25,21,0.65)"
  cell-empty: "rgba(28,25,21,0.13)"
  cell-other: "#6e5a45"
  cell-focus: "#a63508"
  cell-done: "#423b33"
  ring: "#7a2707"
  critical: "#8a1a14"
colors-dark:
  canvas: "#0b0a09"
  surface-glass: "rgba(16,14,12,0.62)"
  topbar: "rgba(13,12,10,0.96)"
  ink: "#f1ebe2"
  ink-2: "#cfc6b9"
  ink-muted: "#b3aa9c"
  hairline: "rgba(241,235,226,0.10)"
  field-border: "rgba(241,235,226,0.40)"
  primary: "#f3a640"
  primary-ink: "#f5b562"
  mark: "#f3a640"
  on-primary: "#1a1208"
  primary-track: "rgba(243,166,64,0.16)"
  bar-track: "rgba(241,235,226,0.10)"
  needed: "rgba(241,235,226,0.60)"
  cell-empty: "rgba(241,235,226,0.13)"
  cell-other: "#b39064"
  cell-focus: "#f6aa45"
  cell-done: "#cfc6b9"
  ring: "#f3a640"
  critical: "#ff9d8c"

typography:
  display:   { fontFamily: Newsreader, fontSize: "clamp(96px,15vw,196px)", fontWeight: 250, lineHeight: 0.86, letterSpacing: -0.035em, numeric: "lining proportional" }  # 88-128px phone
  figure:    { fontFamily: Newsreader, fontSize: 56px, fontWeight: 300, lineHeight: 1.0, letterSpacing: -0.02em, numeric: "lining proportional" }  # pace, days left; 44px phone
  figure-sm: { fontFamily: Newsreader, fontSize: 44px, fontWeight: 300, lineHeight: 1.1 }   # This week stats; 36px phone
  headline:  { fontFamily: Newsreader, fontSize: 28px, fontWeight: 400, lineHeight: 1.15, letterSpacing: -0.01em }  # section h2; 24px phone
  lede:      { fontFamily: Newsreader, fontSize: 24px, fontWeight: 400, lineHeight: 1.25 }  # projection sentence; 20px phone
  title:     { fontFamily: Newsreader, fontSize: 19px, fontWeight: 400, lineHeight: 1.15 }  # language names, timeline values; 16px phone
  body:      { fontFamily: system-ui, fontSize: 15px, fontWeight: 400, lineHeight: 1.55 }
  label:     { fontFamily: system-ui, fontSize: 13px, fontWeight: 500, lineHeight: 1.4 }   # 15px for "Hours left"
  caption:   { fontFamily: system-ui, fontSize: 12px, fontWeight: 400, lineHeight: 1.4, numeric: tabular }
  input:     { fontFamily: system-ui, fontSize: 16px, fontWeight: 400 }   # never below 16px

rounded: { ring: 4px, control: 10px, sheet: 18px, pill: 999px }
spacing: { xs: 4px, sm: 8px, md: 12px, lg: 16px, xl: 24px, xxl: 32px, section: 56px }

components:
  log-sheet:      { backgroundColor: "{colors.surface-glass}", rounded: "{rounded.sheet}", padding: 22px, backdrop: "blur(22px) saturate(1.4)" }
  section:        { borderTop: "1px solid {colors.hairline}", paddingTop: "{spacing.xl}" }
  button:         { backgroundColor: "rgba(ink,0.06)", border: "1px solid {colors.hairline}", rounded: "{rounded.control}", minHeight: 44px, padding: 0 16px }
  button-primary: { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", rounded: "{rounded.control}", minHeight: 44px }
  chip:           { rounded: "{rounded.pill}", height: 44px, padding: 0 16px, typography: "{typography.label}" }
  input:          { rounded: "{rounded.control}", height: 44px, border: "1px solid {colors.field-border}", typography: "{typography.input}" }
  bar:            { height: 6px, rounded: "{rounded.pill}", track: "{colors.bar-track}" }
  toast:          { backgroundColor: "{colors.surface-glass}", rounded: "{rounded.pill}", position: "fixed bottom", duration: "4s, 6.5s with Undo" }
  tooltip:        { rounded: "{rounded.control}", padding: 6px 9px, typography: "{typography.caption}" }
  hour-cell:      { size: "9px desktop / 7px tablet / 5px phone", gap: "2px / 2px / 1.5px", rounded: 0 }
  timeline:       { track: "2px {colors.hairline}", have: "2px {colors.needed}", overrun: "3px {colors.mark}", today: "12px ring {colors.ink}", target: "2x22px tick {colors.ink}", finish: "11px diamond {colors.mark}" }
---

## Overview
One page, read top to bottom: hours left and pace, then time (today's progress, the timeline, days left), then the log row, the hour field, This week, Sessions, and a footer with Data. The art is the field and the timeline. Everything else is quiet.

## Colors
One accent (amber dark / rust light) means: the focus language, the primary action, your pace. Use `mark` for accent shapes that sit on the atmosphere (it meets 3:1), `primary-ink` for accent text. Finished hours are `cell-done` (a quiet ink), never green. `critical` only appears for a passed target date and destructive actions, always with text. The atmosphere goes cool when behind the needed pace and warm when on it; keep it low-chroma so it never lowers cell or text contrast.

## Typography
Newsreader for numbers and headings, system sans for everything else. Large figures use proportional lining numerals; tables, ticks and captions use tabular. Inputs are 16px.

## Layout
Max content width 1160px, side gutter 20px (16px phone, plus safe-area insets). Sections are separated by a hairline and 24px; 56px between sections (44px phone). Only the log sheet and the toast are glass.

## Elevation & Depth
No boxed panels. The topbar is sticky on desktop only (static on phone), with `scroll-padding-top` equal to its height. The toast floats at the bottom.

## Shapes
Ring 4px (focus outline only), controls 10px, the log sheet 18px, chips, bars and the toast pill. Cells are square.

## Components
- Hour field: one run per language in table order, each starting a new row with a one-cell gap. Label gutter (220px desktop, 104px phone) holds the name, "x of y h" and, once done, "Reached <date>". A run is a button with `aria-pressed`; selecting it opens the readout right below it (level, logged, target, left, Make focus, Hours before tracking).
- Timeline: from today to the later of target date and projected finish (+3%), capped at 50 years. Year labels above, marker labels below; overlapping labels drop to a second row.
- Toast: undo for every add and delete; offers the next focus when the focus language reaches its target.

## Copy
- Labels name the thing: "Hours left", "Days left", "Log a session", "Target hours". No slogans, metaphors, "X, not Y", lists of three or exclamation marks. At most one middle dot per line.
- Hours: one decimal below 100 (no trailing .0), whole numbers from 100. Session rows and single-entry toasts may show two decimals.
- Empty states say what is missing and what to do.

## Do's and Don'ts
- Do keep the concept honest: every square is a real target hour; numbers match the shapes.
- Don't add a second accent for "done", don't box sections, and don't stretch SVG text (no `preserveAspectRatio="none"` on charts with labels).
- Don't add libraries or a build step. Paper Shaders (mesh gradient, liquid metal) is the only runtime dependency and is optional.

## Responsive Behavior
≤600px: topbar static, single column hero, quick chips in a 4-column grid with Other full width, field cells 5px with a 104px label gutter, all targets ≥44px. ≤374px: wordmark hidden visually, mark only.

## Iteration Guide
Change tokens in `styles.css` `:root` and this file together. Re-run a contrast check against every atmosphere stop (behind, onPace, finish mix, page; light mode also the multiply-grain darkening) after any colour change.

## Known Gaps
- The field draws one 2D canvas per run (9 in total) rather than one canvas; visually identical, simpler hit-testing.

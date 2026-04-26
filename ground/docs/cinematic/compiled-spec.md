# Compiled Spec — Airyn Ground (Sicario)

This is the source of truth for the Ground mainview implementation.

## External Library Decision

- **Fonts:** Google Fonts CDN — Inter Tight + JetBrains Mono. Justified because Bun-native does not ship fonts, and these are the type pairing the cinematic concept relies on.
- **No JS animation libraries.** All motion is pure CSS keyframes; this respects the "prefer Bun-native, no extra deps" rule from `AGENTS.md`.
- **No icon library.** Brackets, dots, dashes, and corner glyphs are pure CSS borders / pseudo-elements.

## DOM structure

```
body
├── .vignette        (atmospheric, fixed, z=1)
├── .grain           (atmospheric, fixed, z=2)
└── main.stage
    ├── header.masthead
    │   ├── .brand            (AIRYN | divider | GROUND CONTROL)
    │   └── .masthead-meta    (sector / mode / clock / date)
    ├── section.rail
    │   ├── .rail-item × 4    (FLIGHT LINK, MISSION LINK, VEHICLE, MODE)
    │   └── .rail-actions     (CONNECT FLIGHT, CONNECT MISSION)
    ├── section.theatre
    │   ├── article.plate     (terrain plate; corners, grid, rings, cross, scan, reticle)
    │   └── aside.readout     (telemetry list + queue)
    └── footer.ledger
```

## Tokens

See `decisions.md` color table. Type sizes:

- Brand mark: 28px / weight 800 / tracking 0.18em
- Brand sub: 11px / 0.32em
- Slugs (mono): 11px / 0.18em
- Rail key: 10px / 0.32em
- Rail value: 18px / 0.06em / 700
- Telemetry numeral: 18px mono
- Ledger: 10px mono / 0.22em

## Layout

- `.stage`: 100vh grid, rows = `auto auto 1fr auto`, gap 18px, padding `22px 28px 18px`.
- `.theatre`: grid-template-columns `1fr 320px`, gap 18px, min-height 0 (so plate can shrink correctly).
- `.rail`: 5-column grid: `repeat(4, 1fr) auto`, with hairline rule top + bottom and right-borders between rail items.

## Signature composition specs

### Plate (the hero)

- Position: relative, full-bleed inside `.theatre` left column.
- Background: radial gradient `#1a1f22` → `#0c0f10` (suggests Deakins desert at dusk).
- Decorations layered absolute:
  1. corner brackets (4×, ochre, 14px, top-left/right, bottom-left/right).
  2. faint ochre grid 56px, masked by radial fade.
  3. 3 concentric dashed rings centered (180 / 360 / 540 px).
  4. crosshair axes, 1px ochre at 18% alpha.
  5. scan-line: `width 20%`, animated `translateX(0 → 600%)` over 9s linear infinite.
- Header: top-left class slug `TERRAIN PLATE · 04` in ochre; top-right live coordinate slug in mono.
- Footer: bottom-row metrics `BEARING / RANGE / ALT / SAT`.
- Reticle (centered, 56×56):
  - 4 corner IR brackets that breathe outward 3.6s.
  - center IR dot 8px with double box-shadow halo, pulsing 2.4s.

### Status rail

- 4 slugs share the same shape: stacked `key` (small caps tracked) / `val` (large display) / `foot` (mono fine print).
- Offline `data-state="offline"` colors `val` to `--accent-ir`.
- A vertical hairline (1px, `--rule`) sits between slugs.
- Right-aligned `.rail-actions` holds two buttons. Primary (`Connect Flight`) ochre border + ochre text; secondary outlined neutral.
- Buttons stack two lines: action label (display) + meta (mono fine print).

### Telemetry readout

- 6 metrics: `ROLL / PITCH / YAW / THR / VBAT / ARMED` (+ ARMED state styled separately).
- Each row: `dt` left small-caps tracked, `dd` right mono numeral + tracked unit.
- Dashed `--rule` underline between rows.

### Route queue

- 3 rows in `01 / NAME / STATE` columns.
- Row indices in ochre mono, names in pale dust, states in muted small caps.

## Entrance system

| Selector | Animation | Delay |
| --- | --- | --- |
| `.masthead` | fadeUp 700ms | 100ms |
| `.rail` | fadeUp 700ms | 250ms |
| `.rail-item:nth-child(n) .rail-val` | slugIn 480ms | 600 + (n−1)·100ms |
| `.theatre` | fadeUp 800ms | 400ms |
| `.ledger` | fadeUp 700ms | 600ms |
| `.plate-scan` | scan 9s linear infinite | — |
| `.reticle-dot` | pulse 2.4s ease-in-out infinite | — |
| `.reticle-bracket--tl/tr/bl/br` | bracket 3.6s ease-in-out infinite | — |

`@media (prefers-reduced-motion)` kills every animation listed above.

## Heavy-interaction budget

- 1 heavy: plate scan-line.
- 2 attention reveals: reticle pulse, bracket breath.
- 5 distinct entrance types: fadeUp, slugIn, scan, pulse, bracket. Within budget.

## Quality checklist

- [x] One signature composition per scene (plate).
- [x] Hero dominance statement in storyboard.
- [x] Distinct from previous light-card dashboard (shell, palette, posture).
- [x] Functional content preserved: clock, connect buttons, 4 statuses, map area, telemetry, queue.
- [x] No mention of director / film / "cinematic" / "calibrated" in user-visible UI.
- [x] Reduced motion handled.
- [x] Responsive collapse below 980px keeps the language (rail wraps to 2 cols, theatre stacks).

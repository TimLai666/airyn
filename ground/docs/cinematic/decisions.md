# Cinematic Decisions — Airyn Ground

## Pick

- **Director:** Denis Villeneuve (DP Roger Deakins)
- **Film:** *Sicario* (2015)
- **Genre lane:** procedural-ops thriller, surveillance, aerial / cross-border

## Why this fits a drone GCS

*Sicario* is structurally about people watching a vehicle move across terrain through screens. Briefing rooms, IR overhead shots, classification rules, and Deakins' restrained desert / gunmetal palette already match what a Ground Control Station wants to communicate: situational awareness, mission stakes, no decoration.

The film's language gives us:

- aerial top-down terrain plates → the map
- IR thermal tracking reticles → the vehicle marker
- classification slugs and chapter titles → status rail and section labels
- restrained typography in monumental scale → masthead
- desert ochre + gunmetal night palette → the only two surfaces we need

## Color tokens

| Token | Hex | Use |
| --- | --- | --- |
| `--bg-deep` | `#0c0e0f` | base canvas |
| `--bg-surface` | `#14181a` | panel surfaces |
| `--bg-elev` | `#1c2124` | elevated rows |
| `--rule` | `rgba(216,200,176,0.10)` | hairline rules |
| `--rule-strong` | `rgba(216,200,176,0.22)` | borders |
| `--text-pri` | `#e8dccb` | pale dust |
| `--text-sec` | `#a09384` | warm gray |
| `--text-mute` | `#5d564d` | classifying small caps |
| `--accent-ochre` | `#d18b48` | desert sunset, primary accent |
| `--accent-ochre-soft` | `#8a5a2e` | dividers |
| `--accent-ir` | `#d24a3a` | vehicle reticle, alerts |
| `--accent-ice` | `#5b8a96` | cold ops data accent |

## Type direction

- **Display:** Inter Tight 700–800, tracked +0.18em on slugs, monumental weight on `AIRYN`.
- **Body:** Inter, default.
- **Mono:** JetBrains Mono for telemetry numerals, coordinates, classification meta.

## Composition family

**Cutaway monolith** — one dominant central terrain plate, framed by hairline classification rails on top and bottom; right edge holds a vertical procedural readout. Avoids the default "header + 4 cards + map + sidebar" dashboard shell.

## Shell-ban list (no prior cinematic-ui demos in this repo, applied to common defaults)

- ❌ Light mode card dashboard (the current state)
- ❌ Four equal rounded tiles in a neat row
- ❌ Floating buttons in top-right corner
- ❌ Generic rounded-card panels with drop shadows
- ❌ Plain "header / sidebar" 8-4 split with no scene identity

## Constraints carried from project

- Electrobun + Bun + TypeScript only. **No Electron APIs.**
- One window, fixed launch size 1180×780; design must hold below that and gracefully degrade above.
- All real functional content (clock, connect buttons, 4 status panels, map+marker, telemetry block, mission queue) must be preserved.
- No new ground dependencies — pure HTML/CSS/JS, fonts via Google Fonts (already external resource pattern).

# Storyboard — Airyn Ground (Sicario / Villeneuve)

## Site-wide cinematic grammar

- **Page shell:** full-bleed dark canvas with subtle ochre top-glow + cold teal corner-glow, vignette, fine grain.
- **Navigation posture:** none — this is a single operating-theatre view, not a marketing site. Top is a *masthead classification strip*, not a navbar.
- **Framing rule:** every section is enclosed by hairline rules and classification meta, like the chapter cards in *Sicario* (`SECTOR · TESTBENCH / QUAD-X · RATE MODE / 14:02:08 / 2026·04·27`).
- **Density cadence:** masthead (sparse) → status rail (dense slug strip) → theatre (very wide, breathing) → ledger (single quiet line).
- **Recurring atmospheric layers:** dust grain, vignette, slow ochre scan-line on the terrain plate, IR pulse on the reticle.

## Scene thesis (single page)

> The interface is a Sicario briefing room frozen at the moment before the vehicle goes live. The map is the room's wall — a Deakins overhead plate with an IR target lock at center. Telemetry and mission queue are the analyst's printed sheet pinned to the right wall. The masthead is the location card.

## Page-level visual thesis

**The terrain plate is the hero.** Everything else exists to frame it. The plate gets:
- corner brackets (Sicario aerial title cards)
- radial range rings (3 concentric, dashed → dotted as they widen)
- crosshair axes faint ochre
- one slow horizontal scan sweep (the only heavy interaction on the page)
- coordinate slugs top-left/right and bottom flight metrics

## Hero dominance statement

The hero feels expensive without gradients or app chrome because:
1. it is a single monumental dark surface (no card stack),
2. the only saturated mark on the entire page is the IR reticle (red) and the ochre rule on the masthead,
3. the surrounding rails are tracked small caps with monospace numerals — type does the prestige work, not effects.

## Signature compositions

1. **Masthead classification strip** — `AIRYN` heavy display + `GROUND CONTROL` tracked sub, plus right-aligned slug train (sector / vehicle / clock / date) separated by faint ochre slashes. *Not* a navbar.
2. **Status rail** — single horizontal strip with 4 status slugs separated by hairline rules; connect actions live at the rail's right end as procedural buttons, not floating CTAs.
3. **Terrain plate** — described above; full-bleed central element.
4. **Telemetry readout column** — vertical procedural strip on the right; each metric is `LABEL ............ NUMBER UNIT` with dashed underline, mono numerals.
5. **Route queue** — sits below telemetry; numbered rows `01 / 02 / 03` in ochre, name in pale dust, status slug in muted small caps.
6. **Ledger bar** — bottom strip: classification tag (ochre) / mid status line (warm gray) / version slug (mute).

## Narrative arc (mapped to a single ops view)

1. **Locate** — masthead tells you where you are.
2. **Brief** — status rail confirms link, vehicle, mode.
3. **Watch** — terrain plate dominates, pulses, sweeps.
4. **Read** — telemetry column gives precise numbers.
5. **Plan** — queue lists what comes next.
6. **Sign off** — ledger closes the frame.

## Entrance map

| Section | Entrance |
| --- | --- |
| Masthead | fade-up 700ms @ 100ms |
| Status rail container | fade-up 700ms @ 250ms |
| Each rail value | slide-in-from-left 480ms, staggered 100ms (4 slugs) |
| Theatre (plate + readout) | fade-up 800ms @ 400ms |
| Ledger | fade-up 700ms @ 600ms |
| Plate scan-line | continuous 9s linear sweep (heavy interaction, 1 of max 1) |
| Reticle | continuous pulse + bracket-breath (atmosphere only, subordinate) |

This is **5 distinct entrance behaviors** plus 2 atmospheric loops, no plain `fadeUp` repeated more than 4 times.

## Anti-convergence checks

- ✅ Different from the previous light-card dashboard (shell, color, posture all changed).
- ✅ No 4-tile equal grid; status is a continuous rail with hairline dividers.
- ✅ Map is not a generic gridded square; it has corner brackets, range rings, and IR reticle as a single composed plate.
- ✅ Buttons are not floating — they live inside the rail like procedural controls.
- ✅ Hero composition is irreplaceable by a generic 12-column grid.

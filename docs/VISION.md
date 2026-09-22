# THE RICE KITCHEN — Vision & Design System

> A private meal-planning app for one household. Not a SaaS. Not a template.
> The family runs a restaurant, and this is the kitchen pass.

## The concept

Every good restaurant kitchen has a **pass**: a steel rail where order tickets hang, the
head chef calls service, and plates go out. This app *is* the Rice family's pass.

- The **week plan** is **The Pass** — a rail of tickets, one per service (breakfast, lunch, dinner, snack).
- The **recipe library** is **The Menu** — menu cards you can put on the pass.
- The **family** is **The Table** — who's sitting down tonight, what they can't eat, what they love.
- The **shopping list** is **The Order** — a thermal-printed supplier order.
- Cooked meals get **plated**. Skipped ones get **86'd** (kitchen slang for "we're out").

This metaphor drives naming, copy, motion and visuals. Use it with confidence and restraint:
kitchen slang in headings and micro-copy, plain English in instructions and errors.

## Voice

- Confident, dry, warm. A head chef who likes their crew.
- Headings: short, uppercase, punchy. "TONIGHT'S SERVICE." "THE PASS IS EMPTY."
- Micro-copy can use the metaphor: "Plate it", "86 it", "Fire the week", "Clock in".
- Errors and forms: plain, specific, no jokes. "Passphrase didn't match." "Name is required."
- Never use emojis in the UI. Icons come from `lucide-react`.

## Visual language

**Two worlds, one kitchen.** Dark mode is the pass at night: a near-black steel counter with
warm paper tickets glowing under the heat lamp. Light mode is the prep kitchen by day: paper
everywhere, ink on cream. Dark is the default. Both must be first-class.

### Colour tokens (CSS variables, defined in `globals.css`)

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `--counter` | `#0C0C0D` | `#EDE7DA` | page background |
| `--counter-2` | `#141416` | `#E3DCCB` | raised surfaces, nav |
| `--steel` | `#2A2B2F` | `#C9C1B0` | borders, rails, dividers |
| `--paper` | `#F6F1E7` | `#FFFDF8` | ticket cards |
| `--paper-2` | `#EAE3D6` | `#F1ECE1` | ticket header strips, zebra rows |
| `--ink` | `#141414` | `#141414` | text on paper |
| `--ink-soft` | `#5C5A55` | `#5C5A55` | secondary text on paper |
| `--chalk` | `#F2EFE8` | `#141414` | text on counter |
| `--chalk-soft` | `#9A9A9E` | `#5C5A55` | secondary text on counter |
| `--pass` | `#FF4F0F` | `#E8430A` | primary action, active states, heat lamp glow |
| `--pass-ink` | `#1A0A02` | `#FFFFFF` | text on `--pass` |
| `--plated` | `#21E6A1` | `#0E9F6E` | done / cooked / success |
| `--eightysix` | `#E11D2E` | `#C8102E` | allergen warnings, destructive, "86'd" |
| `--note` | `#FFE86B` | `#F5D93A` | sticky-note highlights, leftovers |

Rules:
- **Allergen red is sacred.** `--eightysix` is used for allergen conflicts and destructive actions only. Never decoration.
- Pass orange is the one accent. Use it for the primary action on a screen and active navigation. Not for every button.
- Tickets are always paper (`--paper`) with ink text, in both modes. That contrast is the identity.
- No gradients except the heat-lamp glow (a soft radial orange glow behind the active service on The Pass).
- Add a subtle paper grain to tickets and a faint noise to the dark counter. Pure CSS or an inline SVG filter; no image files.

### Typography (Google Fonts via `next/font/google`)

| Role | Font | Notes |
|---|---|---|
| Display | **Bebas Neue** | uppercase, tight tracking, huge. Day names, page titles, ticket headers. |
| Body / UI | **Space Grotesk** | 400/500/700. All UI text. |
| Ticket data | **JetBrains Mono** | times, quantities, servings, codes, timestamps. Anything that would be printed on a ticket. |

Expose as `--font-display`, `--font-body`, `--font-mono`. Set body text to 16px minimum on mobile.

### Components (build these in Slice 0, reuse everywhere)

- **Ticket** — the core card. Paper background, ink text, perforated top edge (CSS `radial-gradient` mask, no images),
  optional mono header strip (e.g. `TUE 24 SEP · DINNER · 4 COVERS`), subtle paper grain, 2px hard shadow.
  Variants: `default`, `note` (yellow), `warning` (red left rule).
- **Stamp** — rotated, bordered, uppercase label that looks rubber-stamped: `PLATED`, `86'D`, `REJECTED`, `NEW`.
  Ink colour per variant. Slight rotation (-6° to -3°). Used sparingly for state.
- **Chip** — small pill for tags, allergens, restrictions. Allergen chips are always red-outlined.
- **Button** — variants `pass` (orange fill), `ink` (paper with ink border), `ghost`, `danger`. Hard 2px shadow that
  collapses on press. Height 44px minimum for touch.
- **Field** — inputs styled as ticket lines: mono for numeric, body for text. Labels uppercase, small, tracked.
- **PageHeader** — display title, optional mono kicker line above it, optional actions right.
- **AppShell** — top bar on desktop, **bottom tab bar on mobile** (The Pass, The Menu, The Table, The Order).
  Active tab in pass orange. Theme toggle and "Clock out" (logout) in the top bar / a small menu.
- **EmptyState** — a single ticket with a stamp and one line of copy, plus one primary action.

### Motion

- Tickets **spike onto the rail**: enter with a short spring (translateY 8px → 0, 180ms, slight overshoot).
- State changes stamp on: Stamp scales from 1.4 → 1 with a 120ms ease-out.
- Checking off an order line: strike-through draws left to right (200ms).
- Everything respects `prefers-reduced-motion: reduce` (disable transforms, keep opacity fades).
- No page transition animations. No parallax. No spinners; use skeleton tickets.

### Layout

- Mobile-first. Design for 390px wide first, then 768, then 1200+.
- 16px side gutters on mobile. Max content width 1100px on desktop.
- The Pass on desktop is a 7-column week; on mobile it's a horizontal day switcher with one day's tickets stacked.
- Touch targets 44px minimum. No hover-only affordances.

## What "wow" means here

Someone opening this on their phone in the kitchen should feel like they've been handed a real
ticket off a real pass. The paper should look like paper. The orange should feel like a heat lamp.
The stamps should feel satisfying. It should be fast, obvious and a little bit theatrical.

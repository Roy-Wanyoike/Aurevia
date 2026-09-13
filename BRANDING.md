# Aurevia — Brand Identity & Color Palette

## Brand Concept

**Aurevia** = *Aurum* (Latin: gold) + *Vía* (way/path) — "the golden path through markets."

The brand represents **intelligence meeting execution**: the golden ratio spiral of quantitative analysis flowing into the candlestick geometry of market action. The aesthetic is premium fintech — dark, precise, with emerald (growth/Approved) and gold (illumination/value) accents against a deep midnight navy that reads as a trading terminal after hours.

---

## Logo System

### Primary Logo
- **File**: `public/branding/aurevia-logo.svg` (scalable, crisp at any size)
- **Concept**: Golden ratio spiral (intelligence) + candlestick pair forming an abstract "A" + ascending arrow tip (upward trajectory)

### App Icon
- **File**: `public/branding/aurevia-icon.png` (1024×1024)
- **Use**: Favicon, app icon, social cards

### Hero Banner
- **File**: `public/branding/aurevia-hero-banner.png` (1344×768)
- **Use**: Dashboard header, landing page, social previews

---

## Color Palette

### Core Palette (unique to Aurevia)

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| **Primary** | Midnight Navy | `#0A0E1A` | Background — the "terminal after hours" |
| **Surface** | Carbon Slate | `#131826` | Cards, elevated surfaces |
| **Accent 1** | Aurevia Emerald | `#10B981` | Primary accent — gains, approved, growth |
| **Accent 2** | Aurum Gold | `#F59E0B` | Secondary accent — value, illumination, highlights |
| **Danger** | Signal Red | `#EF4444` | Losses, rejected, circuit breaker paused |
| **Info** | Cyan Pulse | `#06B6D4` | Information, regimes, live data |
| **Warning** | Amber Alert | `#F59E0B` | Caution, degraded, warnings |

### Text Hierarchy

| Role | Hex | Usage |
|------|-----|-------|
| Foreground | `#F1F5F9` | Primary text (slate-100) |
| Muted Foreground | `#94A3B8` | Secondary text (slate-400) |
| Subtle Foreground | `#64748B` | Tertiary text, labels (slate-500) |

### Semantic Tints (backgrounds + badges)

| Role | Background | Text | Border |
|------|-----------|------|--------|
| Gain / Approved | `emerald-500/10` | `emerald-400` | `emerald-500/30` |
| Loss / Rejected | `red-500/10` | `red-400` | `red-500/30` |
| Warning / Paused | `amber-500/10` | `amber-400` | `amber-500/30` |
| Info / Regime | `cyan-500/10` | `cyan-400` | `cyan-500/30` |
| Neutral | `slate-500/10` | `slate-400` | `slate-500/30` |

---

## Typography

| Use | Font | Weights |
|-----|------|---------|
| Body / UI | Geist Sans | 400, 500, 600 |
| Mono / Numbers | Geist Mono | 400, 500 |
| Display (future) | Sora or Space Grotesk | 600, 700 |

All numeric values use `font-variant-numeric: tabular-nums` for clean price tables.

---

## Design Principles

1. **Dark-first** — the trading terminal is the primary surface. Light mode is a future consideration, not a default.
2. **Emerald is sacred** — emerald green (`#10B981`) is reserved for gains, approvals, and the primary brand accent. It should never be used for neutral UI elements.
3. **Gold for illumination** — gold (`#F59E0B`) draws attention to high-value information (signals, recommendations, key metrics). Use sparingly.
4. **Red is final** — red (`#EF4444`) is reserved for losses, rejections, and circuit-breaker pauses. Never use red for non-critical warnings.
5. **Tabular figures everywhere** — all prices, P&L, and metrics use tabular numbers for vertical alignment.
6. **Subtle motion** — emerald pulse dots indicate "live" data. No gratuitous animations.

---

## Usage in Code

The palette is wired into `src/app/globals.css` as CSS custom properties:

```css
:root {
  --background: oklch(0.16 0.012 250);   /* Midnight Navy */
  --card: oklch(0.205 0.014 250);        /* Carbon Slate */
  --primary: oklch(0.72 0.17 162);       /* Aurevia Emerald */
  --chart-1: oklch(0.72 0.17 162);       /* Emerald */
  --chart-2: oklch(0.75 0.16 75);        /* Aurum Gold */
  --chart-3: oklch(0.65 0.21 25);        /* Signal Red */
  --chart-4: oklch(0.70 0.13 210);       /* Cyan Pulse */
}
```

Tailwind classes: `bg-background`, `text-primary`, `text-emerald-400`, `text-amber-400`, `text-red-400`, `text-cyan-400`.

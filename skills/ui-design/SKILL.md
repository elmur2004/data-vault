---
name: ui-design
description: Visual and interaction system for the Database app. Use this before building or changing ANY UI - the app shell, navigation, tables, employee cards, dialogs, forms, badges, empty states, the global search, responsive behaviour, or anything involving colors, fonts, spacing, or the ByteForce brand. Also use it when reviewing screenshots.
---

# UI design

The app is a **ByteForce internal tool**: premium, minimal, strategic. Calm surfaces, disciplined color, no decoration that doesn't inform. Assets live in `brand/` (copy them into the app; don't hotlink).

## Brand tokens (from `brand/colors_and_type.css` — import it, don't re-invent values)

- **Typeface: Lama Sans only** (`brand/fonts/*.ttf`, weights 400/600; 700 maps to SemiBold). Load with `next/font/local`. No secondary families.
- Palette: Bold Orange `#F15C24` (`--bf-orange`), Royal Violet `#53449B` (`--bf-violet`), Ink `#231F20`, Mist `#E6E7E8`, White. Tints `--bf-orange-100/600`, `--bf-violet-100/700` exist for badges and hovers. **Do not invent accent colors.**
- Roles: Violet = brand/primary actions and active nav. Orange = the accent — highlights, the overdue/late signal family, primary CTA on dark. Ink on white for text; Mist for subtle surfaces and borders.
- Logo: `brand/logo-mark.svg` in the sidebar header next to the app name; never skew or recolor the mark.
- No emoji in the UI. No gradients as primary surfaces. Map these tokens into Tailwind/shadcn CSS variables once, in `globals.css`.

### Semantic mapping

| Meaning | Treatment |
|---|---|
| Company badge — ByteForce | orange-100 bg / orange-600 text |
| Company badge — B-Systems | violet-100 bg / violet-700 text |
| Sheet type / document type badges | Mist bg, Ink-80 text (quiet — type is metadata, not a signal) |
| Overdue (open task) & "Late by N" | orange-600 text; card overdue count on orange-100 chip |
| On time / completed | Ink-60 text, check icon; success green is allowed for toasts only `[default]` |
| Focus ring | 2px violet, visible always (NFR-11) |

**Contrast (AA, NFR-11):** `#F15C24` on white fails for body text — use orange only ≥18px semibold, on orange-100, or as `--bf-orange-600` `#D94E18` for small text. Ink and violet-700 on white pass; white on violet passes.

## App shell (SPEC §4)

Left sidebar (240px, Ink text on white, violet active state): logo + app name, then Forms / Sheets / Documents / Tasks; user menu at the bottom (name, role, sign out; admin also gets Employees + Archive). Header: **global search** (⌘K + a visible input) returning results grouped by section (§10.1, AC-17). Content: page title, primary "Add …" button (violet), filter row, then the table. Admin-only controls simply don't render for employees — while the server still enforces (skills/auth-roles).

## Tables (Forms, Sheets, Documents; task tables inside cards)

shadcn Table + TanStack: column sort per the FR for that module, company filter (+ type filter for Sheets/Documents), free-text search over the fields the FR names, pagination at 50 rows (NFR-01). Row actions: open/download (signed URL), edit, archive — with confirm ("This moves it to the archive; admins can restore it"). Links open in a new tab with an external-link icon (FR-F04/FR-S04). Sheets show `1,240 as of 12 Jul 2026` — the count is meaningless without its date (§6.3.1).

## Tasks section (§9.1)

Grid of employee cards (name, job title, three counts, overdue chip). Card expands to its task table (§9.2 columns; default sort open-first by deadline ascending). The checkbox is the completion control; with no result it opens the **result panel** — a dialog with result text, multi-file upload, link list, and one save button that completes the task (skills/task-rules). Completed rows: muted, strikethrough name, Late column filled.

## Empty states (§10.4 — this app starts empty)

Every section: small illustration using the logo mark motif, one sentence of purpose, and the primary action ("Add your first form"). Filtered-to-nothing gets its own "No results for … — clear filters" state. Never render a bare empty table.

## Responsive & a11y (NFR-03, NFR-11)

1280 → 375px. Below `md`: sidebar becomes a sheet/drawer, **tables become stacked cards** (label/value pairs, actions in a row) — build this as one reusable responsive-table component so all four sections inherit it. Dialogs go full-screen on mobile. Everything keyboard-reachable in a sane order; forms label every field; errors are field-level and specific (AC-02 tone: say what's wrong and how to fix it).

## Copy

Sentence case, plain verbs, active voice, buttons say what happens ("Save and complete task", not "Submit"). All strings through the `next-intl` `en` catalog (NFR-10) — hardcoded JSX strings are a lint error. English-only v1, but keep layouts direction-agnostic (logical properties: `ms-*`/`me-*`, `text-start`) since the brand is bilingual and Arabic may come later.

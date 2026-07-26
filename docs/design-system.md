# MuseVault design system

MuseVault uses a compact, dark interface designed to make dense library data calm and legible. The
foundation lives in `apps/web/src/styles/globals.css`; reusable React primitives live in
`apps/web/src/components/ui`.

## Visual principles

- Use near-black backgrounds and quiet surface elevation so artwork and data remain the focus.
- Reserve green for primary actions, healthy states, and concise emphasis. Purple, blue, pink, and
  yellow distinguish supporting categories.
- Prefer subtle borders and restrained shadows over glow or heavy glass effects.
- Keep layouts compact without reducing readable type, touch targets, or whitespace between
  sections.
- Use motion only to clarify interaction, with transitions between 160 and 220 milliseconds.

## Semantic colors

Components consume semantic Tailwind utilities rather than raw color values.

| Purpose            | CSS source token                                                                                           | Tailwind examples                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Page canvas        | `--mv-color-page`                                                                                          | `bg-page`, `text-page`                         |
| Sidebar            | `--mv-color-sidebar`                                                                                       | `bg-sidebar`                                   |
| Default surface    | `--mv-color-surface`                                                                                       | `bg-surface`                                   |
| Elevated surface   | `--mv-color-surface-elevated`                                                                              | `bg-surface-elevated`                          |
| Hovered surface    | `--mv-color-surface-hover`                                                                                 | `bg-surface-hover`                             |
| Primary text       | `--mv-color-text-primary`                                                                                  | `text-text-primary`                            |
| Secondary text     | `--mv-color-text-secondary`                                                                                | `text-text-secondary`                          |
| Muted text         | `--mv-color-text-muted`                                                                                    | `text-text-muted`                              |
| Primary accent     | `--mv-color-accent-green`                                                                                  | `bg-accent-green`, `text-accent-green`         |
| Supporting accents | `--mv-color-accent-purple`, `--mv-color-accent-blue`, `--mv-color-accent-pink`, `--mv-color-accent-yellow` | `text-accent-purple`, `bg-accent-blue/10`      |
| Borders            | `--mv-color-border-subtle`, `--mv-color-border-strong`                                                     | `border-border-subtle`, `border-border-strong` |
| Keyboard focus     | `--mv-focus-color`                                                                                         | `focus-ring`, `ring-focus-ring`                |

`accent-green-strong` is the primary hover color. `accent-green-muted` is the low-emphasis green
surface. Do not use accent colors as the only indication of status; pair them with text or an icon.

## Typography

The system font stack begins with Inter when it is available and falls back to native UI fonts.
Use the generated scale instead of one-off sizes:

| Utility              | Intended use                           |
| -------------------- | -------------------------------------- |
| `text-display`       | Marketing-level hero text              |
| `text-page-title`    | Dashboard page titles                  |
| `text-section-title` | Section headings and prominent metrics |
| `text-card-title`    | Card headings                          |
| `text-body`          | Primary interface copy                 |
| `text-body-sm`       | Supporting copy and controls           |
| `text-caption`       | Labels, metadata, and eyebrows         |

Headings should follow the document hierarchy even when their visual size differs. Body copy uses a
comfortable line height; uppercase captions should remain short.

## Spacing and layout

The base spacing unit remains Tailwind's quarter-rem scale. Three semantic responsive values cover
layout-level rhythm:

- `p-page-gutter` changes from 16px on mobile to 24px at 640px and 32px at 1024px.
- `gap-dashboard` changes from 16px to 20px and then 24px at the same breakpoints.
- `gap-section` changes from 32px to 40px and then 48px.

Use ordinary Tailwind spacing inside components. Use semantic spacing at page, dashboard-grid, and
section boundaries. Avoid horizontal overflow at 390px; content should be able to shrink with
`min-w-0`.

## Radii and shadows

- `rounded-control` (10px): buttons, inputs, and compact controls.
- `rounded-card` (14px): ordinary content cards.
- `rounded-panel` (16px): large grouped panels.
- `rounded-pill`: badges and status pills.
- `shadow-card`: quiet default depth.
- `shadow-elevated`: floating or hovered surfaces.

Borders remain visible on every surface so hierarchy does not depend on shadow alone.

## Component states

`Button` and `IconButton` provide primary, secondary, and ghost variants, semantic sizes, a default
`type="button"`, active feedback, disabled styling, and a visible focus ring. `IconButton` requires
an `aria-label` and keeps every size at least 44 by 44 pixels.

`Card` provides default, elevated, and interactive visual variants with four padding options.
Interactive cards animate their surface and reveal focus within, but callers must still supply the
correct link or button semantics for the interaction.

`Badge` supports neutral, green, purple, blue, pink, and yellow tones. `ProgressRing` clamps its
value to 0–100 and exposes progressbar name, minimum, maximum, and current value to assistive
technology. `SectionHeader` consistently associates an optional `id` with its heading and allows an
adjacent action.

Transitions use `duration-fast`, `duration-standard`, or `duration-slow` with `ease-standard` or
`ease-emphasized`. Reduced-motion preferences collapse transitions and animations globally.

## Responsive behavior

- Mobile (around 390px): one content column, page gutters at 16px, no horizontal scrolling, and
  controls large enough for touch.
- Tablet (from 640px through 1023px): larger gutters and gaps; secondary content may move below the
  primary grid.
- Desktop (1024px and wider): full page gutters and a multi-column dashboard with stable navigation
  and utility regions.

Components own only their local presentation. Page-level grids decide when navigation is hidden or
replaced and when utility content collapses.

## Accessibility expectations

- Preserve semantic landmarks and a logical heading hierarchy.
- Give icon-only controls a useful `aria-label`.
- Keep keyboard focus visible; do not suppress the shared focus outline without an equivalent ring.
- Maintain at least 44px targets for primary mobile controls.
- Pair status color with readable text or iconography.
- Mark decorative graphics `aria-hidden="true"` and name meaningful visualizations.
- Ensure hover, active, disabled, and focus-visible states remain distinguishable without motion.

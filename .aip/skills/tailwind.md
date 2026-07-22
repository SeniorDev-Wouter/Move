# Tailwind CSS conventions

House rules for styling work in TaskFlow. TaskFlow is a small React + TypeScript
Kanban board. Follow these when a ticket involves UI, layout, or styling.

## Setup (already in place — Tailwind v4)

Tailwind CSS **v4** is installed and wired up. Do not re-install or add a
`tailwind.config.js` / PostCSS config — v4 is CSS-first:

- Vite plugin `@tailwindcss/vite` is registered in `vite.config.ts`.
- `src/index.css` starts with `@import 'tailwindcss';`, above the existing
  `:root` design tokens (which coexist with Tailwind).
- Customize the theme with `@theme { ... }` in `index.css` (v4 CSS-first config),
  not a JS config file. Prefer mapping the existing CSS variables
  (`--accent`, `--low`, etc.) into `@theme` tokens rather than hardcoding hexes.

## Core rules

- **Utilities in JSX, not new CSS.** Prefer `className="..."` utility classes
  over adding rules to `src/index.css`. Only put truly global things (resets,
  CSS variables, `@layer base` tokens) in the stylesheet.
- **No `@apply` for one-offs.** If a class string repeats, extract a small React
  component (e.g. `<Pill>`, `<CardShell>`) — don't create an `@apply` alias.
- **Spacing via `gap-*`.** Use `flex`/`grid` + `gap-*` for spacing between items
  rather than margins on children.
- **Design tokens over arbitrary values.** Reach for the scale (`p-4`, `text-sm`,
  `rounded-lg`). Use arbitrary values (`w-[137px]`) only when the scale genuinely
  can't express it, and leave a one-line comment why.
- **Dark mode via the `dark:` variant** on elements — never a second stylesheet
  or a JS theme swap.
- **Responsive is mobile-first**: base classes target small screens, layer up
  with `sm: md: lg:`.
- **Conditional classes**: build class strings with a tiny helper (template
  literal or `clsx` if present) — keep the truthy/falsy logic readable, don't
  nest ternaries inside the `className`.

## TaskFlow specifics

- Columns (To Do / In Progress / Done) should share one column component; style
  variance (e.g. a done-column tint) comes from a prop, not duplicated markup.
- Drag states from `@dnd-kit` (dragging, drop-target hover) should be expressed
  as conditional utility classes on the existing elements — don't add global
  `.dragging` rules.
- Keep the priority pill (low/medium/high) a single component whose color map is
  a typed record, not scattered conditionals.

## Don't

- Don't add a UI framework or component library to "help" — plain Tailwind + the
  existing components only.
- Don't leave commented-out class strings or debug ring/border utilities behind.

---
name: refactoring-ui
description: Visual hierarchy, spacing, type, color, depth and polish rules from Refactoring UI (Wathan & Schoger), aligned with QA 11X WCAG 2.1 AA, Anti-JSDOM geometry, and Lighthouse CI. Use when building or restyling an interface, when a UI looks unpolished or cluttered and the cause is unclear, or when picking concrete values for a spacing scale, type scale, color palette or shadow set.
---

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation in Spanish.

# Refactoring UI (QA 11X Frontend Edition)

Design decisions an engineer can make without a designer. Every rule here is a
value you can type into code, calibrated to pass `@axe-core/playwright` (WCAG 2.1 AA)
and Lighthouse CI (`Performance >= 90`, `Accessibility >= 95`, `CLS = 0`) on the first attempt.

## Read the project's system first

Before you invent a scale, find the one the project already has: the `@theme`
block in the CSS entrypoint, a `tokens.css`, a theme file, or just the values
already used in neighbouring components. That is the source of truth; this skill
is what to do when it does not exist yet, or where it leaves you a free choice.

Tailwind v4 configures in CSS. `@theme` in the stylesheet holds the tokens, and
`tailwind.config.js` applies only where a project still carries one and loads it
through `@config`. Look in the CSS first: the entrypoint is the stylesheet that
contains `@import "tailwindcss"`, and its `@theme` block is the system.

`@tailwind base;` directives in that file mark a v3 project instead. There the
tokens live in `tailwind.config.js`, and the v4 utility names this skill cites
(`shadow-xs`, `inset-shadow-*`, `bg-linear-*`, `text-shadow-*`) do not exist:
translate each one to its v3 spelling before you write it. The rename table is
in [`tailwind.md`](references/tailwind.md).

Note also what the tooling does **not** constrain. v4 derives spacing from a
single `--spacing` value, so `p-17` and `w-29` are as valid as `p-4`; border
widths, opacities and durations take any integer too. The framework will not
stop you leaving the scale — holding it is your job. Named sets (radius, shadow,
type, color) *can* be narrowed to yours with `--<namespace>-*: initial`.

Adding a value that is not in the system is a decision to change the system.
Make it deliberately, and add it to the system: a new `@theme` variable, not an
arbitrary `[value]` in the markup.

## Systems, not values

The book's one meta-rule: never pick a value out of a continuous range. Pick it
from a small named set, defined in advance.

Given 12px, 16px, 21px and 32px, choosing is easy: guess the middle, compare the
two neighbours, and two of the three will look obviously wrong. Given every
integer from 10 to 40, every option is defensible and you have no way to decide.

Systematize font size, font weight, line-height, color, margin, padding, width,
height, shadow, border radius, border width and opacity. Two constraints make a
scale usable:

- **Never let two adjacent values sit closer than ~25%.** Values you cannot tell
  apart are choices you cannot make. This is why a linear scale ("multiples of
  4px") does not help: 120px and 124px differ by 3%.
- **Ratios beat increments.** 4px matters between 12px and 16px (33%); it is
  invisible between 500px and 504px.

## Hierarchy is the lever

The largest single factor in whether an interface looks designed is not styling
— it is whether the relative importance of its elements is visible.

Every element you style ranks somewhere: **primary**, **secondary**, or
**tertiary**. Make that rank visible with weight and color before reaching for
size, and de-emphasize competing elements before further emphasizing the one you
want noticed. Full rules in [`hierarchy.md`](references/hierarchy.md).

## Personality

Four concrete factors carry the feel of an interface, and they are decided once,
early, then held constant everywhere:

- **Font**: serif reads elegant or classic, rounded sans reads playful, neutral
  sans reads plain and gets out of the way.
- **Color**: blue is safe and familiar, gold reads expensive, pink reads fun.
- **Border radius**: small is neutral, large is playful, square is formal. Pick
  one and apply it to every corner in the UI — mixing radii looks worse than
  either choice alone. An element nested inside a rounded one with an inset
  takes the parent's radius minus the inset, so the curves stay concentric:
  `rounded-[calc(var(--radius-xl)-1px)]` inside `rounded-xl` at `inset-px`.
- **Language**: the words carry as much personality as the type does. "Your
  request has been submitted" and "Got it, we're on it!" are the same feature.

## QA 11X Verification & Anti-JSDOM Alignment

When applying Refactoring UI rules in a Level-11X project (`vue3/` or `react-frontend/`),
strictly enforce these 5 test-certified invariants:

1. **In-Flow Footers & Anti-JSDOM Geometry:**
   - JSDOM returns `0x0` bounding boxes and cannot detect overlapping elements.
   - Never use `position: fixed` floating footers over operational tables or forms. Place footers in-flow (`margin-top: auto` inside `<main>`).
2. **Multi-Viewport Zero Horizontal Overflow:**
   - Certify `document.documentElement.scrollWidth <= window.innerWidth` across Mobile (`375x667`), Tablet (`768x1024`), and Desktop (`1440x900`). Use `pointer-coarse:p-4` (`min-height: 44px`) on touch targets.
3. **Zero CLS & Tabular Numbers (`tabular-nums`):**
   - Always apply `tabular-nums` (`font-variant-numeric: tabular-nums`) and right-alignment on numeric table columns, live telemetry counters, and timers so digit changes never trigger horizontal layout shifts (`CLS = 0` in Lighthouse CI).
4. **WCAG 2.1 AA First-Try Pass (`@axe-core/playwright`):**
   - Never use translucent text (`text-white/70` or `opacity: 0.5`) to create hierarchy; pick a solid shade (`OKLCH` / palette step) that clears `4.5:1` (normal text) or `3:1` (large text).
   - Pair semantic colors with geometric/text indicators (`▲`/`●`/`■`/`✕`) so colorblind and `forced-colors` users never rely on hue alone.
   - Keep `role="list"` on unbulleted `<ul>` elements, and use `outline-hidden` instead of `outline-none` so keyboard focus rings remain visible in high-contrast modes.
5. **Zero Orphan Theme Tokens:**
   - Define semantic role variables (`:root`, `.dark`, `[data-theme="light"]`, `[data-theme="high-contrast"]`) with 100% parity across all themes; never leave a custom property undefined in any theme.

## Reference

Reach for the file that matches the decision in front of you:

| Deciding | Read |
|---|---|
| what to emphasize, button ranks, labels, text on colored backgrounds | [`hierarchy.md`](references/hierarchy.md) |
| white space, spacing scale, widths, grids, responsive sizing | [`layout.md`](references/layout.md) |
| type scale, font choice, line length, line-height, alignment, letter-spacing | [`type.md`](references/type.md) |
| palette, shades, greys, contrast ratios, colorblind safety | [`color.md`](references/color.md) |
| shadows, elevation, raised and inset elements, layering | [`depth.md`](references/depth.md) |
| text over photos, icon and screenshot scaling, user-uploaded images | [`images.md`](references/images.md) |
| a design that is correct but feels plain, empty states, borders | [`polish.md`](references/polish.md) |
| a dark theme: the toggle, theme tokens, hierarchy and depth on dark | [`dark-mode.md`](references/dark-mode.md) |
| `@theme` namespaces, narrowing a set, tokens in custom CSS, Preflight, v3 renames | [`tailwind.md`](references/tailwind.md) |

## The bar

The work is done when every element you styled has a rank you can name, and
every value you typed came from a named set rather than from your judgement in
the moment. A magic number in the diff is unfinished work: either it belongs in
the system, or the system already had the value you needed.

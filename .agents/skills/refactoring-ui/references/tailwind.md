# Tailwind v4 mechanics

How the system lives in a Tailwind v4 project: where the tokens are, how to
narrow them to your set, how to reach them from custom CSS, and what changed from
v3. The design rules themselves live in the topic files.

## `@theme` is the system

Tokens that should become utilities go in `@theme`, in the entrypoint (the
stylesheet with `@import "tailwindcss"`). Variables that should *not* generate a
utility go in `:root`. `@theme` must be top-level: never nested under a selector
or a media query, which is why per-theme values live in `:root` and reach
`@theme` through `inline` (see [`dark-mode.md`](dark-mode.md)).

Each namespace generates one family of utilities. The ones that hold the values
this skill says to systematize:

| Namespace | Utilities | Default set |
|---|---|---|
| `--spacing` | `p-*` `m-*` `w-*` `h-*` `size-*` `gap-*` `leading-*`… | one base, `0.25rem`; every number is a multiple |
| `--container-*` | `max-w-*` `w-*` `basis-*`, `@sm:`… variants | `3xs` 16rem … `7xl` 80rem |
| `--breakpoint-*` | `sm:` … `2xl:` | 40 / 48 / 64 / 80 / 96rem |
| `--text-*` | `text-xs` … `text-9xl` | 12px … 128px, each with a paired line-height |
| `--font-weight-*` | `font-thin` … `font-black` | 100 … 900 |
| `--font-*` | `font-sans` `font-serif` `font-mono` | `font-sans` is the system stack |
| `--tracking-*` / `--leading-*` | `tracking-tight`… / `leading-tight`… | see [`type.md`](type.md) |
| `--color-*` | every color utility | 11 steps per family, 50 … 950 |
| `--radius-*` | `rounded-*` | `xs` 2px … `4xl` 32px |
| `--shadow-*` / `--inset-shadow-*` / `--drop-shadow-*` | `shadow-*` / `inset-shadow-*` / `drop-shadow-*` | 7 / 3 / 6 steps |
| `--text-shadow-*` | `text-shadow-*` | `2xs` … `lg` |
| `--blur-*` | `blur-*` `backdrop-blur-*` | `xs` 4px … `3xl` 64px |
| `--aspect-*` | `aspect-*` | `video` only |
| `--ease-*` | `ease-*` | `in`, `out`, `in-out` |

## Narrow a namespace to your set

`@theme` *adds* to the defaults. Once a namespace holds the project's set, reset
it so nothing else generates:

```css
@theme {
  --radius-*: initial;
  --radius-sm: 0.25rem;
  --radius-lg: 0.75rem;
}
```

`--*: initial` resets the whole theme. Narrowing works for every named set above.
It does not work for spacing: `p-17` is generated from the `--spacing` base and
no reset removes it, so the spacing scale stays a discipline, not a constraint.
The same holds for the bare-number utilities `border-<n>` (px), `opacity-<n>`,
`stroke-<n>` and `duration-<n>`: any integer works, so pick from your set.

Add a step the same way you would define one: `--container-form: 36rem` gives
`max-w-form`, `--shadow-solid: 0 4px 0 var(--color-gray-900)` gives
`shadow-solid`. That is the move this skill means by "add it to the system",
in place of an arbitrary `max-w-[500px]`.

## Reach the tokens from custom CSS

Every theme variable compiles to a CSS variable, so custom CSS stays on the
system: `var(--color-gray-700)`, `var(--radius-lg)`, `var(--shadow-xl)`,
`var(--text-2xl--line-height)`. Two build-time functions cover the rest:

- `--spacing(4)` compiles to `calc(var(--spacing) * 4)`: a step of the spacing
  scale inside `calc()`, as in `py-[calc(--spacing(4)-1px)]`.
- `--alpha(var(--color-lime-300) / 50%)` compiles to a `color-mix()`.

In a class, `bg-(--brand)` is shorthand for `bg-[var(--brand)]`; v3's
`bg-[--brand]` no longer works. `theme()` is deprecated in favour of the
variables.

## Preflight decides some defaults for you

- **Headings are unstyled** (`font-size` and `font-weight` inherit), on purpose:
  the docs' reason is that UI headings usually want de-emphasis. Every heading
  size is a choice you make, which is the point of "visual hierarchy is not
  document hierarchy".
- **Lists are unstyled** (`list-style: none`), and VoiceOver stops announcing
  them as lists. A real list styled without bullets keeps `role="list"`.
- **Images are block-level and `max-w-full h-auto`**: they keep their intrinsic
  ratio unless you size them.
- **Buttons use `cursor: default`.** Restore the pointer in `@layer base` if the
  project wants it.
- **Placeholders are the text color at 50% opacity.** Set
  `placeholder:text-gray-500` when that reads too faint or too loud.

## Coming from v3

The shadow, radius and blur scales shifted one step. The bare names still work
and render as they did; the `-sm` names are the trap, because they now mean the
old bare value, one step heavier:

| v3 | v4 |
|---|---|
| `shadow-sm` / `shadow` | `shadow-xs` / `shadow-sm` |
| `drop-shadow-sm` / `drop-shadow` | `drop-shadow-xs` / `drop-shadow-sm` |
| `blur-sm` / `blur` | `blur-xs` / `blur-sm` |
| `backdrop-blur-sm` / `backdrop-blur` | `backdrop-blur-xs` / `backdrop-blur-sm` |
| `rounded-sm` / `rounded` | `rounded-xs` / `rounded-sm` |
| `outline-none` | `outline-hidden` |
| `ring` (3px) | `ring-3` |
| `bg-opacity-*`, `text-opacity-*`… | opacity modifier, `bg-black/50` |
| `bg-gradient-to-r` | `bg-linear-to-r` |

Defaults that changed without a rename:

- **`border`, `divide` and `ring` are `currentColor`**, not `gray-200`/`blue-500`,
  and bare `ring` is 1px. Give every border a color.
- **`outline-none` really removes the outline** now. `outline-hidden` keeps an
  invisible one that forced-colors mode still shows.
- **`hover:` applies only where the device can hover** (`@media (hover: hover)`).
  Anything revealed only on hover is invisible on touch.
- **`space-*` targets `:not(:last-child)`.** Where it misbehaves, switch to
  `flex flex-col gap-*`.
- **Transforms are separate properties**: transition `[opacity,scale]`, not
  `[opacity,transform]`, and reset with `scale-none`.
- **Variants stack left to right**, and `!important` moves to the end
  (`bg-red-500!`).

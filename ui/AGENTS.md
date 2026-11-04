# ui — the shared web component library

Read the repository's [`AGENTS.md`](../AGENTS.md) first; this file adds what applies to work in `ui/`.

`@agenthix/ui` is the shared React component library and its design tokens, consumed by `hq` and by `console-web`
(the Fleet Console's screens), which selects its own token values with `data-portal="fleet-console"`. Before adding or changing a component
or a token, read [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md): the rules, the component lift workflow, the inventory,
and how each module hooks into the tokens.

- `src/primitives/` holds generic atoms; `src/projects/` and `src/tasks/` hold domain components.
- **`src/theme/tokens.css` is the single source of every colour and font token.** A new token is added there
  first. `@theme {}` holds the dark values; the light values, which apply unless `<html>` carries `data-theme="dark"`,
  go in `:root[data-theme="light"], :root:not([data-theme]) {}` in the same file. The type scale (`text-display`
  … `text-micro`) and the monospace family (`font-mono`) are tokens too. Never bake a dark-only assumption into a component.
- **Never hardcode a hex colour** in a component: use the token utilities, or `var(--color-…)` in inline styles.
- Clients built on these tokens outside this repository keep their own copy, so a change to `tokens.css` is not
  finished until those copies are updated too — each in its own repository and commit.
- **`react`, `react-dom`, `@types/react` and `@types/react-dom` are pinned exactly in `ui/package.json`, and the pins move
  with hq's.** hq builds and type-checks with its own copies of them, linked into `ui/` (hq's Dockerfile and the *Checks*
  workflow do it), and two versions of `@types/react` type-check as unrelated types. When a change to hq's installed
  versions of these four moves them, change the pins here in the same change.

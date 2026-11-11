---
created: 2026-11-10
description: The design system made softer and more polished — how colours, surfaces, borders, fields and type work together in dark mode and light mode — proposed from a comparison with well-regarded AI products and applied through the design tokens, not screen by screen.
---

# A softer, more polished design system

An **initiative**. Side by side with other AI products, Agenthix doesn't feel polished: dark mode isn't soft enough, and in
light mode most pickers and fields are grey on a white page. The cause is most likely in the design system — the tokens
for colour, surfaces, borders, fields and type — so that is where it is fixed, once, for every screen.

**It covers:**

- **A review against references**: three representative screens compared with the owner's reference products, in
  dark and light mode, with a diagnosis of what makes them feel unpolished.
- **A proposal at the token level**: neutrals and the surface ladder, borders, field and picker fills, text tones,
  the accent's use, radii, and the type scale, weights and line heights — shown before and after on the same screens.
- **Applying it** through `ui/src/theme/tokens.css` and `ui/DESIGN-SYSTEM.md`, then checking the screens it changes.

**It holds** [`spec.md`](spec.md) (today and the design), [`boards/`](boards/) (before and after, the build baseline
once settled) and [`plan.md`](plan.md).

**It follows** [every screen reviewed](../2026-10-06-every-screen-reviewed/plan.md), which set the design system's rules.

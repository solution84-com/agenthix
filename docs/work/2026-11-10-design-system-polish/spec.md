---
name: A softer, more polished design system — spec
description: What makes Agenthix feel unpolished beside other AI products, and the token-level changes that fix it in dark and light mode.
created: 2026-11-10
author: leang
---

# A softer, more polished design system — spec

**Status:** Design approved by the owner on 10 November 2026. Phase 2 (apply) next.

## Purpose and outcome

Agenthix should feel as calm and finished as the AI products people already use. Done when the owner, comparing the
same screens with the references, finds Agenthix as soft in dark mode and as clean in light mode, and the change was
made in the tokens and the design-system rules, not screen by screen.

## Today

Measured in the running app and drawn in [`boards/before-after.html`](boards/before-after.html): six screens before and
after, the diagnosis (*Why it feels less polished today*), and the current token values beside the proposed ones.

## The owner's observations

1. Dark mode is not soft enough.
2. Agenthix does not feel polished beside ChatGPT, Antigravity and Grok Bot.
3. In light mode the page is white but most pickers and fields are grey; that doesn't feel right.
4. The typography may be part of it.

## Design

**Approved by the owner on 10 November 2026**, on the boards [`before-after.html`](boards/before-after.html) (colours,
fields, type) and [`selected-states.html`](boards/selected-states.html) (selected, hover, focus, disabled, cards). The
token values, today and proposed, are the table at the end of `before-after.html`.

**Neutral charcoal.** Neutral greys with no hue in both modes: dark #181818 / #212121 / #2a2a2a / #333333, light
#f9f9f9 / #ffffff / #f4f4f4 / #ececec. Depth comes from one tone step at a time; borders are hairlines.

**Fields belong to the page.** One `field` token: white with a hairline border in light, filled one step up in dark. A
focused field darkens its edge. No grey field on a white page, and no field that hard-codes its fill.

**Indigo in three places only:** the main button, links (a `link` token that passes AA), and things switched on.

**Calm type and corners.** Inter stays; 13/20 and 14/22 for small and body text, messages at a whole 15 px, headings
at 500. Three radii: 10 for controls, 14 for cards and menus, 18 for bubbles.

**Selected never looks inactive.**

| What it is | Chosen | Not chosen | Disabled |
|---|---|---|---|
| One of a small set | A segmented control: the chosen piece raised (light white, dark one step up), a faint shadow, ink text, medium weight | Plain secondary text, no box | Faded to 40 %, no hover, no lift, no colour |
| A row in a menu or list | Grey fill, ink text and icon, medium weight | Secondary text, muted icon | |
| On or off | Indigo | A hairline outline | |
| A card you pick | A firm ink edge, no fill | A hairline | |

**Hover, press and focus.**

| Interaction | Controls | Clickable cards |
|---|---|---|
| Hover | One tone step; text to full ink; a field's edge firms up; the main button a deeper indigo; a link underlines | Edge firms up and a soft shadow; in dark one shade lighter. No movement, no colour |
| Pressed | One more step | The shadow drops; the fill one step |
| Keyboard focus | An indigo ring on buttons and links, keyboard only; a field shows its darker edge | An indigo ring |
| Information only | — | No hover at all |

## Not in this unit

- Layout changes to individual screens, unless a token change needs one.
- The file previews' own findings (their unit).

## Open questions

1. *(After the review.)*

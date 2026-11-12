---
created: 2026-11-12
description: Avatars and covers generated in hq's own code from a stored recipe, editable part by part, replacing the committed preset pictures; Kernel gets its own robot, and every picture gets a small copy.
---

# Generated avatars and covers

An **initiative**. hq makes agents' avatars and covers itself instead of offering a set of committed preset pictures:
a face drawn part by part, a symbol or initials, on a background from one palette, and a cover from a pattern
generator. A new agent starts with a random robot and cover; Kernel has its own. The robots are a release asset of
their own; no picture is committed to hq.

**It covers:**

- **The picture module**: the palette, the recipe and its validation, the styles, Kernel's robot, the cover generator, and drawing a
  recipe into a WebP file and a small copy with sharp.
- **A small copy of every picture**, uploads included, and every upload re-encoded.
- **The defaults** for new agents, Kernel, people, teams and the organisation.
- **The picker**, as approved on [`boards/picker.html`](boards/picker.html), for agents, people, teams and the
  organisation, and the inspect view.
- **One agent tool**, `generate_agent_picture`, in place of the two preset tools.
- **Deleting** replaced and removed pictures, and a sweep.
- **Removing the presets.**

**It holds** [`spec.md`](spec.md) (today and the design), [`plan.md`](plan.md), [`boards/`](boards/) and the
gitignored `execution/`. The decision is [ADR-0187](../../adr/adr-0187-a-generated-picture-is-a-file-made-from-a-stored-recipe.md).

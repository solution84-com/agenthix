---
created: 2026-11-12
description: An avatar or cover hq generates is drawn on the server from a stored recipe into an ordinary WebP file, kept where an upload is, with a small copy beside it; the recipe is saved so the picture can be edited again, and every consumer keeps showing a file.
---

# ADR-0187: A Generated Picture Is a File Made From a Stored Recipe

**Date:** 2026-11-12
**Status:** Accepted

## Context

Agents' avatars and covers came from 31 committed preset pictures, copied into an agent's images when picked. The set
was not good enough for a release, Kernel had no picture, and new agents showed initials. hq is to generate pictures
itself instead — characters and faces drawn part by part, symbols, initials, covers from a pattern generator — and people must
be able to edit a generated picture again. Many places show a picture: hq's screens, the shared ui library,
notifications, the mobile app and the Fleet Console, all through `avatarUrl` and `coverUrl`.

## Options considered

**Store only the recipe and draw it wherever it is shown.** Rejected: every consumer would need the drawing code, the
mobile app cannot show an SVG without an extra library, and a library upgrade could change a picture already shown.

**Store only the drawn file, as with presets.** Rejected: the picture could not be edited again.

**Fetch pictures from an outside service while hq runs.** Rejected: an offline install cannot reach it, and it tells
the service who the users are.

**Draw a file on the server from the recipe, and store both** (chosen).

## Decision

**A generated picture is drawn on the server into an ordinary WebP file, stored where an uploaded picture is, and its
recipe is saved beside it on the row.**

- **The recipe** is `{ v, kind, style, styleVersion, choices }`: hq's outer fields, and choices that only the style
  reads. It names every part explicitly; a seed fills the parts once, when a picture is first made. It is a stored
  format under `docs/architecture/versioning.md`.
- **The file is what every consumer shows**, through `avatarUrl` and `coverUrl` as before. A recipe never changes a
  stored file; saving a new one writes a new file under a new name.
- **Drawing runs in hq's server with sharp**: a robot on its background, a DiceBear style's SVG, or the
  cover generator's SVG, each into a full WebP and a small copy. The picker previews in the browser with the same pinned
  code, and the server validates every recipe before drawing it.
- **Uploads take the same path out**: decoded and written again as WebP with a small copy, which drops their metadata.
- **A small copy of every picture** is kept beside it, and `size=small` on hq's file-link request chooses it.
- **A replaced or removed picture's files are deleted**, and a sweep removes any file no row names.
- **A style is an entry in one registry**; a new style is a new entry, never a new column or format.

## What this binds

- No consumer draws a recipe; consumers show the file.
- Nothing serves a generated SVG; what is stored and served is WebP.
- Colours in a recipe are names from one palette file; no hex value appears in a recipe.
- No picture file is committed to hq's source. The robots are a release asset, pinned by SHA-256 and fetched when hq
  is built; hq works without them. A robot's published name is never changed.

## Consequences

### Positive
- Nothing that shows a picture changes, and lists download a small file instead of the full one.
- Pictures are made offline, with nothing fetched and no curated set to maintain.
- A person's uploaded photo no longer carries its metadata, and a removed photo is gone from hq.

### Negative
- sharp is hq's first native module, so the hq image must be built and started on each of its platforms.
- Saving a picture costs the server a render, so it is rate-limited.

### Risks
- A DiceBear upgrade that changes a style's options: the recipe names its `styleVersion`, and the style's validation
  maps or refuses an older one; the stored file is unaffected.
- In a demo, a visitor's saves are charged by the bytes they wrote, after writing. Several saves made at once can pass
  the visitor's storage budget by at most what the per-person limit allows in a minute (30 pictures). Replaced files
  are deleted, so the overshoot does not grow. This is accepted while the per-person limit stays.
- Renaming a team, a person or the organisation draws its Initials again, and that drawing is not counted against the
  per-person limit. It is one small drawing per rename, and renames are already limited by who may make them. This is
  accepted while drawing Initials stays that cheap.

**Implemented** by the generated avatars and covers unit, closed 12 Nov 2026.

The design is the generated avatars and covers unit (`docs/work/2026-11-12-generated-avatars-and-covers/spec.md`).

## References

ADR-0153 (relays carry every file byte and hq only signs tickets), `docs/architecture/versioning.md`.

---
created: 2026-11-10
description: Every file an agent hands back is easy to check — each kind of file previewed well in every place it opens — and the build is then deployed to a VPS for a week of use before the release candidate.
---

# File previews people can check their work with, then the VPS

An **initiative**, run before the first release candidate. People check an agent's work by opening the files it made.
The previews were built in [seeing the agents' work](../2026-10-26-seeing-the-work/spec.md), but the last look at them
found them hard to use. This unit reviews them kind by kind and place by place, fixes what makes them hard to use, and
then puts the build on a VPS for a week of real use.

**It covers:**

- **A review of every file preview**: each kind (Markdown, text, code, JSON, a table, an image, a PDF, and a file with
  no preview) in each place a file opens (Files, a workspace, a task's attachments and working files, a link, a chip in a
  conversation, an image embedded in Markdown).
- **Fixing what the review finds**, one item at a time, until nothing remains.
- **Deploying the build to a VPS**: hq and its site on one machine, behind HTTPS with a files address, as a
  self-hoster would install it, for the owner to use for a week.

**It holds** [`spec.md`](spec.md) (what is there today and the design), [`boards/`](boards/) (the preview screens, the
build baseline, once settled) and [`plan.md`](plan.md) (the phases, as checkboxes).

**It follows** [seeing the agents' work](../2026-10-26-seeing-the-work/spec.md), whose renderer boundary, frame and
renderers it reviews, and [live preview](../2026-11-01-live-preview/plan.md), whose live preview stays behind its flag.

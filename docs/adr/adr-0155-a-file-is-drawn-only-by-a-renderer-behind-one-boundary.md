---
created: 2026-10-26
description: Every file is drawn by a renderer looked up by its kind in one registry. A renderer is given the file's facts and its bytes and returns one report; Agenthix's frame draws everything around it. Text-like kinds are drawn in the page as text, and active kinds in a sandboxed frame on the files address.
---

# ADR-0155: A File Is Drawn Only by a Renderer Behind One Boundary

**Date:** 2026-10-26
**Status:** Accepted

## Context

When this was decided, the file viewer was one hard-coded switch over a closed set of kinds. Every new format changed
the code around it, and each kind drew its own errors. People need many more formats drawn, in several places: Files,
a task, a link, a message, a Markdown page. Organisations will want formats of their own. Some formats, such as PDF,
need active code that must never run with the person's hq session.

## Options considered

- **Keep the switch and add cases.** Rejected: every format touches the frame, and nothing stops a case from reaching
  hq's API.
- **One large viewer component (for example Monaco) for everything.** Rejected: it draws code well and nothing else,
  and editing is not wanted.
- **Third-party renderers loaded into hq's page.** Rejected: code that isn't Agenthix's would run with the person's
  session.
- **The browser's own PDF viewer.** Rejected: browsers refuse it inside a sandboxed frame.
- **A registry of renderers behind one contract, with active kinds framed on the files address (chosen).**

## Decision

1. **A file's kind is chosen by one function in core**, so hq and the page agree, from its name and whether its
   first bytes look like text.
2. **A renderer is an entry in one registry**, declaring the kinds it draws and where it runs. Adding a format is
   adding an entry.
3. **A renderer is given only the file's facts and its bytes**, through the relay. It gets no hq API, no person and no
   store. It returns one report: ready, partial, or failed with a reason. It draws in two modes, opened and embedded.
4. **Agenthix's frame draws everything else**: header, actions, Download, and every state in words. A renderer never
   draws its own error.
5. **Text-like kinds are drawn in the page by trusted code, as text, never as HTML.** Active kinds are drawn in a
   sandboxed frame loaded from a viewer page on the files address. It reports by `postMessage`, checked against that
   origin. A renderer an organisation adds would be a framed renderer.

## What this binds

- Every place that shows a file's content goes through the registry and the frame, never a renderer of its own.
- A new format is a registry entry; the frame does not change for it.
- No renderer runs active code in hq's page.

Undoing it means formats spread through the screens again, and active content close to the person's session.

## Consequences

### Positive

- New formats, including an organisation's own later, need no change to the frame.
- Every state reads the same wherever a file is shown.

### Negative

- PDF and other active kinds need a files address. On a bare address they offer Download only.

### Risks

- **A framed renderer's code can be tricked by a hostile file.** Accepted: it runs on the files address, with no
  session, and sees one file's bytes for one ticket's life.

## Implementation notes

Built by the unit of work [`2026-10-26-seeing-the-work`](../work/2026-10-26-seeing-the-work/plan.md) (2026-10-27): the kind is core's `chooseFileKind`; the contract's core half is `core/src/files/contract.ts`, the registry, the frame and the renderers (Markdown, text, code, JSON, table, image, PDF) are `@agenthix/ui/files` (`ui/src/files/`); the PDF viewer page is the relay's own, on the files address (`relay/viewer/pdf/`). The Markdown renderer is given hq's own Markdown component, so files, knowledge pages, tasks and replies draw and embed the same way. Renderers an organisation adds are not built. How it fits together: [`files-in-the-browser.md`](../architecture/files-in-the-browser.md).

## References

- adr-0039 — answers its open question on the viewer's scope.
- adr-0114 — the files address, a separate origin.
- adr-0153 — the bytes a renderer reads come through a relay on a ticket.

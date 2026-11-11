---
created: 2026-11-11
description: A dialog stops the person, so the screens open one only when stopping them is the point — a press that failed, a question before something that cannot be undone, typed work about to be lost. Every other message is said by one of a closed list of handlers that do not stop them; a read the screen makes on its own is retried quietly and never opens a dialog.
---

# ADR-0185: A Dialog Only When Stopping the Person Is the Point

**Date:** 2026-11-11
**Status:** Accepted

## Context

The design system unit made every message about the screen a centred dialog, so that no message sat in the page's
layout. In the playtest that followed, the dialog was everywhere: a network blip while a thread re-read its messages,
a site that was asleep on the Agents page and twelve other screens, the Fleet Console's dashboard on its first failed
refresh. Each stopped the person, who had done nothing, and had to be closed. Being stopped on page after page is
enough to put people off the product.

## Options considered

**Keep one rule, a dialog for everything.** Rejected: it is what the playtest found too heavy.

**Inline alerts, banners and toasts, chosen screen by screen.** Rejected: it is what the one rule replaced; messages
pushed controls, and errors went to toasts that vanished before they were read.

**Kinds of message, each said by a named handler, with the dialog kept for what must stop the person** (chosen).

## Decision

**A dialog stops the person, so the screens open one only when stopping them is the point: a press that failed, a
question before something that cannot be undone, or typed work about to be lost. If the person did not just press
something, it is never a dialog**, typed work about to be lost aside.

- **Every message is said by one of a closed list of handlers**: the attention dialog, the confirm dialog, a toast,
  the frame line, a notification, the call bar, a nudge in place of the content, a nudge in a meta line or row, a line
  in a conversation's thread, the message box's "Not sent", a refused control, a field's error, the failure drawn in
  the thing, spoken words in a call, a quiet retry, or no message. A new way of saying something is a change to this
  list, not a choice made on one screen.
- **A read the screen makes on its own is retried quietly** and, if it keeps failing, said by a nudge where its content
  would be. It never opens a dialog.
- **A toast is only for a press that worked whose result the screen does not show.** Never an error, never anything to
  act on.
- **The frame line is only for HQ as a whole** (not answering, read-only during a move); one thing someone must act on
  is a notification.
- **The browser's own `alert`, `confirm` and `prompt` are never used.**

## What this binds

- A builder states the kind of every message; the helpers require it, and the design guard test refuses a dialog
  handed a read's failure, the browser's dialogs, and a message without a kind.
- How each handler is chosen and built is the repository's error-handling skill; how each looks is
  `ui/DESIGN-SYSTEM.md` *Messages*.
- A change that adds a message is checked by making it fail on purpose and watching what the person sees.

## Consequences

### Positive
- The person is stopped only when they must be, so a dialog carries weight when it comes.
- A passing failure fixes itself without anyone seeing it.

### Negative
- Quieter messages are easier to miss. A failed press stays a dialog for that reason, and a nudge stays until its
  cause clears.

### Risks
- Silence hiding a real outage: a quiet retry that never escalates would look like an empty screen. The retry ends in
  a nudge, old content is marked out of date after a minute, and HQ not answering is the frame line.

Implemented by the error-message kinds unit (`docs/work/2026-11-11-error-message-kinds/`, closed 11 Nov 2026): the
pieces are in `@agenthix/ui/attention` (`Nudge`, `Toast`, `FrameLine`, `useBackgroundRead`, the retry policy) and
`ConfirmDialog` in the primitives; every message in hq, the shared library and the Fleet Console was moved to its
handler; hq's queries retry by `siteReadRetry` and never read the signed-in person again on their own; the design guard
(`ui/src/__tests__/designGuard.test.ts`) refuses the browser's dialogs, a message without a kind and a site's silence
as a dialog. How to apply it is the repository's `handling-errors` skill.

## References

adr-0172 (a flag has a stage), the notifications concept (`docs/concepts/notifications/notifications.md`).

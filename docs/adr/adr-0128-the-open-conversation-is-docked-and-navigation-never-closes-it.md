---
created: 2026-10-18
description: hq's shell is drawn once, above the pages, and holds one open conversation docked beside whatever page is shown; going anywhere changes the page and never the conversation, which only the person opens, changes or closes, and which the address carries as ?c=.
---

# ADR-0128: The Open Conversation Is Docked, and Navigation Never Closes It

**Status:** Accepted

## Context

Since a conversation's lead commissions work across places (adr-0121, adr-0127), a conversation no longer has to own
the screen it is in. While each page drew its own frame and a conversation filled its place's screen, going to a
task, a board or another project left the conversation, its streaming reply and any unsent text behind. People
talk to an agent while they look at the work it is doing, so the screen has to hold both at once.

## Options considered

**A conversation is a page of its own** (as before). Rejected: every link out of it leaves it, and the work it
talks about can never be beside it.

**Tabs of open conversations, or several docked at once.** Rejected: switching is rare next to reading one
conversation while working, and a strip of tabs crowds the screen for that rare case. A history list (🕘) covers it.

**A focus mode that hides the navigation.** Rejected: it hides where the person went. Expanding the conversation
over the page, dropping back to docked on any navigation, gives the room without losing the way back.

**Each page keeps its own frame and passes the conversation along.** Rejected: unmounting the frame on every
navigation drops the socket subscription and the streaming reply, and every link across hq would have to carry the
conversation.

## Decision

- **The shell is drawn once, in the app's root, above the pages.** A page publishes its breadcrumbs, bar buttons and
  phone header to it and draws only its content.
- **The shell holds one open conversation, docked beside the page.** Going anywhere changes the page, never the
  conversation; only the person opens, switches or closes it. Expanding, collapsing and the narrower widths (sliding
  over, a pill on a phone) are positions of the same mounted conversation, never a remount.
- **The address carries it as `?c=<id>`** on whatever page is shown. A conversation's own address is kept for links
  and replaced by that form at once; reached from inside hq the page stays, reached from outside the page shows the
  conversation's place.

## What this binds

- No page draws its own frame or a conversation in its content; a new page renders inside the shell.
- A feature that opens a conversation opens it in the dock, never by navigating to it.
- A conversation component may not assume it owns the screen; it reports to its surroundings through props.
- Undoing it means every page drawing a frame again and conversations becoming pages: a redesign of the whole app.

## Consequences

### Positive

- A reply keeps streaming, and unsent text survives, wherever the person goes.
- The work and the conversation about it are on screen together.

### Negative

- The page area is narrower beside the dock; wide pages have to read well at that width.
- The shell intercepts moves to a conversation's own address to keep the page in place, which every such link relies on.

### Risks

- A page that renders its own frame anyway would draw a second shell. The app-layout skill and the shell's tests
  are where that is caught.

## References

adr-0096 (a conversation belongs to a place), adr-0121 (a conversation's record is in hq), adr-0127 (a
conversation's home), adr-0129 (a place's sections in the left panel).

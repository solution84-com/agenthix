---
created: 2026-11-11
description: Every message the screens give gets a kind and one of sixteen handlers, so a dialog stops the person only when stopping them is the point — a press that failed, a question before something that cannot be undone, typed work about to be lost. Blocks 0.1.0.
---

# Kinds of error message, and a strategy for error handling

An **initiative**; it follows the pre-release fixes unit. **It blocks 0.1.0.**

The design system unit applied the rule that a message is never part of the page: whatever needs attention became a
centred dialog. In the playtest that followed, a dialog for everything proved too heavy. A passing network error on a
background read opens one, and so does an Execution Site that did not answer on the agents page. Being stopped on page
after page puts people off the product.

**The principle** (agreed 11 Nov): a dialog stops the person, so interrupt only when stopping them is the point. If the
person did not just press something, it is never a dialog — typed work about to be lost aside.

**The design** ([spec](spec.md), [ADR-0185](../../adr/adr-0185-a-dialog-only-when-stopping-the-person-is-the-point.md),
[boards](boards/kinds-and-handlers.html)): kinds of message, and sixteen handlers that say them, from the attention
dialog to no message at all — among them a quiet retry for background reads, a nudge in the page, a line in a
conversation's thread, a frame line for HQ as a whole, a notification for one thing someone should act on, and a toast
for a press that worked whose result the screen does not show. Seven questions and the toast were settled with the
owner on the boards.

**It covers** ([plan](plan.md)):

1. **A recount and a map**: every message found again in today's code and given its handler, by read-only agents and a
   mechanical search, checked by a usability reviewer.
2. **The shared pieces**: one piece per handler, the retry policy, a required kind on every message, and the design
   guard's new rules.
3. **Every message moved** to its handler, in lanes by area of the code.
4. **Verification**: a second count against the map, the usability reviewer's walk of every failure in the running app,
   then the owner's playtest.
5. **An error-handling skill** (`.agents/skills/handling-errors/`), finished from what was proved, so every later change
   follows the rule without rediscovering it.

**A usability reviewer at every gate**: a read-only agent that makes things fail on purpose and checks that nothing
stops the person who did not just press something. The last unit had only a reviewer for how screens look.

**Next:** phase 1, the recount and the map.

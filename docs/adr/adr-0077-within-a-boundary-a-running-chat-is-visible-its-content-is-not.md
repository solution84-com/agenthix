---
created: 2026-09-28
description: Within a boundary, members see that a chat is running, its agent, who started it, where it is working and since when; its content, title included, stays readable only by its owner.
---

# ADR-0077: Within a Boundary, a Running Chat Is Visible; Its Content Is Not

**Status:** Accepted

## Context

adr-0041 made a chat private to its owner so completely that another member cannot tell it exists.
Work in a boundary now runs in parallel with no locks on shared storage (adr-0075). People and agents
coordinate by seeing what is running where, and most of a project's work starts as a chat. A view that
hides chats leaves out most of what could collide.

## Options considered

- **Show only task runs, and keep chats hidden.** Rejected: it hides most of the work that shares a
  workspace, so it fails at the one job the view has.
- **Show a running chat without its agent or location.** Rejected: "someone is doing something" does
  not help anyone decide whether to wait, branch or work elsewhere.
- **Show chats in full to members.** Rejected: people put private things in their chats, and adr-0041's
  promise that nobody else reads them stands.

## Decision

**Within a boundary, its members — people, and agents through `list_active_runs` — may see that a chat
is running, which agent it is with, who started it, where it is working, and since when.** A chat in a
person's own storage is visible only to that person. An ended chat is not listed.

**A chat's content is readable only by its owner, for every role, ADMIN included**, as adr-0041
decided. Content is the session's title, its messages and transcript, its runs' input and output, its
tool calls and its live event stream. The title counts as content because it is generated from the
first message.

The facts are read from the site each time as ids and resolved to names by hq, which remains the only
place the rule is enforced.

The design is in the unit's [design spec](../work/2026-09-28-person-scoped-execution/spec.md),
section 3.

## What this binds

- **The running-now view and `list_active_runs` carry only the five facts above**, never a title or
  anything of a run's content.
- **Anything new that shows another member's chat** must stay within these facts or supersede this
  record.

Undoing it means either hiding chats from the view, which leaves it without most of the work, or
widening what others may read of a chat.

## Consequences

### Positive

- Everyone in a project can see where others are working before touching the same files.
- The content promise people rely on is unchanged.

### Negative

- A member can no longer keep secret that they are chatting with an agent in a project, or where.

### Risks

- **Where a chat is working can say something on its own.** A workspace's name may hint at what is
  being done there. Accepted, because a member can already see a project's workspaces.

## References

- adr-0041 — its Decision section (adr-0041-s-2) is superseded by this record; the rest stands
- adr-0075 — work in a boundary runs in parallel, which this visibility serves
- adr-0060 — the boundary this view is scoped to
- [Design spec — person-scoped execution](../work/2026-09-28-person-scoped-execution/spec.md)

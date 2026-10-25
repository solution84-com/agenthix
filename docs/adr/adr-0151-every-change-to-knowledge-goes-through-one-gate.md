---
created: 2026-10-25
description: Every change to a knowledge page, by an agent or a person, goes through one gate on the site that holds it, which applies the change, checks the page against one set of rules, refuses a change made over another writer's, keeps the previous version, swaps the new one in atomically and has hq record who.
---

# ADR-0151: Every Change to Knowledge Goes Through One Gate

**Date:** 2026-10-25
**Status:** Accepted

## Context

Knowledge is Markdown pages in sections that hq lists, filters and shows by their front matter, and that agents and
people both change. A page with broken front matter can't be listed; a change written over another writer's loses
theirs; a wrong change with no previous version can't be undone; and a change with no author can't be questioned.
Pruning old versions, and removing a page for good (a pasted password, a person's details), must be possible.

## Options considered

- **Free files, with git for history.** Rejected: pruning old versions, or removing something for good, means
  rewriting history, and nothing checks a change before it lands.
- **Free files, checked only when listed.** Rejected: problems are found after the fact, by whoever reads next.
- **Pages as database rows in hq.** Rejected: it moves a place's content out of the site that holds it (adr-0042,
  adr-0123's rule kept in adr-0150), and loses folders a team can lay out as it likes.
- **Files on the site, changed only through one gate, with whole earlier pages as versions (chosen).**

## Decision

**Every change to a page — an agent's write, edit or delete, and a person's save, move or restore in hq — goes through
one gate on the site that holds it**, which:

1. applies the change to the current page, refusing a write made from a version that is no longer current, and an
   edit whose passage is not found exactly once;
2. checks the result against one set of page rules, kept in `@agenthix/core` and shared with the itemiser and hq's
   editor, and refuses it with the problems in words, storing nothing;
3. keeps the previous page whole as a version, and swaps the new one in with one rename;
4. has hq record the change and who made it: a person, or an agent with the person it acted for and its conversation
   or run.

Versions are pruned by age, count and size per place; a page or a version can be deleted permanently.

## What this binds

- No code writes a knowledge page except through the gate; a new way to change knowledge calls it.
- The page rules live once, in core, and the gate, the itemiser and the editor all use them.
- Every change in hq's record names who made it.

Undoing it means changes that can land unchecked, unrecorded or over another writer's, with no version to restore.

## Consequences

### Positive

- Every change can be seen, attributed and undone, by people and by agents alike.

### Negative

- A file placed on the disk outside the gate is only found by the itemiser, listed with its problems.

### Risks

- An agent can write something wrong, or something it was tricked into, into a page. Accepted: agents writing
  knowledge when a person asks is the point; every change shows who and why, and can be undone.

## References

- adr-0150 — agents reach knowledge only through tools shaped like the native ones.
- adr-0042 — hq is the organisation's own; a place's content stays on its site.

## Implementation notes

Built by the agent knowledge unit and merged with it (2026-10-26): the site's gate applies every change under a per-page lock, checks it against core's page rules, keeps the previous page as a version, and hq records who made it; versions are pruned daily, and Recently deleted keeps a page 30 days. How it fits together: [`docs/architecture/storage-and-placement.md`](../architecture/storage-and-placement.md).

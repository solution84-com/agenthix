---
created: 2026-11-01
description: In a workspace that is a Git repository, every task and conversation works on a branch with a working copy of its own, every commit goes back to the workspace's repository, and only a merge or a restore by a person changes main. People read the work in HQ; agents write it.
---

# ADR-0168: Code Work Runs on Its Own Branch, and Only a Merge Changes Main

**Date:** 2026-11-01
**Status:** Accepted

## Context

Agents change code in a workspace while people are reading it, other agents are changing it, and an app may be running
from it. Earlier, a workspace had one working folder: every run on it worked there, so two runs could not work on it
at once without a lock, and nothing showed what any one of them had changed. A design that locked the whole workspace
while work ran was built and walked; the lock, and the waiting it caused, were the hardest part of it to use.

Developers already have an answer to this: one branch per piece of work, reviewed and merged. The question was how
much of Git to put in front of people, and how to keep agents from changing the line everyone else relies on.

## Options considered

- **One shared working folder with a lock.** Rejected: only one piece of work at a time per workspace, and a person
  waits for an agent they did not start.
- **A shared draft line, with every change a version and a separate publish step** (as some app builders do).
  Rejected: once the draft held only finished pieces it duplicated `main`, and power users still needed branches.
- **Branches in Git worktrees.** Rejected: a worktree shares the repository's settings and hooks, so an agent could
  plant a hook that runs for others.
- **Branches brought back only when the work ends.** Rejected: Git, HQ and GitHub would disagree about a branch for
  the whole of its life.
- **People editing files in HQ.** Rejected for now: editing without formatting, type checking or compiler warnings is
  not something developers choose; their own editor may connect later.

## Decision

**In a workspace that is a Git repository, every task and every conversation works on a branch of its own, with a
working copy of its own (a local clone of the workspace's repository).** The system decides that a workspace is a
code workspace from its folder, never an agent.

- **Every commit goes back to the workspace's repository**, so a branch is a real branch there.
- **The workspace's own folder stays on `main`, and agents cannot write it.** `main` changes only when a person merges
  a branch into it, as one squashed version, or restores an earlier version as a new one. An agent merges only when a
  person tells it to, and as that person.
- **`main` is never rewritten.** An agent may rewrite its own branch's history when a person asks, keeping a backup
  first.
- **People read and agents write.** HQ shows a workspace's branches, files, changes and versions; it edits no file.

## What this binds

- Dispatch gives code work its branch's copy as its working folder, and binds the workspace's own folder read-only.
- Every Git command the site runs on a copy runs where the copy's own hooks and settings cannot act.
- Nothing in HQ or a site writes `main` except a merge or a restore a person started.
- Anything that shows or runs code work (the workspace view, a live preview) works on a branch, not on a shared
  working folder.

Undoing it means bringing back one shared working folder and a way to keep runs on it from colliding.

## Consequences

### Positive

- Any number of tasks and conversations work on one workspace at once.
- `main` holds only finished work, one version per piece, and any version can be restored.
- Developers meet the model they know: branches, with one working copy each.

### Negative

- Each branch's copy takes disk on the site, and dependencies are installed once per copy.
- Work that two branches change in the same place clashes at merge, and an agent has to bring its branch up to date.

### Risks

- A run can write another branch's copy in the same project, as it can write the project's other files today
  (adr-0079). Accepted: a copy is the agent's own work area, and nothing reaches `main` without a person's merge.

## References

adr-0039 (files and workspaces), adr-0079 (access to a boundary is access to all of it), adr-0074 (a container is
keyed on its boundary and its runner), adr-0030 (task-scoped agent sessions), adr-0167 (Agenthix acts only on machines
the organisation runs).

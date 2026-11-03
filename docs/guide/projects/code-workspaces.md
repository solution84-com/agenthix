---
title: Code workspaces and branches
description: Turn Git on for a workspace, let each piece of work have a branch and a working copy of its own, review it in the full-screen workspace view, and merge it into main.
sidebar:
  order: 10
---

A workspace with Git is a **code workspace**. Agents never change its files in place: each piece of work happens on a
**branch** with a working copy of its own, you review the branch, and **Merge into main** brings it in as one **version**.
Nothing reaches `main` without a person pressing a button.

The examples use Mia, a Member of the Fernhill Shop project, who works with Ada, a teammate, and with the agent **Kernel**
on a workspace called `shop-app`.

## Terms

- **`main`**: the branch the workspace's own folder is on. It only moves forward, by a merge or a restore.
- **Version**: one commit on `main`, numbered from the first (*v1*, *v2*, …). Each is one finished piece of work.
- **Branch**: a Git branch with a working copy of its own, a separate folder checked out on that branch. Developers know the
  arrangement as one worktree per branch.
- **Ahead and behind**: how many commits a branch has that `main` lacks, and the reverse.

## Turn Git on

A workspace that is a Git repository, including one connected to GitHub, is already a code workspace. For any other, open it
and select **Turn Git on**.

The confirmation says what happens first: *shop-app isn't a Git repository yet. Turning Git on keeps its files as they are
and records them as the first version. From then on agents work on branches, and changes reach the files by merging.*

- The first version is recorded as you.
- When the workspace has no `.gitignore`, a standard one for build and dependency folders (`node_modules`, `dist`, `build`,
  `.venv`, `__pycache__`, `.DS_Store`) is added.
- Files over 50 MB are left out of the first version and named in the confirmation. They stay on disk, and the view says
  they are not tracked.
- Work already under way carries on to the end of its current run; its next run is code work.
- There is no turning Git off, because every open branch would have nowhere to go back to.

## Branches and their working copies

Work is code work when its workspace is a code workspace. Nobody is asked, and the agent does not decide.

- **A conversation** started in a code workspace, from the workspace view or with that workspace as where it works.
- **A task** with a **workspace** set to a code workspace. Choose the workspace on the task's form. When the lead agent makes
  a task or starts a worker, it names the workspace.

The first time the work runs, HQ makes a branch named from the task's title or from what you first asked, in lowercase words
joined by hyphens: *Add a login page* becomes `add-login-page` (`add-login-page-2` if that is taken). A Member or Admin can
rename a branch.

- **Each branch has its own working copy.** The agent changes files there, not in the workspace's own folder, which agents can
  read but not write. Switching between branches is instant, and a branch's agent keeps working when you look at another.
- **Only what Git tracks is in a copy.** Ignored files such as `node_modules` and `.env` are not, so dependencies are
  installed again in the copy.
- **The agent commits as it works**, and each commit goes back to the workspace's repository, so the branch there is always
  the real one. When a run ends, anything left uncommitted is committed as *Work in progress*.
- **A follow-up** (the task again, or your next message) works in the same copy on the same branch.
- **Agents know about each other's branches.** A run is told its own branch and how far behind `main` it is, and which other
  branches exist and who they belong to, so Kernel can say *Ada's branch already changes the login form* before it repeats the
  work.
- **An agent can do more with Git than the view shows.** Ask it to squash, tidy or reword commits, or bring `main` in. It never
  rewrites `main`, and it keeps a `backup/…` branch before it rewrites a branch.

A copy is removed when its branch is merged and no agent works on it, or when its task is done or archived or its conversation
archived. The branch itself stays until it is merged or deleted, and reopening the work makes a fresh copy. A Member or Admin
can delete an unmerged branch whose work is over from its line in the branch select; the confirmation says how many commits
are lost.

Copies take disk. Fleet admins see how much on the site's page in the Fleet Console and are told when the machine's disk is 80%
used.

## The workspace view

Open a code workspace under **Files** > **Workspaces** and it takes the whole screen. HQ's navigation is hidden, and the view
has an address of its own, so you can share a link to it.

- **Top bar.** **‹ Fernhill Shop** goes back to the project. **shop-app ▾** switches to another of the project's workspaces.
- **The branch select**, top left, sets the branch for everything else in the view. It lists `main` first, then each branch with
  its name, whose work it is, what is working on it (*Kernel is working here*) and how far ahead of and behind `main` it is.
  There is no *New branch*: a conversation or task on the workspace makes its own.
- **Files**: the branch's folder tree. A file the branch added, changed or deleted is marked, and selecting a file opens it in
  the middle.
- **Git**, for the chosen branch: whose it is, *6 ahead of main*, **Changes (N)**, **Merge into main…**, and its commits. Select
  a changed file to see its changes in the middle.
- **The middle** shows one thing at a time: a file, or a file's changes.
- **The conversation**, on the right, is with the agent working on this branch, scrolled to its end. A task's branch shows the
  task's thread, and a message you write there goes to it, for the task's agent to read at its next run; a task with no thread
  yet offers the box that starts one. A conversation's branch shows that conversation. `main` has none, and offers **New conversation**, which starts
  one on a new branch.

**Nothing here edits a file.** You change code by telling the agent, or with your own tools through Git.

Live previews, which will run the branch's app in the middle, are not available yet: see [Live previews](live-previews.md).

### Narrow screens

| Width | What changes |
|---|---|
| Above about 1280 px | All three columns |
| About 900 to 1280 px | The left panel folds to a strip with the branch, **Files** and **Git**. Choosing one opens its panel over the middle |
| Below about 900 px | The conversation becomes a drawer from the right, opened by a button in the top bar that shows the agent's state, such as *Kernel is working* |
| A phone | One thing at a time. The conversation is the main view, and a switch at the bottom moves between **Conversation**, **Files** and **Git**, with a dot on **Conversation** while the agent works |

## Merge into main

Any Member or Admin can merge any branch. Select **Merge into main…** in **Git**.

1. The dialog lists the changed files and a summary prefilled from the work, such as *Kernel for Mia · Login page*, which you
   can edit. It says *goes in as one version: v15*.
2. Select **Merge**.

The branch's changes go in as **one version** on `main`, with the summary as its message, however many commits the branch has.
When the workspace is connected to GitHub, `main` is pushed too, and a version someone else pushes to GitHub arrives as a new
version. A team that uses pull requests can ask the agent to push the branch and open one; merging there is GitHub's.

**A checkpoint while an agent works.** You can merge a branch Kernel is still working on. The dialog says *Kernel is still
working on this branch. This merges what it has committed so far; it keeps working.* The agent is not stopped and the branch
stays open. The next merge brings in only what came after, and the two do not clash with each other.

**Clashes.** If `main` changed the same lines, nothing is merged. The dialog names the files that clash and the version of
`main` that changed them. HQ asks the branch's agent, on your behalf, to bring the branch up to date with `main`, and the
conversation tells you when it is ready to merge. For a task, the task runs again, even one waiting for an approval: the
request replaces it, as **Run** does. The agent brings `main` in with its `update_from_main` tool, resolves the clashing
files, and commits.

**An agent asking you to confirm.** An agent merges only when you tell it to in the conversation. Its request shows as a card
in the conversation, *Kernel will merge add-login-page into main as one version*, with **Merge** and **Not now**. The merge
happens when you press **Merge**, as you. Because HQ cannot tell from an agent's words whether you asked, your press is the
check.

**After a merge**, when no agent is working on the branch, it closes: its copy is removed and its conversation or task says it
was merged. When an agent is still working, the branch stays as it is.

There are no line comments, required approvals or checks before a merge. A team that wants them connects GitHub and uses pull
requests.

## main's versions, and Restore

Choose `main` in the branch select, and **Git** lists its versions, newest first: number, summary, who merged it, how many
files, and when.

Select **Restore** on a version (a Member or Admin can) to make a **new** version whose files are exactly those of the one
restored, such as *v16 · Restored version 12*. Nothing is deleted from the history, so you can undo a restore by restoring
again.

## Deploy…

Agenthix does not host your apps; **Merge into main** is where its job ends. With `main` chosen, **Git** has a quiet
**Deploy…**. It lists the place's workflows that are on and approved, and runs the one you choose on this workspace, whose
folder is `main`; one that takes parameters asks for them first, and **See the run** opens the run. These are workflows your
organisation has approved, which hold the secrets for its servers, or GitHub Actions when the workspace is connected to GitHub. See
[Workflows](../workflows/workflows.md) and [Connect GitHub](../workflows/connect-github.md).

## What a Viewer sees

A Viewer sees everything in the view: files, Git, changes, versions and the conversation. A Viewer cannot merge, restore, deploy,
turn Git on, or message the branch's agent. Members and Admins can. A person's own workspaces follow the same rules for their
owner.

## Where next

- [Files, workspaces and previews](files-and-previews.md): the workspaces list and **Git at a glance** on a workspace's page.
- [Follow what agents are doing](runs-and-approvals.md): runs and approvals.

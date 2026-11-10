---
title: Code workspaces and branches
description: Turn Git on for a workspace, let each piece of work have a branch and a working copy of its own, review it in the workspace view, and merge it into main.
sidebar:
  order: 10
---

A workspace with Git is a **code workspace**. Agents never change its files in place: each piece of work happens on a
**branch** with a working copy of its own, you review the branch, and **Merge into main** brings it in as one **version**.
Nothing reaches `main` without a person pressing a button.

The examples use Mia, a Member of the Fernhill Shop project, who works with Ada, a teammate, and with the agent **Kernel**
on a workspace called `shop-app`.

## Terms

- **`main`**: the branch the workspace's own folder is on. It only moves forward, by a merge or by returning it to an earlier version.
- **Version**: one commit on `main`, numbered from the first (*v1*, *v2*, …). Each is one finished piece of work.
- **Branch**: a Git branch with a working copy of its own, a separate folder checked out on that branch. Developers know the
  arrangement as one worktree per branch.
- **Ahead and behind**: how many commits a branch has that `main` lacks, and the reverse.

## Turn Git on

A workspace that is a Git repository, including one connected to GitHub, is already a code workspace. For any other, open it
in the workspace view and select **Keep versions with Git…**, top right. It is the one button the view offers a workspace
without Git, and only a Member or Admin sees it.

The confirmation, **Keep versions of this workspace with Git**, opens with a note: **This can't be undone.** Once Git is on
for a workspace, it stays on. Then it says what you get and what changes in the folder:

- Each agent works on its own branch; you review the changes and merge them into main. Every merge is a version you can look
  back at or return to, and tasks can run here.
- `main` is protected: it changes only by merging a branch.
- When the workspace has no `.gitignore`, one is added, listing files Git should not keep.
- Files over 50 MB are left out of the first version and stay in the folder.

Its button names the workspace, **Turn on Git for shop-app**, so it does not read like the button that opened it. Afterwards
a short note stays at the top until you select **Got it**: *Git is on.*, or *Git is on. A .gitignore was added.*, followed by
the names of any files left out for their size.

- The first version is recorded as you.
- Work already under way carries on to the end of its current run; its next run is code work.

## Branches and their working copies

Work is code work when its workspace is a code workspace. Nobody is asked, and the agent does not decide.

- **A conversation**, any of yours: in a project, or in Your space. Ask the agent to change a code workspace that the
  conversation's place holds ("in shop-app, add a login page") and it starts the work in that workspace. A workspace of
  another place is not one it can change from here. The conversation gets one branch in each workspace its work changes,
  and most conversations have none.
- **A task** with a **workspace** set to a code workspace. Choose the workspace on the task's form, or ask the agent to make
  the task; it names the workspace.

Only someone who may work in the workspace's project gets a branch: a Viewer's ask is refused, and nothing is made. A branch
has one chat: its task's conversation, or the conversation it came from. To change another conversation's or task's branch,
ask in that branch's own chat; the agent tells you whose branch it is.

The first time the work runs, HQ makes a branch named from the task's title or from what you first asked, in lowercase words
joined by hyphens: *Add a login page* becomes `add-login-page` (`add-login-page-2` if that is taken).

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
archived. The branch itself stays until it is merged, and reopening the work makes a fresh copy.

Copies take disk. Fleet admins see how much on the site's page in the Fleet Console and are told when the machine's disk is 80%
used.

## The workspace view

Open a code workspace under **Files** > **Workspaces** and it fills the screen beside HQ's navigation rail, as every page does. The project's own menu does not show there, since the
breadcrumb names the project. The view has an address of its own, so you can share it. The address holds the branch, or the older version of `main`, and the file or
change you are looking at.

### The top bar

The top bar is a breadcrumb that says where you are, with the next step and **About** on the right:

**‹ Fernhill Shop** / **shop-app ▾** / **login-page ▾** / **💬 Chat**

- **‹ Fernhill Shop** goes back to the project.
- **shop-app ▾** lists the place's workspaces, the most recently opened first, to switch to another.
- **The branch menu** sets the branch for everything else in the view. It lists `main` first, marked *Protected · version 14*,
  then one entry for each branch: its name, *from* the conversation or task it came from, then whose it is (*You*, or the person's name), what is working on it (*Kernel working*), how many files it changes, and *3 behind main* when it is behind. Selecting
  the *from* name opens that chat. There is no *New branch*: a conversation or task whose work changes the workspace makes
  its own. A Viewer sees a line saying merging and bringing a branch up to date need a Member or Admin of the project.
- **💬 Chat** is there on a branch and opens the branch's own chat in HQ's chat panel: the conversation it came from, or its
  task's conversation, which is started in the panel if the task has none yet. `main` has no chat of its own; to change the
  workspace, ask in any conversation.
- **main's version menu** is there instead of **💬 Chat** when `main` is chosen. See below.
- **About** opens the workspace's details: see below.

### The next step

One button at the top right, beside **About**, offers what comes next for where you are. Only a Member or Admin sees it.

| Where you are | The button |
|---|---|
| A workspace without Git | **Keep versions with Git…** |
| A branch that has caught up with `main` | **Merge into main…** |
| A branch that is behind `main`, or whose last merge clashed | **Bring up to date**. Hover over it to read why: *main has 3 newer versions. Kernel brings them into this branch, then you can merge.* |
| A branch whose agent was asked to bring it up to date | **Updating…**, switched off until the agent that started on it stops, and a spinner beside the branch's name |
| An older version of `main` | **Back to latest** and **Return main to v12…** |
| `main` at its latest version | None |

A Viewer gets no next step, except **Back to latest** when reading an older version. **Bring up to date** asks the branch's
own agent: see [Merge into main](#merge-into-main).

### main's versions

With `main` chosen, the breadcrumb ends in a version menu, such as **v14 · latest**. It lists `main`'s versions, newest first:
number, summary, who merged it and when, with **All 14 versions…** at the foot for the older ones. Choose one and the whole
view reads `main` as it was then, **read-only**: the menu is highlighted, the address says `version=v13`, and nothing there
can be changed.

- The file tree shows the files as they were at that version, and marks that version's own changes against the one before it.
  **Only changed in v13 · 4** narrows the tree to them.
- A file opens with a line above it, *README.md as it was at v13 · read-only*. A file that version changed opens whole with its
  changes in place, as on a branch.
- **Back to latest** returns to the newest version.
- **Return main to v13…** (a Member or Admin can) opens a confirmation, **Return main to v13**: *main gets a new version with
  exactly the files of version 13. Nothing is deleted from the history.* Select **Make v13 main again**. The new version is
  summarised *Restored version 13*, and you can undo it the same way. When `main` already has exactly those files, it says so
  and changes nothing; when `main` moved while the dialog was open, it asks you to look again.

### Files and changes, as one tree

On the left is one file tree for the branch (or the version) in view: tracked files only, folders first. There is no separate
list of changes.

- **Open a file…** above the tree finds a file by name.
- A file the branch added, changed, deleted or renamed carries a small mark, with its meaning on hover. A deleted file stays
  listed where it was, struck through, and opens like any other. A folder that holds a change has a dot and starts open.
- **Only changed · 3** beside the **Files** heading narrows the same tree to the changed files and the folders holding them. It
  is there only while there are changes.
- The view opens on a file: the branch's first changed file, otherwise the top folder's README, otherwise its first file. On a
  phone the tree comes first.

### A file, and a changed file

Selecting a file opens it in the middle. A changed file opens **whole, with its changes in place**: every line, the removed
lines marked with a minus and the added lines with a plus, and the line numbers beside them. The header says what happened,
*changed on this branch* or *new in v12*, and has:

- **↑** and **↓** to step between the changes, with *1 of 3 changes* beside them;
- **Whole file** and **Changes only**, which folds the lines that did not change.

A file the branch did not change opens in the same view as any file in HQ, read at the commit in view: the branch's latest,
`main`'s, or the older version of `main` you are on. It has the same header (with **Download**), the same previews, the same
limits for big files and the same words when it can't be shown: see [Open and download files](open-and-download-files.md).
A file that is not on that branch or version says *It isn't on login-page.* A site that has not been upgraded to the newest
release can't show a file at an older commit, and says an admin can upgrade it. **Nothing here edits a file.** You change
code by telling the agent, or with your own tools through Git.

### The chat

The chat is HQ's own chat panel, on the right. Browsing the view never changes what it shows; only **💬 Chat** on a branch
does.

### About

**About** opens a dialog headed *About shop-app*. It says where the branch in view came from and how far it is from `main`, or
that `main` is protected and changes only by merging a branch. It holds **Deploy…** (see [Deploy…](#deploy)) and a **Repository,
site and tools** entry, which goes to the workspace's settings in its place.

Live previews, which run the branch's app in the middle, are described in [Live previews](live-previews.md).

### Narrow screens

The view follows the window's width. The chat panel is HQ's, so it follows the width too.

| Width | What changes |
|---|---|
| 1280 px and wider | The file tree on the left, the middle, and the chat panel docked beside them on the right |
| 768 to 1279 px | The same view, with the labels kept. The chat panel opens over the view from the right instead of beside it |
| Below 768 px (a phone) | One thing at a time, described below |

On a phone:

- The title is the workspace, with the branch under it (or `main` and its version, marked *read-only* on an older one).
  Selecting that line opens a sheet of branches, or of `main`'s versions with **Switch branch…** at the foot.
- **‹** goes back to the project, 💬 opens the chat, and **⋮** opens **Open this branch's chat** (on a branch), **Switch
  workspace**, **About this workspace**, and then your account menu, **Manage** (for organisation admins), **Runs** and
  **Notifications**.
- The file tree is full width. A file opens on its own screen with a back arrow, and a changed file has **Previous change**
  and **Next change** at its foot.
- The next step is a button at the foot of the screen, full width.

### A workspace that can't be opened

When a workspace cannot be shown, the page says why, who can fix it, and a way back, instead of loading for ever:

- **You can't open this workspace**: you are not a member of its project. It names the project when you may see that it exists,
  says to ask an admin of the project to add you, and has **Copy this link**.
- **This workspace isn't here any more**: it may have been deleted or moved.
- **This workspace can't be shown right now**: its branches could not be read. The page says what went wrong.

## Merge into main

Any Member or Admin can merge any branch. Choose the branch, then select **Merge into main…**, the next step at the top right
(at the foot on a phone).

1. The dialog, **Merge login-page into main**, lists the changed files under **Goes in** and a **Summary** prefilled from the
   work, such as *Kernel for Mia · Login page*, which you can edit. It says the branch *goes into main as one version, version 15*.
2. Select **Merge login-page into main**.

The branch's changes go in as **one version** on `main`, with the summary as its message, however many commits the branch has.
When the workspace is connected to GitHub, `main` is pushed too, and a version someone else pushes to GitHub arrives as a new
version. A team that uses pull requests can ask the agent to push the branch and open one; merging there is GitHub's.

**A checkpoint while an agent works.** You can merge a branch Kernel is still working on. The dialog says *Kernel is still
working on this branch. This merges what it has committed so far; it keeps working.* The agent is not stopped and the branch
stays open. The next merge brings in only what came after, and the two do not clash with each other.

**Clashes.** If `main` changed the same lines, nothing is merged. The dialog says *Nothing was merged*, names the clashing
files, and ends with two buttons: **Not now** and **Bring up to date**. From then on the next step at the top right is
**Bring up to date** too, and it is also what you see on any branch that is behind `main`. Selecting it asks the branch's agent,
on your behalf, to bring `main` into the branch; the button reads **Updating…** while the agent works, and the conversation
tells you when the branch is ready to merge. For a conversation, the ask is a message from you in it; for a task, a comment
from you, and the task runs again, even one waiting for an approval. The agent brings `main` in with its `update_from_main`
tool, resolves the clashing files, and commits. If the agent could not be asked, a line under the top bar says so and nothing
was changed.

**An agent asking you to confirm.** An agent merges only when you tell it to in the conversation. Its request shows as a card
in the conversation, *Kernel will merge add-login-page into main as one version*, with **Merge** and **Not now**. The merge
happens when you press **Merge**, as you. Because HQ cannot tell from an agent's words whether you asked, your press is the
check.

**After a merge**, when no agent is working on the branch, it closes: its copy is removed and its conversation or task says it
was merged. When an agent is still working, the branch stays as it is.

There are no line comments, required approvals or checks before a merge. A team that wants them connects GitHub and uses pull
requests.

## Deploy…

Agenthix does not host your apps; **Merge into main** is where its job ends. **Deploy…** lives in **About**, in the top bar,
whichever branch is chosen. Select **About**, then **Deploy…**. It lists the place's workflows that are on and approved, each
with a **Run** button that runs it on this workspace, whose folder is `main`; one that takes parameters asks for them first, and
**See the run** opens the run. The live preview's own workflows are left out: they run from the live preview. With none left,
it says no deploy workflow is set up and how to add one: ask an agent in a conversation to write a workflow that deploys
`main`; once a person approves it, **Deploy…** runs it from here. These are workflows your organisation has approved, which hold
the secrets for its servers, or GitHub Actions when the workspace is connected to GitHub. See
[Workflows](../workflows/workflows.md) and [Connect GitHub](../workflows/connect-github.md).

## What a Viewer sees

A Viewer sees everything in the view: files, changes, versions, the branch menu and **About**. A Viewer gets no next step
(except **Back to latest** on an older version), cannot return `main` to a version, and can only read the **Deploy…** list, whose
**Run** buttons are switched off with the reason on hover: *You can read everything here. Merging, restoring and talking to the
agent need a Member or Admin of the project.* Members and Admins can do all of it. A person's own workspaces follow the same
rules for their owner.

## Where next

- [Files, workspaces and previews](files-and-previews.md): the workspaces list and **Git at a glance** on a workspace's page.
- [Follow what agents are doing](runs-and-approvals.md): runs and approvals.

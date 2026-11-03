---
title: Files, workspaces and previews
description: Read what a project keeps, back it up to GitHub, and open the apps agents build in its workspaces.
sidebar:
  order: 4
---

A project keeps its files on its **Execution Site**, the machine that runs its agents. Four tools under **Files** in a project show them: **Files**, **Artefacts**, **Knowledge** and **Workspaces**. Everyone in the project can read all four, viewers included, and every agent that runs in the project works with the whole of it. To keep something from other people or from agents, keep it in your own space in **Chat**, or in a project they aren't part of.

## Files

**Files** holds the project's documents, newest first. Search by name, open a folder, or select a file to read it. A wide panel shows the folders beside the open file.

Agents write the files; you read them. If a project has none, **Files** says so and suggests asking an agent to write one, for example "put this in specs". A file opens in place, and **Download** saves it: see [Open and download files](open-and-download-files.md). **Mention** puts the file into the message you are writing, and the **⋯** menu has **Copy link**, **Copy path** and **Open full screen**. Files attached to one task are on that task, under **Attachments**; the files its runs wrote are under **Working files**: see [A task's files](task-files.md).

If the project's files are a git repository, the git line above them, described under [Git at a glance](#git-at-a-glance) below, says where it stands.

### Back it up to GitHub

The first line of **Files** says where the project is backed up: **Backed up to** a repository, or **Not backed up**.

1. Select **Back up to GitHub**. It opens the same steps as connecting a workspace.
2. Choose **A new repository** or **An existing repository**, the GitHub account and the name, then select **Create and connect** or **Connect**. A new repository is private, with the project's files pushed to it.
3. Select **Manage** later to see it, or to **Disconnect**.

Only a project administrator can back a project up or disconnect one. Connecting needs the GitHub App set up and an account allowed for the project: see [Connect GitHub](../workflows/connect-github.md). Once connected, agents push and open pull requests through workflows that a person approves once.

## Artefacts

**Artefacts** are the throwaway things agents made for you in conversations, newest first under **Today**, **This week** and **Older**. They open in the same view as a file. To keep one, ask an agent to move it into **Files**.

## Knowledge

**Knowledge** is what the project shares: its processes, decisions and reference, as pages in sections. Agents search it when they need it and change a page only when you ask. Nothing here is read on every run. See [Knowledge](knowledge.md) for finding, writing, restoring and who may change a page.

## Workspaces

A **workspace** is a codebase agents build in. It can be empty or come from a GitHub repository, and a conversation in the project can work in any of them.

![Workspaces, with a codebase that has a repository and one that has none yet](screenshot:project-workspaces)

### Make one

1. Open **Workspaces** and select **New**.
2. Give it a **Name**, such as `docs-site`.
3. Under **Start from**, choose **A GitHub repository**, and type its **Repository address**, or **Empty**, to connect one later.
4. Select **Create**.

Or ask in a conversation: "set up a docs site in a new workspace".

### Open one

Each card shows the workspace's name, its repository and its site. If it has no repository, **Connect GitHub** is on the card. Select a card to open it as a file explorer. At the top:

- **About** shows its repository and site, **Tools agents may use** (**Change** to narrow them), and, once a repository is connected, the **Workflows that reach GitHub**, the **GitHub workflows in the repository** and the **Secrets on GitHub**. See [Connect GitHub](../workflows/connect-github.md#what-a-connected-workspace-shows).

The **⋯** menu has **Delete workspace**. The repository isn't affected.

A file in a workspace opens in the same view as any other file: see [Open and download files](open-and-download-files.md).

### Git at a glance

For branches, merging into main and the full-screen workspace view of a workspace with Git, see [Code workspaces and branches](code-workspaces.md).

If the workspace is a git repository, one line above its files says where it stands, read when you open it and again when
you return to the page:

- **⎇ main · ✓ No changes · Last commit `a41f2c9` "Add Q3 chart page" by Kernel, 12 min ago**: the branch, whether anything is
  uncommitted, and the last commit with its short id, first line, author and how long ago.
- **● 3 changed** in place of **✓ No changes**: three files differ from the last commit.
- **● 12 new files · No commits yet**: the repository has no commits.
- **⚠ Merge in progress** or **⚠ Rebase in progress**: an agent left one unfinished.
- **detached at** and a commit id, when no branch is checked out.

The line only reports: it has nothing to select, and Agenthix never commits, fetches or pushes on its own. A folder that isn't
a git repository has no line, and neither does one whose machine isn't answering. This is separate from **Backed up to**, which
is about GitHub.

## Live previews

**Live previews are not available yet.** When they are, an agent can run the app it is building so you see it working beside the conversation. A live preview belongs to a branch of a
code workspace, or to `main`, and opens from **Live preview** in the workspace view. See [Live previews](live-previews.md) for
opening one, working with the agent while it runs, services, install scripts, secrets and who may do what.

An install reached only by a network address has no live previews, because each app needs an address of its own. See
[Live previews](../running-agenthix/domain-and-https.md#live-previews).

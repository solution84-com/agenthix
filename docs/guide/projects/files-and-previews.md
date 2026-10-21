---
title: Files, workspaces and previews
description: Read what a project keeps, back it up to GitHub, and open the apps agents build in its workspaces.
sidebar:
  order: 4
---

A project keeps its files on its **Execution Site**, the machine that runs its agents. Four tools under **Files** in a project show them: **Files**, **Artefacts**, **Knowledge** and **Workspaces**. Everyone in the project can read all four, viewers included, and every agent that runs in the project works with the whole of it. To keep something from other people or from agents, keep it in your own space in **Chat**, or in a project they aren't part of.

## Files

**Files** holds the project's documents, newest first. Search by name, open a folder, or select a file to read it. A wide panel shows the folders beside the open file.

Agents write the files; you read them. If a project has none, **Files** says so and suggests asking an agent to write one, for example "put this in specs". On an open file, **Mention** puts a reference to it into the message you are writing, and the **⋯** menu offers **Download** and **Copy path**. Files attached to one task are on that task, under **Files**.

### Back it up to GitHub

The first line of **Files** says where the project is backed up: **Backed up to** a repository, or **Not backed up**.

1. Select **Back up to GitHub**.
2. Check the **repo name**, then select **Back up to GitHub** again. It makes a private repository and pushes the project's files to it.
3. Select **Manage** later to see it, or to **Disconnect**.

Only a project administrator can back a project up, link a repository or disconnect one.

If a repository of that name already exists, Agenthix offers **Connect & push my files up**. It only adds files; it never overwrites or deletes anything, and if there is a clash it declines and changes nothing. To use a repository you already have, select **Link existing repo**, enter its address and select **Link repo**. This is offered only while the project has no files, because linking would overwrite them. Once connected, agents mount the repository and push to it during runs. Both need the GitHub App set up first: see [GitHub](../your-tools/github.md).

## Artefacts

**Artefacts** are the throwaway things agents made for you in conversations, newest first under **Today**, **This week** and **Older**. They open in the same viewer as a file. To keep one, ask an agent to move it into **Files**.

## Knowledge

**Knowledge** is what the project knows, filed by topic. Agents look things up here when they need to and add what they learn. Nothing here is read on every run. Search it, or filter by **Tag**. Select a topic to read it.

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

Each card shows the workspace's name, its repository and its site. If it has no repository and no preview running, **Connect GitHub** is on the card. Select a card to open it as a file explorer. At the top:

- **Open preview** appears while a preview is running.
- **About** shows its repository, preview and site, **Tools agents may use** (**Change** to narrow them), its **GitHub runs** with **Run a workflow ▾**, and its **GitHub secrets**.

The **⋯** menu has **Delete workspace**. The repository isn't affected.

## Previews

An agent can run the app it is building and show it to you as a **preview**. While one runs, its workspace's card says **Preview running** with **Open preview**. It opens in a new tab at an address of its own.

Anyone who can open the project's files can open its previews, once signed in. A preview ends after a while. Ask the agent to start it again.

An install made with `agenthix install` has previews off, so an agent's request for one is refused. See [Live previews](../running-agenthix/domain-and-https.md#live-previews).

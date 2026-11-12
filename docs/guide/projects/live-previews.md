---
title: Live previews
description: See the app an agent is building running beside the conversation, and work with it while the agent keeps changing the code.
sidebar:
  order: 11
---

> **Live previews are not available yet.** Nothing on this page can be done today: the **Live preview** entry in the
> workspace view is not shown, Kernel does not offer one, and the agent has no tools to run an app. Code work on
> branches, merging and restoring a version work as described in [Code workspaces and branches](code-workspaces.md).
> This page describes what live previews will do.

A **live preview** runs the app a branch is building, in a container of its own on an **Execution Site** (the machine
that runs agents), and shows it in the middle of the [workspace view](code-workspaces.md#the-workspace-view). The agent
keeps working on the same branch, so a change it saves reaches the running app at once.

The examples use Mia, a Member of the Fernhill Shop project, who works with Ada, a teammate, and with the agent **Kernel**
on a workspace called `shop-app`.

A live preview needs a **code workspace** (one with Git: see [Code workspaces and branches](code-workspaces.md)), and an
**HQ** that has a domain name. HQ is your organisation's home in Agenthix. An HQ reached only by a network address, such
as `http://192.168.1.20`, says *Live previews need a domain* where the button would be, because each app needs an address
of its own: see [Address and front door](../running-agenthix/domain-and-https.md#live-previews).

## Open one

1. Open the workspace under **Files** > **Workspaces**, and choose a branch in the branch select, or `main`.
2. Choose **Live preview** in the left panel.
3. Select **Start live preview**.

The panel before it starts says where it will run, such as *Runs on preview-box · 2 of 6 open*, the machine and how many
of its live previews are open. If the workspace isn't a Git repository yet, the button reads **Turn Git on and start**:
Git is turned on first, with the files kept as they are, and then the live preview starts.

![Live preview chosen on a branch with none running: it would run on office-server, 2 of 6 open, with a Site choice and Start live preview](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/live-preview-start.png)

Or ask Kernel for the app in a conversation. When you ask to see it, Kernel's reply can hold a **Live preview** card
for the branch; select it to start the live preview and open it. Kernel only offers: it never starts one by itself.

- **One live preview per branch.** If Ada chooses **Live preview** on a branch Mia already started, Ada sees the same one.
- **`main` can have one too.** It runs from a copy of its own, made from `main` when it starts and brought up to date when
  `main` moves, because the workspace's own folder is read-only and an app writes build output.
- **A copy has to exist.** A branch the agent hasn't worked on yet has no working copy. The panel says to send its agent a
  message, which makes one.

### Who may do what

| | Viewer | Member | Admin |
|---|---|---|---|
| See a live preview and open its apps | Yes | Yes | Yes |
| Start, resume, reload, switch **Auto** | | Yes | Yes |
| Answer a question (a service, a package) | | Yes | Yes |
| Stop one | | The one they started | Any in the project |

A fleet admin can also stop any live preview from the Fleet Console, and decides which sites run them: see
[Live previews on a site](../running-agenthix/live-previews-on-a-site.md).

## The app

The live preview takes the middle of the screen, the left panel narrows to a strip, and the conversation stays on the right.
It is never covered. On a tablet the conversation's drawer opens below the live preview's bar.

![A running live preview of the About page: the bar with Running, Reload, the app's address, New tab and Auto, the app in the middle, the strip on the left and the conversation with Writer on the right](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/live-preview.png)

**The bar** stays at the top of the area and never scrolls away:

- its state: **Starting**, **Running**, **Paused** or **Stopped**;
- **Reload**, which opens the app again from its first page;
- the app's address, and **New tab**, which opens the app on its own in a new tab;
- **Auto**, which reloads the app by itself when the branch gets new commits. Many development servers already reload
  themselves when a file changes, and that works as usual;
- the site it runs on and how full it is, such as *preview-box · 2 of 6 open*, and who started it;
- **Resume**, only when the guard paused it (see [States](#states)), and **Stop**.

On a phone the bar shows the state and the address, and the *Live preview* tab replaces the middle.

**The strip** shows what is in the live preview:

- **Apps**: choose which one the middle shows. An app that did not start says so, with its last lines of output, which the
  agent also sees and usually fixes. **Stop** and **Restart** act on the chosen app; the live preview keeps running.
- **Start**, for each app that has run on this branch and is not running now, with the command it last ran with. On
  `main`'s live preview, it offers each app that ran on any branch of the workspace.
  When you start a live preview, the app that ran last on its branch starts with it. Until an app runs, the middle says
  that none is running yet and how to start one.
- **Services**, with their state: *Waiting for a yes*, *Starting*, *Running*, *Stopped* or *Failed*.
- **Questions** that wait for a yes: see [Services](#services) and [Install scripts](#install-scripts).
- **Start with secrets** and **Reload with secrets**, when the project has those workflows: see [Secrets](#secrets).

![The strip waiting for a yes: the service postgres with Start it, and a package whose install script was blocked, with Allow](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/live-preview-question.png)

### How the agent runs the app

The agent starts and stops apps with its own tools. You don't write the command: you ask, for example, "run the shop and
show me the checkout page". In a task's conversation, the agent runs the task with what you asked, even when the task is
done. If no live preview is open on the branch, the agent's `start_app` opens one for you, as if you had chosen **Live
preview**: it needs you to be a Member or Admin of the project, and room on the site.

- `start_app` starts an app from a folder with a command and a port, such as `npm run dev` on port 5173. An app that
  listens only on `localhost` works, as it would on a developer's own machine, so a development server needs no change.
- `stop_app`, `list_apps`, `reload_view` and `set_auto_reload` stop an app, list apps with the last lines they printed,
  reload what you see, and switch **Auto**.

Starting a live preview is the permission for these tools, so Kernel does not ask **Allow** each time. Only an install
script and a new service ask, and the question says what it is for.

**An app's address is its own.** It looks like `p-<id>.<domain>`, with a random id given when the app first starts on that
branch. It stays the same when the app restarts, it cannot be guessed, and it is a separate address from HQ, from the files
address and from every other app, so one app can't read another's pages. Opening it needs you to be signed in to HQ; a
link to it does not work on its own.

## Working while an agent works on the same branch

The agent works in the branch's working copy, and the live preview's container runs the app from that same copy.

- A change the agent saves reaches the running app at once: through the app's own reloading, **Auto**, or `reload_view`.
- A message you write in the conversation goes to the branch's work, as any message does.
- A task running on its own on that branch, such as a schedule, is seen live by whoever has the live preview open.
- Dependencies are installed in the copy, so the agent installs them before it starts the app: see
  [Install scripts](#install-scripts).

## Services

An app often needs a database or a cache. The agent declares them in `.agents/services.yaml` in the workspace:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: shop
    expose: [5432]
    healthcheck:
      test: [CMD, pg_isready, -U, postgres]
      interval: 5s
```

Services run beside the app on an internal network of their own, and the app reaches one by its name, such as
`postgres:5432`. Only public images are pulled, and only these fields are accepted: `image`, `command`, `environment`,
`expose`, `healthcheck`, `depends_on` and `volumes`. A field that would widen what the container may do, such as
`privileged` or `ports`, is refused with the reason, and the agent corrects the file.

**A new or changed service waits for a person's yes.** The strip shows a question that names the service and its image;
**Start it** lets it start. A change to a service's declaration asks again. Leaving it unanswered changes nothing: the
agent carries on without it.

## Install scripts

Many packages run a script when they install. That is the usual way for a package to run code on your machine, so Agenthix
turns these scripts off.

- **Every agent command installs with scripts off**, not only in a live preview, since any run can reach a branch's
  working copy. Agents install with the `install_packages` tool, which installs with scripts off and then runs the scripts
  of the packages that pass one fixed rule.
- **The rule** uses what the public registry and the OSV advisory database publish: a version published at least 30 days
  ago, more than 1,000 downloads a week, no known advisory, and published by the same publisher as the version before.
  A short built-in list of well-known packages that need their scripts, such as `esbuild`, `sharp` and `prisma`, skips it,
  and so do the scopes your organisation trusts: see [Trusted package scopes](#trusted-package-scopes). Packages from
  the npm registry are covered.
- **A package that fails the rule is blocked.** The agent looks for another package first. Only if it still needs this one
  does it ask, with `ask_to_use_package`.
- **You are asked in plain words**, naming the package and why it was blocked, such as that it is two days old, with a
  recommendation. While the live preview is open, the question is in the strip, with **Allow**. When no live preview is
  open, a card in the branch's thread (the task's thread, or the conversation) has **Allow** and **Not now**.
  **Allow** lets that one package version's script run, and only that one. Leaving it unanswered changes nothing.

**Allow** is your own press: telling Kernel "yes, allow it" in the conversation is not enough, because HQ can't tell from
words whether you said it.

## Secrets

An app sometimes needs a secret, such as a database address with a password. Secrets reach a live preview **only through a
workflow that a person approved**, never through the agent: see [Workflows](../workflows/workflows.md) and
[Vault](../workflows/secrets-and-variables.md).

1. A workflow named `start-live-preview`, and optionally one named `reload-live-preview`, exists in the project. Each
   names the project's secrets the app needs, such as `DATABASE_URL`.
   An agent proposes a workflow from the workspace's `main`, so a workflow file written on a branch is proposed once
   that branch is merged.
2. A person approves it, as for any workflow, and it is switched on.
3. The strip then shows **Start with secrets** and **Reload with secrets** to Members and Admins. Select one to run that
   workflow. The strip shows that it is running, and you can't start another until it ends. Then it names the secrets it
   handed to the app, or says why it did not.

When the run passes, the platform hands the secrets to **the app's own container**. The agent's container never holds
them, and the output the agent sees is masked. The app reads each one from the file `/run/secrets/<NAME>`, for example
`/run/secrets/DATABASE_URL`.

- The workflow's steps run on the live preview's working copy, so a step can prepare something the app needs. The steps
  do not start the app: the agent does, with `start_app`.
- An app that was already running read its values when it started, so it doesn't have the new ones. The strip names
  it and offers **Restart**, which keeps the container and what it holds.
- Stopping the live preview, or a site restart, removes the container and the secrets with it. After you start it
  again, select **Start with secrets** again.
- An app that needs no secrets starts with the agent's `start_app` alone.

**Read the code before you merge it.** The approved workflow hands the secrets to the app, and the agent keeps changing the
app's code. Code that sent a secret elsewhere could only be caught by a person reading the changes. Agenthix accepts this
because the people who start live previews are developers who review what they merge, and it is why live previews are for
Members and Admins who can read the code.

## States

| State | Meaning | Moves on |
|---|---|---|
| **Starting** | Installing if needed, starting the container | **Running**. A failure says why and leaves nothing behind |
| **Running** | Apps and services may run | **Stopped** when unused for the site's idle time, or when you **Stop** it |
| **Paused** | The guard paused it, or the site lost its line to HQ for 15 seconds | After the guard: you select **Resume**, once you've read what it found. After a lost line: by itself |
| **Stopped** | The container is gone. The branch, its copy and its work are untouched | **Start live preview** starts it again |

- **The idle stop.** A live preview stops by itself when no one has it open and no run is going on its branch for the
  site's idle time, 2 hours unless a fleet admin set another. Stopping never loses work: the branch is in the workspace's
  repository. The panel that follows says why it stopped.
- **Other stops.** A person stops it, a project Admin or a fleet admin stops it, live previews are turned off on its site,
  its branch is merged and closed, the guard ends it, or the machine runs out of memory.
- **The guard.** Each live preview is watched. If it finds something unexpected, such as a process nobody started or an
  attempt to reach a private address, it pauses or stops the live preview within seconds and tells the people who have it
  open, and the fleet admins, what it found.

## A full site

A site can limit how many live previews run at once. When the site is full, **Live preview** says *preview-box has 6 of 6
open* and lists the open ones: whose, which branch, when last used. You can:

- select **Stop** on one of yours. A project Admin can stop any in the project;
- or pick another site with room from **Site**, if the fleet admin allows live previews on more than one.

HQ picks the site for you: the workspace's own, when it allows live previews and has room, otherwise the allowed site with
the most room. The **Site** list never shows a site where live previews are off.

## Another site

Work runs where its workspace is. Only a live preview may run elsewhere. When you pick another site:

- The branch is sent there as a Git bundle, one file holding its commits, through a relay, with a single-use ticket and a
  hash that is checked. It becomes a copy that belongs to the live preview.
- While the live preview runs there, the branch's runs go to that site and work in that copy. Each commit comes back
  the same way to the workspace's site.
- When it stops, uncommitted work is committed as *Work in progress* and brought back, and the copy is removed.

## Trusted package scopes

An organisation Admin can list the npm scopes the organisation publishes, such as `@fernhill`, under **Organisation** >
**Settings** > **Trusted package scopes**, one per line, and select **Save scopes**. Up to 20 are kept. A package in a
trusted scope runs its install script without the rule's checks. List only scopes your organisation publishes: a scope
someone else can publish under isn't yours to trust.

Trusted scopes apply wherever an agent installs packages: in a live preview and in a branch's working copy.

## Where next

- [Code workspaces and branches](code-workspaces.md): branches, working copies and merging.
- [Live previews on a site](../running-agenthix/live-previews-on-a-site.md): for fleet admins, the settings and the notices.
- [Workflows](../workflows/workflows.md): approving the workflows that carry secrets.

---
title: Logs and diagnostics
description: See what is wrong with HQ and its sites, read their logs, and gather one file to ask for help with.
sidebar:
  order: 9
---

This page is for organisation admins, in HQ: how to see what is wrong, read the logs, and gather one file to send to
someone who can help. Only organisation admins can open the page, and its **Health now**, logs and support bundle are
shown only to those who are also fleet admins; anyone else sees **Recent errors** and a note saying so. A fleet admin who is not an
organisation admin uses the Fleet Console instead.

When something doesn't work, an organisation admin starts at **Manage › Infrastructure › Logs and diagnostics**
in HQ. It shows what is wrong with **HQ**, your organisation's home in Agenthix, and with each **Execution Site**, the place
agents run. Open it from **Manage › Infrastructure**, under **More**.

![Logs and diagnostics, with Health now and Recent errors](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/diagnostics.png)

## Health now

**Health now** has a card for HQ and one for each site, with a line on how it is doing. HQ's card says whether its
database is answering and whether its scheduler ran. A site's says whether it is connected, how many of its runs are
going, whether Docker is running and how much disk is free. A site reads **Docker is not running** or **Disk nearly
full** when something is wrong. Select a card to open the page for that part.

The page refreshes by itself. Select **Check again** to check now.

## Recent errors

**Recent errors** lists what went wrong in the **last 24 hours**, grouped so the same problem appears once. Select
**All · last 7 days** to look further back, and **Last 24 hours** to return. Where an error belongs to a run or a
site, **Open the run** or **Open the site** takes you there.

## Read the logs

Select **Logs**. HQ and each site keep their own logs, for up to 7 days (they are also capped by size). Tokens and secrets are removed before a line is
written.

1. Choose a source: **HQ**, or a site.
2. Choose a **Level**: **Errors and warnings**, or **Everything**.
3. Choose a **Time range**: **Last hour**, **Last 24 hours** or **Last 7 days**.
4. To find a line, type in **Search the logs**. Tick **Follow new lines** to watch as they arrive.
5. Select **Download** for a text file of what you see.

HQ reads a site's logs from the site when you ask, and keeps no copy. A site that isn't connected shows why and has no
lines: its logs are on its own machine.

## Make a support bundle

When you ask someone for help, send them a **support bundle**: one file with what they need to see, and nothing more.

1. Select **Download support bundle**.
2. Under **Logs**, choose **Logs from** the last 24 hours or 7 days and the **Levels** to include.
3. Select **See what is in it** to look through the files, or **Download** to save it.

**What goes in:** versions of HQ and each site, the name of each setting and whether it is set, health, recent errors
and the logs.

**Never in it:** what people wrote and what agents replied, project files, any key, token, password or model login,
even where a log line held one. People, projects and agents are named `person-1`, `project-2`, `agent-3`, the same
throughout. Agenthix sends the bundle nowhere: you decide who gets it.

## On the machine itself

If HQ itself won't open, a machine admin, anyone who can use Docker on the machine, reads its logs there:

```sh
docker exec -it agenthix-host agenthix hq logs hq-server
docker exec -it agenthix-host agenthix site logs site
```

`--lines <n>` shows more or fewer lines. [Commands on a machine](commands.md) lists the parts each one has.

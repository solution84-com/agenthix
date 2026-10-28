---
title: The Library
description: See everything your organisation has installed for its agents, and start from ready-made skills, agents, boards and teams.
sidebar:
  order: 4
---

The **Library** is the one list of what your organisation has installed for its agents: skills, and the ready-made
agents, boards and teams to start from. Each item is checked when it comes in and stays at its version until someone
updates it. Everything in it is an **asset**: one package with a name, a version and a history.

Select **Library** in the side bar. Anyone in the organisation can look around and read. Adding, updating and removing
are for administrators and for **Library maintainers**, people an administrator names to look after the Library: see
[Library and skills settings](../skills/library-settings.md#library-maintainers). Others see a note where the button would be.

## Find something

![The Library, listing the organisation's skills, agents, boards and teams](screenshot:library)

The search box looks through names, descriptions, who signed an item and who has it. **Type** narrows the list to
**Skills**, **Agents**, **Boards** or **Teams**, and **Show** narrows it to one state. Each chip says how many items it
would show.

Each row gives the item's name, its type, its identity (the publisher and name, such as `agenthix/skill-creator`) and its
version. Under it come who vouches for it (**Built in**, **Signed by** a publisher, **Made here**, or **Unsigned**) and
which agents have it. A row can also carry states:

| State | Means |
|---|---|
| **Waiting for review** | An agent or a person proposed it, and a reviewer has not answered: see [Use skills in a conversation](../skills/use-skills-in-conversations.md#review-what-is-proposed) |
| **Update available** | A newer version has been installed and is not in use yet |
| **Draft** | Someone has an unpublished edit; no agent sees it until it is published |
| **No agent yet** | Installed, and no agent has it |
| **Set aside** | Another copy is used in its place |
| **Unsigned** | Nobody vouches for who made it: see [What the check says](../skills/add-a-skill.md#what-the-check-says) |

Select a row to open the item's own page. Everything you can do with a row is in its **⋯** menu: **Update**, **Add to
agents…**, **Use this again**, **Review**, **Create an agent**, **Export** and **Remove**. A copy that your organisation
made from a skill, and the original it replaced, are shown as one row.

**Review** at the top of the list appears, with a count, when proposals wait for you. **Settings** (administrators) opens
[Library and skills settings](../skills/library-settings.md).

## An item's page

A skill's page shows its content, then **Agents with this skill**, its **Versions**, where it came from, who signed it,
its credit and licence, and **Who can edit**. **Edit** is at the top, and **Export** and **Remove…** are in its **⋯** menu. The skill
sections are explained in [Give a skill to agents](../skills/give-skills-to-agents.md) and
[Write and edit a skill](../skills/write-and-edit.md).

A ready-made agent's page has **Create an agent from this**. Choose its **Handle**, then **Add to agents**. It joins
your organisation's agents as the organisation's own copy, ready to [put to work in a project](create-an-agent.md#2-put-it-to-work-in-a-project).
A board's page shows what it contains; you choose a template when you add a board to a project, and the project gets its own
copy. A team's page lists the skills it brings, and its **Use this team** button starts making teams from it (below).
Things made from a template are their own: updating the template does not change them.

### Use a ready-made team

An organisation administrator can make a team, its agents and its projects from a ready-made team. In the Library, select
the team's **⋯** menu and choose **Use this team**, or open its page and select **Use this team**.

1. The review page lists the template's teams and agents, and its projects and boards. Clear the box beside anything you
   don't want. Each agent has a **handle**; if the handle is already taken, the page says so, and you can change it.
2. Select **Apply Template**. HQ makes what you left ticked, installs the skills the agents bring, and opens your organisation's page.

If something can't be made, HQ undoes what it had made and says what went wrong. People are added to the new team after.

## Add something

**Add skill** at the top of the list brings a skill in from Agenthix's shelf, an upload or a link. **New skill** writes
one here. See [Add a skill](../skills/add-a-skill.md) and [Write and edit a skill](../skills/write-and-edit.md).
**Export** in a row's **⋯** menu saves an item as a package, a ZIP file you can share.

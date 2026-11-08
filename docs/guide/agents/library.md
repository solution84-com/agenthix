---
title: The Library
description: See everything your organisation has installed for its agents, and start from ready-made skills, agents, task templates and teams.
sidebar:
  order: 4
---

The **Library** is the one list of what your organisation has installed for its agents: skills, and the ready-made
agents, task templates and teams to start from. Each item is checked when it comes in and stays at its version until someone
updates it. Everything in it is an **asset**: one package with a name, a version and a history.

Select **Library** in the side bar. Anyone in the organisation can look around and read. Adding, updating and removing
are for administrators and for **Library maintainers**, people an administrator names to look after the Library: see
[Library and skills settings](../skills/library-settings.md#library-maintainers). Others see a line saying who adds organisation
skills, and a link to **Your space**, where they can make their own.

## Find something

![The Library, listing the organisation's skills, agents, task templates and teams](screenshot:library)

The search box looks through names, descriptions, who signed an item and who has it. **Type** narrows the list to
**Skills**, **Agents**, **Task templates** or **Teams**. **Needs you** appears, for people who can act, when something needs them,
and narrows the list to those items. Each chip says how many items it would show.

Under **All**, the Library is shelves of cards, one for each kind: **Skills**, then **Agents and teams**, then **Task templates**.
A shelf says how many it holds and shows its first cards in one row; **See all** (**See all agents** or **See all teams** on
the shared shelf) opens that kind as a grid. Choosing a type chip, **Needs you**, or searching shows every match as one
grid of cards, as many across as fit; on a phone it is one column.

A card has the kind's picture (an icon and colour for a skill, task template or team; an agent's own avatar), the item's name, who
it is from and its version (**Built in to HQ**, **Made here · 1.1.0**, **From Agenthix · 1.0.0**, or the publisher who
signed it), and two lines on what it does. At its foot, on the right, are the avatars of the agents that use it (up to two,
then a **+** and a number; one group avatar when every agent does; a dashed **+** when none does). Agents do not show
this. On the left is one tag, only when something needs you or the item is built in. The identity (the publisher and name,
such as `agenthix/skill-creator`) is on the item's page. The tags, and what they mean:

| The tag says | Means |
|---|---|
| **Needs a review** | An agent or a person proposed it, and a reviewer has not answered: see [Use skills in a conversation](../skills/use-skills-in-conversations.md#review-what-is-proposed) |
| **Update** and a version | A newer version has been installed and is not in use yet |
| **Draft · finish it** | Someone has an unpublished edit; no agent sees it until it is published |
| **No agent yet** | Installed, and no agent has it |
| **Set aside** | Another copy is used in its place; not counted under **Needs you** |
| **Built in** (with a lock) | It comes with HQ |

Pointing at a card shows its full state in words, such as the copy that replaced it. A skill from an unsigned source shows
no tag (nobody vouches for who made it: see [What the check says](../skills/add-a-skill.md#what-the-check-says)).

Select a card to open the item's own page. Everything you can do with it is in its **⋯** menu (a built-in's holds only **Open**). The first entry
depends on the card: **Review**, **Use this again**, **Update**, **Create an agent** (an agent), **Use this team** (a team),
or **Add to agents…** (a skill no agent uses). Below it are **Export** and **Remove** (administrators; a built-in skill has
neither). A copy that your organisation made from a skill, and the original it replaced, are shown as one card.

At the top of the page, **Review (3)** appears, with the number of proposals waiting, when any wait for you.
**Settings** (administrators) opens [Library and skills settings](../skills/library-settings.md); on a phone it is in the **⋮** menu there.

## A skill's page

A skill's page is its files. The folder tree is on the left, with `SKILL.md` first, and the open file is on the right.
Choose **Read** to see a file formatted or **Source** to see it as written (the one pair of buttons, in the file's own
header); hover over the file's name to see its type, size and number of lines. When `SKILL.md` is shown formatted, its
**Name** and **Description** are in a bordered card above the text.

One line of the page's header holds everything else. From the left:

- **The skill's name and its version**, such as `1.1.0 · in use`. Select the version to list the skill's versions, newest
  first, each with who published it, the date and its note. Choose an earlier one to read it (below).
  An administrator or Library maintainer also finds **Install another version…** at the foot of this list.
- **Who uses it**, as pictures: up to two agents' avatars then **+N** for the rest, one group avatar when every agent
  uses it, or a dashed **＋** when no agent does. Hover for the words. Select it to open a list above the conversation,
  and, if you are an administrator, to take the skill from one agent (**Remove**), add one (**＋ Add an agent**, then
  **Add**), or switch between **Every agent instead** and **Choose agents instead**. A change takes effect on each
  agent's next turn. A built-in skill shows the group avatar too, struck through when it is switched off; its list
  holds one switch, **On for every agent** (administrators only; everyone else reads whether it is on). See
  [Give a skill to agents](../skills/give-skills-to-agents.md).
- **About**, which opens a window with where the skill came from, its identity, the version in use, who can edit it, who
  signed it and when it was last used, its **Credit** and licence, and, for your organisation's copy of a skill or the
  original it replaced, [the other one](../skills/write-and-edit.md#your-own-copy-of-a-skill-from-elsewhere).
- **Edit**, for people who may edit: see [Write and edit a skill](../skills/write-and-edit.md).
- **⋯**, which every skill has, built-in ones too. It holds **Download** and the name of the file shown in the tree (it
  saves that one file; its note gives the size and number of lines), **Download the skill** (every file, as a package
  another HQ can install; for administrators, and greyed out with the reason on hover for everyone else) and, for people
  who may remove it, **Remove…**, which names the agents that have the skill and asks you to confirm; the skill's history
  is kept. On an earlier version, **⋯** offers the file alone.

Short lines below the header say what needs saying: that a skill is **Unsigned**, **Set aside** (with **Use
this again**), or that a newer version **is out** (with **See what changes…**). If someone has an unpublished draft, a
line at the foot says so, with **Open it**. On a phone the header is the name and version, with **About**, the downloads,
**Edit** and **Remove…** in a **⋮** menu and who uses it (the avatars and the words) on the row below, for a built-in skill too.

When something does not work (a download, a switch, a removal), a window opens in the middle of the screen with the
reason, **Close** and, where trying again could help, **Try again**. The page itself does not move, and what worked is
not announced: it shows on the page.

## An agent, task template or team's page

A ready-made agent's page has **Create an agent from this**. Choose its **Handle**, then **Add to agents**. It joins
your organisation's agents as the organisation's own copy, ready to [put to work in a project](create-an-agent.md#2-put-it-to-work-in-a-project).
A team's page lists the skills it brings, and its **Use this team** button starts making teams from it (below).
Things made from a template are their own: updating the template does not change them.

These pages are laid out as sections, not as files: **Content**, then **Skills it brings** (an agent or a team) and what
was **made from it**, its **Versions** (with **View**, and **Return to this version…** or **Update to this** on another
one), **Who can edit** and **About**. **Export** and **Remove…** are in the page's **⋯** menu.

### Use a ready-made team

An organisation administrator can make a team, its agents and its projects from a ready-made team. In the Library, select
the team's **⋯** menu and choose **Use this team**, or open its page and select **Use this team**.

1. The review page lists the template's teams and agents, and its projects and boards. Clear the box beside anything you
   don't want. Each agent has a **handle**; if the handle is already taken, the page says so, and you can change it.
2. Select **Apply Template**. HQ makes what you left ticked, installs the skills the agents bring, and opens your organisation's page.

If something can't be made, HQ undoes what it had made and says what went wrong. People are added to the new team after.

## Add something

**＋ Add** at the top of the list opens one menu: **From Agenthix**, **Upload a package** and **From a link** bring something
in, and **New skill** writes one here. See [Add a skill](../skills/add-a-skill.md) and [Write and edit a skill](../skills/write-and-edit.md).
**Export** in a card's **⋯** menu saves an item as a package, a ZIP file you can share.

## Task templates

A **task template** holds the task types a project can use, each with its columns, and its custom fields with their options.
It is the way to share how a team works: a content team's **Content piece** type with its **Idea**, **Drafting** and
**Published** columns, or a support team's **Bug** type. A task template has no tasks, boards or skills, and it follows the
same rules as skills: administrators and Library maintainers publish them, and anyone else who may work in the project can
propose theirs for a maintainer to review. An agent can only draft or propose one, and a person publishes it.

### Add a task template to a project

1. Open the template's page in the Library and select **Add to a project**, or choose **Add to a project** in its **⋯** menu.
2. Choose the **Project**. Only projects where you may change the task types are offered.
3. The dialog lists what **It adds**, and what is **Left alone**: a type or field with the same name that the project already
   has stays as it is, and the dialog says so before you confirm.
4. Select the button, which says what it adds, such as **Add 1 type and 1 field**.

What it adds is the project's own copy: later versions of the template don't change it, and no tasks move. In a project,
**Settings › Task types › New task type** can also start a type from a template.

### Share a project's types and fields

In a project's **Settings**, open **Task types** or **Custom fields** and choose **Publish as task template…** in the **⋯**
menu (administrators and Library maintainers), or **Propose as task template…** (everyone else). Name the template, tick the
types and fields to share, and select **Publish** or **Send for review**. A proposal waits in the Library until a maintainer
publishes it.

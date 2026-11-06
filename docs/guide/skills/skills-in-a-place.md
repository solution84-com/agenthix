---
title: Skills in a project or in Your space
description: Switch on the skills found in a project's files and repositories, set the default, and give a project a skill from the Library.
sidebar:
  order: 5
---

A project's files can hold skills too: agents write them there, people copy them in, and a workspace's repository
may carry its own. These are not installed in the [Library](../agents/library.md), so HQ lists them on the place's
**Skills** page and runs one only once it is switched on. A **place** is a project, or **Your space**, your own default
project.

Open a project and select **Skills** in its side bar, or open **Your space** and select **Skills**. The count beside it
shows how many skills there are, or, for people who can switch them, how many **need you**.

## Who can do what

- **Anyone who can write the project's files** can edit its skills and add one to the project.
- **The project's administrators** publish, roll back, switch and remove them, and set the default. An organisation
  administrator who is not an administrator of the project has no say here.
- **Viewers** read.
- **In Your space**, you do everything and nobody else does.

## What the page shows

The title is **Skills** (**Your skills** in Your space), with a line of counts under it, such as "3 on · 1 need you · 1 set aside".
A skill **needs you** when it was found or changed in the files and is off with no decision about it as it is now.

Skills are grouped by where they are: **This place · every agent** (**For every agent** in Your space), one agent's (such as
**Ada only**), and each workspace's repository (**Workspace** and its name, read only). Each group's folders are written
beside its name. Each row has the skill's name, its description and its state in one sentence:

| The row says | Means |
|---|---|
| **Version 3 · on for every agent here** | The version published from this place, switched on. In an agent's group it says **on** or **off** only |
| **Found in this place's files · off until you publish it** | Found in the files, never published. It is not run until it is published and switched on |
| **Its files changed since version 3 · on** | Its files differ from the published version. While it is off, the row says **Its files changed · off until you look at the change** |
| **A copy of** *name and version* **from the Library** | It was copied in from the Library. It ends **stays at this version**, or says which newer Library version is **available** |
| **Set aside · not used here** | The same skill from a higher level is used instead; the reason is shown under it |
| **Found in the repository's** *folder* **· read-only** | It lives in a workspace's repository. You can switch it, not edit it |
| **Gone from the files** | It was deleted from the files; its history stays |

Each row can show one button beside its state, the one that fits it best: **See the change**, **Publish…**, **Update…** or
**Read**. Next to it is a switch that turns the skill **on** or **off** (people who can switch skills only), and a **⋯**
menu with the rest: **Publish…**, **Put back version N** (return the files to the published version), **Update…** (bring in
a newer Library version), **Read the files**, **Edit**, **Versions** and **Remove**. **Edit** opens the editor described in
[Write and edit a skill](write-and-edit.md#the-editor). **Versions** lists the published versions, each with the date and
its note; **Return to this version** on an earlier one asks why, then publishes its files as the next version. **Remove** deletes the
skill's folder but keeps its published versions.

Switching a skill on first shows its files ("Switch on *name*?"), so you decide on what you read; HQ turns it on only if
the files are still those. When a switch stopped holding because the skill's files changed, the row says "Switched off: its
files changed since *name* switched it on", with the date, and **See the change** shows the difference. **Publish…**
shows the files and asks for a note before it writes the next version.

A group's own **⋯** menu has **All on** and **All off** for the skills in it. They ask first and say what would change. **Look
at the files again**, under the title, makes HQ read the files now; it does that once when the page opens.

## The default

The button under the title, **Skills found in files**, followed by the current choice, opens the setting for what happens to a skill HQ finds:

- **On by default**: everything found runs. The place's administrators can switch one off.
- **Off by default**: everything found is listed and stays off until switched on. A changed skill goes off again.
- **Never**: files and repositories are not read; agents there use only installed skills.

The organisation sets its default in [Library and skills settings](library-settings.md#skills-found-in-files), shown
beside this one. A project can be stricter, never looser. Changing a project's default leaves the skills already on as
they are; it changes what happens to new and changed ones.

## Add and make a skill here

**＋ Add** at the top of the page opens a menu. **From the Library** copies a skill installed in the Library into the place's
files, for every agent in the place or for one agent, as its first version there. It is a copy, not a link: later Library
versions arrive as **Update…**. **New skill** writes one in the place.

When proposals wait for the project's administrators, **N proposals waiting · Review** appears under the title.

## Your space

**Your skills** are your own way of working. Those switched on also apply in your own conversations in any project you
work in, shown as **Yours · private to you** on the project's page and **Your own skills** on the agent's, unless
an administrator has kept personal skills to Your space (see [Library and skills settings](library-settings.md#personal-skills-outside-your-space)).
They never apply to runs someone else starts, or to scheduled ones. When a project has its own skill of the same name, the
project's is used and yours is set aside.

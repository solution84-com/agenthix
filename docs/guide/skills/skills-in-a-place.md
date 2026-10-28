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
shows how many skills there are, or how many are **waiting** for a decision.

## Who can do what

- **Anyone who can write the project's files** can edit its skills and add one to the project.
- **The project's administrators** publish, roll back, switch and remove them, and set the default. An organisation
  administrator who is not an administrator of the project has no say here.
- **Viewers** read.
- **In Your space**, you do everything and nobody else does.

## What the page shows

Skills are grouped by where they are: **This place · every agent** (**For every agent** in Your space), one agent's (**Ada only**), and each workspace's
repository (**Workspace** and its name, read only). Each row has the skill's name, its description, and its state:

| State | Means |
|---|---|
| **version 3** | The version published from this place |
| **in files, not published** | Found in the files, never published. It is not run until it is published and switched on |
| **changed in files, not published** | Its files differ from the published version. It goes off until someone publishes it or puts the published version back |
| **based on** and **update available** | It was copied in from the Library, and the Library has a newer version |
| **set aside** | The same skill from a higher level is used instead; the reason is shown |
| **repository · read-only** | It lives in a workspace's repository. You can switch it, not edit it |
| **gone from the files** | It was deleted from the files; its history stays |

A row's switch turns it **on** or **off**. When a switch stopped holding because the skill's files changed, the row
says "Switched off: its files changed since *name* switched it on", with the date, and **What changed** shows the
difference. Switching a skill on first shows its files so you decide on what you read; HQ turns it on only if the files
are still those. Under the page's title, a line counts them: "3 on · 1 waiting".

**All on** and **All off**, for the whole page or one group, ask first and say what would change. **Look at the files
again** makes HQ read the files now; it does that once when the page opens.

A row's other actions are under its text: **Read** or **What changed**, **Publish as version N** (it asks for a note),
**Put back version N** (return the files to the published version), **Update…** (bring in a newer Library version), and
**Edit**, which opens the editor described in [Write and edit a skill](write-and-edit.md#the-editor). The **⋯** menu has **History**, where **Roll back to** an earlier version
asks why, and **Remove**, which deletes the skill's folder but keeps its published versions.

## The default

**Skills found in files** sets what happens to a skill HQ finds:

- **On by default**: everything found runs. The place's administrators can switch one off.
- **Off by default**: everything found is listed and stays off until switched on. A changed skill goes off again.
- **Never**: files and repositories are not read; agents there use only installed skills.

The organisation sets its default in [Library and skills settings](library-settings.md#skills-found-in-files), shown
beside this one. A project can be stricter, never looser. Changing a project's default leaves the skills already on as
they are; it changes what happens to new and changed ones.

## Add and make a skill here

**Add to this place** (**Add** in Your space) copies a skill installed in the Library into the place's files, or one agent's, as its
first version there. It is a copy, not a link: later Library versions arrive as **Update…**. **New skill** writes one in
the place.

When proposals wait for the project's administrators, **N proposals waiting · Review** appears under the title.

## Your space

**Your skills** are your own way of working. Those switched on also apply in your own conversations in any project you
work in, shown as **Yours, in your conversations** on the project's page and **Your own skills** on the agent's, unless
an administrator has kept personal skills to Your space (see [Library and skills settings](library-settings.md#personal-skills-outside-your-space)).
They never apply to runs someone else starts, or to scheduled ones. When a project has its own skill of the same name, the
project's is used and yours is set aside.

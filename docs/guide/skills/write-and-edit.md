---
title: Write and edit a skill
description: Make a skill, edit it as a draft, publish a version, return to an earlier one, and keep your organisation's own copy of one from elsewhere.
sidebar:
  order: 4
---

You edit a skill as a **draft** that no agent sees. **Publishing** makes the draft the next version, and agents that
have the skill use it from their next turn. Agents can write drafts, but only a person publishes: nothing an agent
writes reaches another agent until a person decides.

Library maintainers and administrators write and publish the organisation's skills. A project's skills are published
by the project's administrators: see [Skills in a project or in Your space](skills-in-a-place.md).

## Make a new skill

1. Select **Library**, then **＋ Add**, then **New skill**.
2. Type a **Name**: lowercase letters, digits and hyphens. It is also the skill's folder name.
3. Write **What it does, and when to use it**. Agents read this to decide when the skill fits.
4. Under **Start from**, choose **A plain skill** (a `SKILL.md` with the usual headings), **A skill with scripts** (adds
   `scripts/` and `references/` folders), or **Ask an agent to write it**.
5. Select **Create draft**. The editor opens. With **Ask an agent to write it**, the button names the agent that will
   answer and a conversation opens beside the page.

Nothing is installed until you publish version 1.

## The editor

The editor is the skill's page made ready to write in: the same folder tree and open file, with a header line above them.

- **The header** shows the skill's name, a version list that starts with **Draft** (choose an earlier version in it to
  read that version instead), and a line saying how the draft differs from the version in use, such as "changes 2 files
  from version 1.1.0, in use", and who last saved it. **Ask an agent to edit** and **Publish…** are at the right, and a
  **⋯** menu holds **Discard draft…**.
- **The tree** lists the skill's files. A marker beside a file says what you changed: added, modified, deleted or
  renamed. **Only changed** narrows the tree to those files. **＋ New file** and **Upload** add files, and **Rename**,
  **Delete** and **Undo** act on one file (a deleted file stays listed with **Restore** until you publish).
- **The open file** is written in place. For `SKILL.md`, the skill's **Name** and **Description** are two fields above
  the text, and **Source** switches to the whole file as written. A file that is not text is replaced by uploading
  another.
- **Changes** is a switch on the open file. It shows what the draft changes in that file, against the version in use,
  with the changed lines marked, arrows to step from one change to the next, **Whole file** and **Changes only**, and
  **Undo this file’s changes** (**Restore** for a deleted file).
- **The checks** are one line at the foot, such as "✓ 5 checks pass" or "✕ 1 problem". Select it to list them. Each says
  **Passes**, **Warning** or **Problem** in words as well as by its sign, and a problem has **Show it**, which opens its
  file, with the problem written under its line. The checks are the Agent Skills rules: the name, the description, and
  that every file `SKILL.md` names exists. Fix what they find before publishing.

Your draft saves itself a moment after you stop typing. The foot of the editor says **Saving…**, **Saved**, or why it
could not save. If an agent or a colleague saves the draft while you edit, a note says so and lets you **Load their
version** or **keep yours**.

**Ask an agent to edit** opens a dialog that names the agent that will answer and where, lets you pick another, and takes
what to change. The agent writes to your draft; nothing reaches an agent until you publish. **Discard draft…** asks first,
then throws the draft away; the skill stays at the version in use.

## Publish

Select **Publish…**. If it cannot be used, a line under the header says why: nothing has changed, a check fails (it
names the first problem, with **Show it**), a save is pending, or publishing is for administrators and Library
maintainers. The dialog, titled **Publish version** and the number, shows every change in every file and who will use it
from their next turn. Then:

1. For a skill already published, choose the **Version step**: **Patch**, **Minor** or **Major**, each shown with the
   number it makes. **Minor** is chosen at first. The first publish is version 1.0.0.
2. Write a **Note**, what changed, for the history. It is required.
3. Select **Publish version** and the number.

The version is written into `SKILL.md`. The window then changes to "*name* *version* is published" and asks **Which
agents use it?**: **Every agent**, **Chosen agents**, or **Not yet**. Select **Done** to finish.

## Versions, update and return to one

A skill's page keeps its versions in the list beside its name, newest first. Each shows who made it, when, and the note;
the one in use says **in use**, and a withdrawn one says **withdrawn**.

- **An earlier version** opens read-only, with its changes marked against the version before it. A line says "You are
  looking at 1.0.0, read-only. Agents use 1.1.0." The header offers **Back to the version in use** and, to people who
  may update, **Return to this version…**. After you confirm, agents use that version from their next turn. The window
  asks "Return *name* to *version*?", lets you write a **Why**, which is kept in the history, and records who returned
  and when. The version you left stays in the list.
- **Update available**: a newer version from the same signer installed but is not in use. A line under the header says
  "*version* is out." Select **See what changes…** to read it file by file. Then choose **Update to** the version,
  **Not now**, or **Skip** it.
- **Install another version…**, at the foot of the version list, lets an administrator or Library maintainer choose a
  package of this skill, checked as any install is, and use it at once. A version its publisher withdrew says so and
  needs **I want it anyway**.

## Your own copy of a skill from elsewhere

You cannot edit a skill another publisher signed, because the signature would no longer be true. **Edit** on its page
asks "Edit *name*?" and explains: **Make my copy and edit** makes the organisation's own copy, which takes the original's
place for the agents that have it once you publish it. The original stays installed, set aside, and you can switch back.
The copy records what it is based on, and that credit cannot be removed.

On the copy's page, **About** shows **The original** with its version, **View**, and **Use the original again**. On the
original's page, a line says it is set aside, with **Use this again**, and **About** shows **Your copy** with **Use your copy again**. When the original gets a newer version, the copy shows it as news, with
**See what changed in** that version, and **Dismiss**; it is never merged for you, so bring a change across by hand in the editor. Removing a copy that
is in use gives its agents the original back.

## Remove a skill

**Remove…** in the page's **⋯** menu names the agents that have the skill and asks you to confirm. Its history is kept,
so it can be installed again with its versions and credit. Removing is for administrators.

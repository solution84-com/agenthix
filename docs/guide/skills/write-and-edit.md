---
title: Write and edit a skill
description: Make a skill, edit it as a draft, publish a version, roll back, and keep your organisation's own copy of one from elsewhere.
sidebar:
  order: 4
---

You edit a skill as a **draft** that no agent sees. **Publishing** makes the draft the next version, and agents that
have the skill use it from their next turn. Agents can write drafts, but only a person publishes: nothing an agent
writes reaches another agent until a person decides.

Library maintainers and administrators write and publish the organisation's skills. A project's skills are published
by the project's administrators: see [Skills in a project or in Your space](skills-in-a-place.md).

## Make a new skill

1. Select **Library**, then **New skill**.
2. Type a **Name**: lowercase letters, digits and hyphens. It is also the skill's folder name.
3. Write **What it does, and when to use it**. Agents read this to decide when the skill fits.
4. Under **Start from**, choose **A plain skill** (a `SKILL.md` with the usual headings), **A skill with scripts** (adds
   `scripts/` and `references/` folders), or **Ask an agent to write it**.
5. Select **Create draft**. The editor opens. With **Ask an agent to write it**, the button names the agent that will
   answer and a conversation opens beside the page.

Nothing is installed until you publish version 1.

## The editor

The editor shows the skill's files in a tree. A marker beside a file says what you changed: added, modified, deleted
or renamed. Select a file to **View** it, **Edit** it as text, or see **Changes** against the version in use. A file that is not text is replaced by
uploading another. Checks run as you type, against the Agent Skills rules: the name, the description, that every file
`SKILL.md` names exists. Fix what they find before publishing.

Your draft saves itself a moment after you stop typing. The line above the files says **Saving…**, **Saved**, or why
it could not save. If an agent or a colleague saves the draft while you edit, a note says so and lets you **Load their
version** or **keep yours**.

**Ask an agent to edit** opens a dialog that names the agent that will answer and where, lets you pick another, and takes
what to change. The agent writes to your draft; nothing reaches an agent until you publish. **Discard draft** throws
the draft away; the skill stays at the version in use.

## Publish

Select **Publish…**. If it cannot be used, a line beside it says why: nothing has changed, a check fails, a save is
pending, or publishing is for administrators and Library maintainers. The dialog shows every change in every file and who will
use it from their next turn. Then:

1. For a skill already published, choose the **Version step**: **Patch**, **Minor** or **Major**. The first
   publish is version 1.0.0.
2. Write a **Note**, what changed, for the history. It is required.
3. Select **Publish version**.

The version is written into `SKILL.md`. For a skill no agent has yet, the confirmation offers **Add to agents…**.

## Versions, update and roll back

A skill's page lists its **Versions**: who made each, when, and the note, with **View** for its files. The one in use
says **In use**.

- **Roll back to this** on an earlier version makes it the one in use, after you confirm. Agents use it from their next
  turn, and the history records who rolled back and when. You can write a reason under **Why**, and it is kept there too.
- **Update available**: a newer version from the same signer installed but is not in use. The skill's page shows **What
  changes** in it, with **Update to** the version or **Skip** it.
- **Install another version…** lets an administrator or Library maintainer choose a package of this skill, checked as any
  install is, and use it at once. A version its publisher withdrew says so and needs **I want it anyway**.

**History of the version in use** lists every change of the version in use, with who and why.

## Your own copy of a skill from elsewhere

You cannot edit a skill another publisher signed, because the signature would no longer be true. **Edit** on its page
asks "Edit *name*?" and explains: **Make my copy and edit** makes the organisation's own copy, which takes the original's
place for the agents that have it once you publish it. The original stays installed, set aside, and you can switch back.
The copy records what it is based on, and that credit cannot be removed.

The copy's page shows **The original** with its version, **View**, and **Use the original again**. The original's page
shows **Your copy** and **Use your copy again**. When the original gets a newer version, the copy shows it as news, with
**See what changed**; it is never merged for you, so bring a change across by hand in the editor. Removing a copy that
is in use gives its agents the original back.

## Remove a skill

**Remove…** in the page's **⋯** menu names the agents that have the skill and asks you to confirm. Its history is kept,
so it can be installed again with its versions and credit. Removing is for administrators.

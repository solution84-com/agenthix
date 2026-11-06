---
title: Use skills in a conversation
description: Pick a skill with a slash, see when an agent used one, ask an agent to write one, and review what agents propose.
sidebar:
  order: 6
---

An agent chooses a skill itself when your request matches the skill's description. You can also ask for one by name,
see afterwards which one it followed, and ask an agent to write a new one.

## Pick a skill with a slash

Type `/` at the very start of a message in the message box. A list opens of the skills the agent has in the place the
conversation is in, in groups by where each comes from: built in, the organisation's, this agent's, the project's and
yours. Type to narrow the list by name or description, then choose one with a click, or the arrow keys and **Enter**.
**Esc** closes the list.

The skill stays in the message as highlighted `/name` text, followed by your request. HQ sends the pick as part of the message, so the
agent is told to follow that skill for this request. One skill goes with a message. Delete or change the `/name` text and the skill is
let go. A `/` later in a sentence, as in "and/or", stays plain text.

If the list says **This agent has no skills here yet**, give the agent a skill: see
[Give a skill to agents](give-skills-to-agents.md).

## See that a skill was used

When an agent follows a skill, the work lines of its run say **Used the skill**, with the skill's name, where it came
from and its version. Select the line to open the skill beside the conversation, as the agent used it in that work: its
files, its version, its signer or **Unsigned**, and **Open in the Library →**. If a newer version exists since, the panel says so.

You see a skill by name only when you may see it. For one you may not, the line keeps the agent's own staged name and opens nothing.

## Ask an agent to write a skill

Describe the routine in a conversation: "write a skill for how we review a checkout change". Or select **＋ Add** in the Library, then **New skill**, choose **Ask an agent to write it**, and name the agent that will answer; the form says who and where
before anything is sent.

The agent follows the built-in **skill-creator** skill. First it decides whether what you described is really a skill, or
instructions or knowledge. Then it tells you the name, when it applies and its steps, and waits for your yes before it
proposes it. An agent only proposes: it never publishes, switches on or installs a skill.

What comes back depends on who asked and where:

- **A draft** when you asked in your own conversation and you may edit at that level. A card says **Draft of** the skill
  and "No agent sees it until it's published". Select **Open draft** to read and change it in the editor, or **Publish…**
  to write a note and publish it. Afterward the card says "Published as 1.0.0 by you" and offers **Add to agents…**.
- **A proposal** in every other case, such as a task run, or a change to a skill another publisher signed. A card says **Proposed
  skill** (or **Proposed change** for an edit), the place it is for, how many files it holds, and **Waiting for review**.

Either way, nothing reaches another agent until a person publishes or accepts it. You can ask the agent to change a
draft in the same conversation, or use **Ask an agent to edit** in the editor.

## Review what is proposed

A proposal is aimed at one place: the organisation's Library, a project, or the person it was proposed for. The people who
review it are that place's: administrators and Library maintainers for the Library, the project's administrators for a project, and the person for
their own space. The person a proposal was made for can change where it is aimed with **Aim it at** on its card: **the
organisation**, **the project** or **yourself**.

Reviewers find what waits in three places: **Review (N)** at the top of the Library, **N proposals waiting ·
Review** on a project's **Skills** page, and "N skill proposals waiting" under **Needs attention** on the organisation's Overview. They lead to **Waiting for review**, which lists
each level you review, with what waits and, under **Decided in the last 30 days**, what was answered.

Select **Review** on a proposal. The page shows who proposed it and why, and **The change**: every file, scripts included, set
against what is in use. Read it all; a card in a conversation will not accept until you have looked at every file.

- **Accept** installs a new skill as the organisation's own at its first version, or saves a new version of an existing
  one. A new Library skill is given to no agent until you do it: the page offers **Add to agents…**. In a project it is
  published as version 1 and switched on; in Your space it is added to your skills.
- **Edit, then accept** (**Edit first** on a card) lets you change the files before accepting; the result says **Accepted with changes**.
- **Reject…** asks for a note, kept as the reason and shown to the agent and the person: "Why it isn't accepted". On a card, the button reads **Not accepted**.

Accepting a change to a skill signed by another publisher makes the organisation's own copy of it, which takes the original's place:
see [Write and edit a skill](write-and-edit.md#your-own-copy-of-a-skill-from-elsewhere).

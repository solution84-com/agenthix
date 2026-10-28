---
title: Give agents skills
description: Find, add, give, write and look after the skills your agents follow, and see when one was used.
sidebar:
  order: 5
---

A **skill** is a written routine an agent follows for one kind of job, such as reviewing code or writing release
notes. It is a folder with a `SKILL.md` file (and, if it needs them, scripts and reference files), in the open
Agent Skills format. These pages use your organisation's **HQ**, its home in Agenthix: see
[How Agenthix works](../getting-started/how-agenthix-works.md).

## Skills, instructions and knowledge

Three things shape what an agent does. The line between them decides where to write something:

| | Steers the agent? | When it applies | Holds |
|---|---|---|---|
| **Instructions** | Yes, always | Every turn | Standing rules for all work: see [Instructions and memory](../agents/instructions-and-memory.md) |
| **Skill** | Yes, for one kind of task | When a task matches its description, or you pick it with `/` | A routine the agent must follow, often with scripts |
| **Knowledge** | No, not by itself | When the agent looks something up | Policies, guidance, processes, reference and decisions: see [Knowledge](../projects/knowledge.md) |

A skill instructs; knowledge informs. To make agents do something a certain way, write a skill, or a line in the
instructions if it applies to everything. To give them something to know, write knowledge. For a process, write it
once in knowledge and let a skill make it binding: "when asked for release notes, follow the release notes page".

## Where skills come from

- **Installed in the Library.** The organisation installs a skill once and it stays at a version until someone
  updates it. Every agent that **has** the skill uses it: you give a skill to every agent, or to chosen agents. Ready-made skills
  come on Agenthix's shelf, and others can be uploaded or fetched from a link. Each is checked when it comes in.
- **Built in.** A few skills come with Agenthix and are on for every agent. **skill-creator** teaches agents how to write
  a skill and propose it. **working-with-git** applies only to runs that work in a git repository. An administrator
  can switch either off in [Library and skills](library-settings.md#built-in-skills).
- **In files.** A skill folder in a project's files, in **Your space**, or in a workspace's repository
  (`.claude/skills`, `.agents/skills` or `.github/skills`) is listed on that place's **Skills** page, and runs only
  once someone switches it on. See [Skills in a project or in Your space](skills-in-a-place.md).

A new HQ gives no agent any ready-made skill apart from the built-in ones: you choose which skills agents have.

When the same skill comes from two places, one is used and the other is **set aside**, with the reason shown. The
organisation's installed skill comes first, then the project's, then the person's own.

## The pages

1. [The Library](../agents/library.md): where everything installed is listed, with its state.
2. [Add a skill](add-a-skill.md): from Agenthix's shelf, an upload or a link, and what **Unsigned** means.
3. [Give a skill to agents](give-skills-to-agents.md): who has what, and what an agent's **Skills** shows.
4. [Write and edit a skill](write-and-edit.md): drafts, publishing, versions, rolling back and your own copy.
5. [Skills in a project or in Your space](skills-in-a-place.md): the switches, the default and **changed in files**.
6. [Use skills in a conversation](use-skills-in-conversations.md): pick one with `/`, see one used, ask an agent to
   write one, and review what is proposed.
7. [Library and skills settings](library-settings.md): for administrators.

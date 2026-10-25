---
title: Instructions and memory
description: Write what an agent is told, add skills, and look after what agents remember.
sidebar:
  order: 2
---

An agent works from three kinds of words: **instructions** that someone wrote for it, **skills** that teach it a
way of working, and **memory** that agents keep as they work. Different people look after each. A fourth, **Knowledge**,
is not read on every run: it holds the pages a place shares, which agents search when they need them. See
[Knowledge](../projects/knowledge.md).

## What an agent is told

Instructions come in layers, and an agent reads all that apply to the place it is working in:

- **The organisation's.** One set per agent, for everywhere it works. An administrator writes it.
- **A project's.** Each project can add instructions for every agent in it, and for one agent in particular. They
  are files in the project's **Files**.
- **Yours.** In your own **Chat**, you can add instructions for one agent, or for every agent. They are files in
  your own **Files**.

### Write the organisation's instructions

1. Open the agent's page: **Agents**, then **Manage agents ›**, then **Manage** beside it.
2. In **Instructions**, select **Edit**.
3. Choose **Chat** or **Task** at the top. **Chat** shows what the agent is sent when someone starts a conversation
   with it. **Task** shows what it is sent when it works on an assigned task.
4. Select the **Instructions** section, write in the editor, and select **Save**.

![An agent's Instructions open for editing, with Chat and Task at the top](screenshot:agent-instructions)

The other sections of the prompt are marked **auto · read-only**: Agenthix fills them in from the organisation, the
project and the task. A saved change takes effect at the agent's next run. **Kernel**'s instructions start from the
text that comes with Agenthix; an administrator can edit them like any other agent's.

### See them where you work

- **In a project:** under **Members**, select the agent. **Its instructions here** shows the organisation's
  instructions, read only, then the project's for every agent and for this one, each with **Open in Files**.
- **In your Chat:** open the agent from **Agents**, then **Your instructions** in its sections. It shows the
  organisation's instructions and yours, and lists your skills. To change yours, ask the agent in a conversation, or
  select **Open in Files**.

## Skills

A skill is a set of written steps an agent follows for one kind of job, such as reviewing content or writing a bug
report.

1. On the agent's page, find **Skills** and select **Add**.
2. Select the book icon (**Browse skill library**), choose a skill in **Skill Library** and select **Add**. Or select
   the plus icon (**New custom skill**), type a name where it says **Skill name...**, and select **Add**.
3. Select a skill in the list to read or edit it. A skill from the library is marked **Library**, and its **Update**
   turns on when a newer version exists. One you wrote is marked **Custom**.

Skills Agenthix gives every agent, such as task management, are always on and aren't listed. For ready-made skills
to start from, see [The Library](library.md).

## What agents remember

Agents keep short memories as they work, so that you don't repeat yourself. A memory has a title, what is
remembered (a fact in a few sentences, up to 1,500 characters, not a document), a kind (fact, preference, decision,
feedback or project), and tags. An agent finds a memory by its meaning, so it can recall one even when your words
differ. When two memories say nearly the same thing, the newer one replaces the older, or the two are joined.

There are three sets, and each belongs to someone:

- **About you, for every agent.** What every agent you work with knows about you. Yours alone: no one else reads it,
  administrators included.
- **One agent, about you.** What one agent has learned about you, used only when that agent works for you. Also yours
  alone.
- **One agent, in a place.** What an agent has learned about a project, or about your own space, for the people who
  work there. A project's admins look after it, from the **Memory** tool of the project's page. In your own space it
  is yours.

When an agent remembers or forgets something in a conversation, the conversation shows a quiet line saying so, with
**Show in Memory**, which opens **Settings › Memory** at that memory.

Memory is for a short fact or a preference. A process, a decision or reference that the whole place should be able to find
belongs in [Knowledge](../projects/knowledge.md) instead. If you say "I prefer short answers", an agent remembers it; if you
say "the Release process page is wrong", it changes that page.

### Looking after memory

In **Settings**, under **Memory**, select **Manage**. Choose the set with the tabs, and for the last two, the agent
(and the place). Each memory shows its title, text, kind and tags, when it was last recalled, how many times it was
recalled and how many times an agent relied on it, and who wrote it.

- **Add a memory:** fill in the form at the bottom and select **Add**.
- **Edit:** select **Edit**, change it, and select **Save**.
- **Pin:** select **Pin** on a memory every run should start with. Pinned memories are given to a run in full, as a
  read-only file in its home, instead of waiting to be recalled. Select **Unpin** to undo.
- **Delete:** select **Delete**. The memory is gone, and agents can no longer recall it.
- **Archived:** HQ archives a memory that has not been recalled for a long time. Tick **Show archived** to see them;
  saving an archived memory brings it back.

An agent's own page has a **Memory** section that shows what it remembers about you.

### How well it works

An organisation admin sees how recall has done over the last 30 days under **Manage**, **Settings**,
**Memory**: how many memories were included in a reply, named as a hint, recalled on request, relied on, not relied
on, or missed. The same page names the model that reads memory. It runs inside HQ by default. To use a provider's
model instead, type it as `provider/model` and select **Switch**; the organisation needs that provider's key.
Every memory is then read again in the background, and the page shows how far it has got. The old model keeps
working until it is done, and **Stop switching** cancels.

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

![An agent's Instructions open for editing, with Chat and Task at the top](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/agent-instructions.png)

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
report. An agent uses a skill when it **has** it: the organisation installs skills in the [Library](library.md), and an
administrator gives each to every agent or to chosen agents.

1. On the agent's page, find **Skills**. It lists everything the agent will use, grouped by where each skill comes from.
2. An administrator selects **Add a skill**, finds one in the Library's skills and selects **Give to** the agent. To take
   one away, select **Remove from** the agent beside it.
3. Select a skill's name to read it in the Library.

Skills that come with Agenthix, such as **skill-creator** and **working-with-git**, are on for every agent and listed under
**Built in**. Skills found in a project's files are switched on per project. All of this, and writing your own, is in
[Give agents skills](../skills/index.md).

## What agents remember

Agents keep short memories as they work, so that you don't repeat yourself. A memory has a title, what is
remembered (a fact in a few sentences, up to 1,500 characters, not a document), a **kind**, and tags. An agent finds a
memory by its meaning, so it can recall one even when your words differ. When two memories say nearly the same thing,
a newer rule replaces an older one, and two facts are joined.

Every memory is **yours**: no one else reads it, administrators included. There are two kinds:

- **Fact**: anything true about you or your work, such as "Avery's team ships on Thursdays".
- **Rule**: how you want things done, such as "use a table when comparing options". When an agent is about to answer
  and a Rule fits, it is given the Rule even if your words did not sound like it.

An agent saves a memory by itself, for you, for itself and for the place it was working in. So what **Kernel** learns in
one project is known to Kernel in that project, not to other agents and not in other places, until you choose
otherwise: see **Promote it** below. What the whole place should know, such as a process or a decision, is not a memory
at all: it belongs in [Knowledge](../projects/knowledge.md), where everyone in the place can find it.

An agent tells you about a memory only when you asked for it. When you say "remember that
I prefer short answers", or correct an agent, the conversation shows one quiet line, "Kernel remembered this", with
**Show**, which opens the memory. A memory the agent kept on its own gets no line; you find it in **Settings › Memory**.

Nobody types a memory in or edits one. What a memory says is what an agent took from working with you, in its own
words. To change one, tell the agent in a conversation, and it replaces the memory. To say what you want **every agent**
to know, write it in your instructions (see above), which you do write yourself.

Memory is for a short fact or a preference. A process, a decision or reference that the whole place should be able to find
belongs in [Knowledge](../projects/knowledge.md) instead. If you say "I prefer short answers", an agent remembers it; if you
say "the Release process page is wrong", it changes that page.

### Looking after memory

In **Settings**, under **Memory**, select **Manage**. It is one list of everything agents remember about you, newest
first. Under each title are badges for its **kind** (Fact or Rule, with a dashed edge), **which agents** remember it (one
agent's name, or **Every agent**), and **where** it holds (a place's name, or **Everywhere**), then its tags, when it
was saved, and how many times it was recalled.

- **Find one:** type in **Search memory**, or narrow the list with **Kind**, **Agent**, **Place** and **Tag**. On a
  phone, **Filter** opens them.
- **Open one:** select its row. The dialog shows what it says, which you can't change, who saved it and where, and
  how often it was recalled.
- **Promote it:** in the dialog, **Which agents remember it** is the agent that saved it or **Every agent**, and
  **Where** is the place it was saved in or **Everywhere**. Each choice is saved at once, and you can choose the
  first again to narrow it back. A memory promoted into one that says nearly the same may be joined with it.
- **Forget:** select **Forget** and confirm. The memory is gone, and agents can no longer recall it. This can't be
  undone.
- **Archived:** HQ archives a memory that has not been recalled for a long time. Tick **Show archived** to see them.

An agent's own page has a **Memory** section that shows what it remembers about you, then, folded, what every agent
knows. It opens the same dialog. A project has no memory section of its own.

### How well it works

An organisation admin sees how recall has done over the last 30 days under **Manage**, **Settings**,
**Memory**: how many memories were included in a reply, named as a hint, recalled on request, relied on, not relied
on, or missed. The same page names the model that reads memory. It runs inside HQ by default. To use a provider's
model instead, type it as `provider/model` and select **Switch**; the organisation needs that provider's key.
Every memory is then read again in the background, and the page shows how far it has got. The old model keeps
working until it is done, and **Stop switching** cancels.

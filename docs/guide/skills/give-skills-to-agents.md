---
title: Give a skill to agents
description: Choose which agents have a skill, see everything one agent will use, and keep its list short.
sidebar:
  order: 3
---

Installing a skill puts it in the [Library](../agents/library.md). An agent uses it only once the agent **has** it, so
a skill added with no agent yet shows **No agent uses it**. Choosing which agents have a skill is for administrators.

## Choose who has a skill

Adding a skill, and publishing one, both end on **Which agents use it?** with these same choices. To change them later:

1. Open the skill's page from the **Library**.
2. In the header line, select the avatars that show who uses it (hover for **Used by 2 agents**, **Used by every agent**
   or **No agent uses it**). A list opens. It says **Every agent uses** the skill, with **Every agent in the
   organisation, and each new one**, or names the agents. To change it, choose:
   - **Every agent instead**: every agent in the organisation, now and later. The list then offers **Choose agents instead**.
   - **Chosen agents**: only the agents you pick. Select **＋ Add an agent**, choose one, then **Add**. Select **Remove**
     beside a name to take the skill from that agent.

A change takes effect on each agent's next turn. Taking a skill from an agent leaves it in the Library.

## From the agent's side

An agent's **Skills** shows everything that agent will see, so you can answer "what can this agent do?" in one place.
Open **Agents**, then the agent: **Skills** is one of its sections. Administrators also reach it from **Manage › Agents**
and the agent's page there.

The page begins with a count in words ("2 built in · 1 given to Kernel") and **What the agent will see on every
request**: how many skills, and about how many tokens (small pieces of text a model reads and is billed for) the list
costs each time. Below the count, skills are rows under a heading for where each comes from:

| Heading | Holds |
|---|---|
| **Built in** | Skills that come with Agenthix, on for every agent. An administrator switches one on or off for every agent in its own page's list of who uses it (see [A skill's page](../agents/library.md#a-skills-page)) |
| **Every agent has these** | Skills given to every agent from the Library |
| **The agent's name has these** | Skills given to this agent alone, each with **Remove from** the agent |
| **Where the agent works** | One line for each project it works in, with how many of its skills are on, and **Open** to that project |
| **Your own skills** | Skills in Your space that follow you into your conversations with this agent |
| **Set aside** | Skills not used because the same skill from a higher level won, with the reason |

Select a skill's name to open it in the Library. An administrator also sees **Add a skill**: search the Library's
skills and select **Give to** the agent. A skill that is not in the Library yet is added there first, then given here.
A person who is not an administrator reads what they can see.

## Keep the list short

The more skills an agent sees, the less well it picks the right one, and the more every request costs. Above about
20 skills, or about 4,000 tokens, the page shows **Long list** and suggests removing the ones the agent does not need.
Give a skill to the agents that need it rather than to every agent.

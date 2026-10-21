---
title: "Models: the organisation's and your own"
description: Give agents a model to answer with, and see which one a run uses.
sidebar:
  order: 1
---

Agents answer through a model, and a model needs access: a key from a provider, or a Claude subscription. **HQ**,
your organisation's home in Agenthix, keeps that access encrypted and never shows a key again once it is saved.

Access can be set in three places. A run uses the first one that works for its model.

| Where | Who sets it | Where you find it |
|---|---|---|
| **A project** | Someone who can edit the project's settings | The project's **Settings**, under **Model access** |
| **A person** | That person | **Settings**, under **Your model logins** |
| **The organisation** | An organisation administrator | **Organisation › Settings › Model access** |

## Which one a run uses

1. A run in a project uses the project's own access first.
2. Then the access of the person it is for: their own Claude login, then their own API key.
3. Then the organisation's.

A run in your own **Chat** uses yours, then the organisation's. Where one place holds both a Claude subscription
and an Anthropic API key, the subscription is used while it works and the key otherwise. Agents that run on
OpenCode use API keys only.

**Conversations are different.** What an agent says to you in a conversation is answered by HQ itself, with an API key, and never with a Claude subscription. A personal conversation uses your own key, then the organisation's. A project conversation uses the project's key, then yours, then the organisation's. A task's conversation is the team's, so the project pays: the project's key, then the organisation's. If no key reaches the conversation's model, the conversation says what is missing and where to add it. The work an agent starts from a conversation runs as the rules above say, so a Claude subscription still serves that.

A person's own Claude login is not used for a task's runs in a project, because those runs act as the project.
Their own API key is. A project's own Claude subscription is used only while the organisation has one person.

A Claude subscription is personal: it is your own account, in your name, used through Claude's own runtime. So Agenthix uses it only where the runs are yours alone: the work your agents do in your own space, and a project's tasks while you are the organisation's only person. Once others join, a project needs an API key. See Anthropic's [Consumer Terms of Service](https://www.anthropic.com/legal/consumer-terms) and Claude Code's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance).

## Add model access

![Model access, with the Add model access menu open](screenshot:model-access)

1. Open the place from the table above. On **Model access**, whatever is already set is listed above the menu.
2. Select **Add model access** and choose one:

   | Choice | What it is |
   |---|---|
   | **Claude subscription** | Claude models on a Claude account. Offered for a person and a project, not for the organisation |
   | **Anthropic API key** | Claude models, for everyone the access covers |
   | **OpenRouter** | One key that reaches many models, free ones included |
   | **OpenAI** and **Google Gemini** | GPT and Gemini models |
   | **Your own endpoint** | Any model server that speaks OpenAI's API |

3. For a key, paste it and select **Save key**. For your own endpoint, enter its **Base URL**, a key only if the
   server asks for one, and select **Save endpoint**.

For a Claude subscription:

1. Tick the box under **Add a Claude subscription**. On your own login it reads **This subscription is mine, and I
   understand it will be used only for my own runs.**
2. Select **Sign in with Claude**, then **Open Claude to sign in**.
3. Sign in to Claude, copy the code it gives you, paste it into **Code from Claude** and select **Finish**.

## Remove model access

Select **Remove** beside what is set, then **Remove** again to confirm. Runs that used it stop until access is set
again. A stored Claude subscription may show **Stored but not in use while the organisation has more than one
person**.

## Web search for OpenCode agents

On **Organisation › Settings › Model access**, **Web search (Exa)** takes the organisation's Exa key, for agents
that run on OpenCode. Paste it and select **Save key**; **Remove key** takes it away. Claude models search on
Anthropic's own service and do not use it.

## If agents say they can't answer

**Home** shows **Agents can't answer you yet: no model access is set up** when nothing works for you. Its link
goes to the place that fixes it: **Settings › Your model logins**, or **Organisation › Settings › Model access**.

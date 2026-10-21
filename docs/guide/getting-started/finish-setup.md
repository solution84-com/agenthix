---
title: Finish setup
description: Create your administrator account, name your organisation and give agents a model to answer with.
sidebar:
  order: 3
---

The link the installer printed opens setup in your browser. It takes four short steps. You'll be your
organisation's first administrator, and you can change everything here later.

## 1. Create your account

![Set up Agenthix for your organisation, with fields for your name, username and password](screenshot:setup-account)

Fill in **Your name**, how you're shown on your work; **Username**, how you sign in; and a **Password** of at least
8 characters. Select **Continue**.

## 2. Name your organisation

Give **Your organisation** a **Name**. A **Picture** and a **Cover** are optional. The preview beside the form shows
your sign-in page as your people will see it. Select **Continue**.

## 3. Add model access

Agents need a model to answer. Select **Add model access** and choose one:

![Model access, with the Add model access menu open](screenshot:setup-model-access)

| Choice | What it is |
|---|---|
| **Claude subscription** | Your own Claude account. Used for your own conversations; a project's tasks use it only through the project's own access: see [Your first task](first-task.md#4-run-it) |
| **Anthropic API key** | A key for Claude models, which everyone in the organisation can use |
| **OpenRouter** | One key that reaches many models, free ones included |
| **OpenAI** or **Google Gemini** | A key for that provider's models |
| **Your own endpoint** | Any server that answers like OpenAI's API, such as a model you run yourself |

For a key, paste it and select **Save key**. For a Claude subscription:

1. Tick **This subscription is mine, and I understand it will be used only for my own runs.**
2. Select **Sign in with Claude**, then **Open Claude to sign in**.
3. Sign in to Claude, copy the code it gives you, and paste it into **Code from Claude**.
4. Select **Finish**.

Signing in with Claude needs the site beside HQ to be connected: if setup says it isn't, wait a moment.

A Claude subscription is personal: it is your own account, in your name, used through Claude's own runtime. So Agenthix uses it only where the runs are yours alone: your own conversations, and a project's tasks while you are the organisation's only person. Once others join, a project needs an API key. See Anthropic's [Consumer Terms of Service](https://www.anthropic.com/legal/consumer-terms) and Claude Code's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance).

Then select **Continue**. If you'd rather add one later, select **Skip for now** — but agents can't answer until
one is set.

## 4. Check everything

![Check everything before you start, with You, Your organisation, Where agents run and Model access](screenshot:setup-review)

**Where agents run** should say **HQ's site — running on this machine**: that's the Execution Site the
installer started beside HQ, named after this machine. If it says the site isn't connected, wait a moment and select **Check again**.

Select **Edit** beside anything you want to change, then **Finish**. You land on **Home**.

## Next

- [Your first conversation](first-conversation.md) with an agent.
- [Invite your people](../people/invite-people.md) when you're ready.

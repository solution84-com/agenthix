---
title: Set up your HQ
description: Create your administrator account, name your organisation, connect AI for your agents, now or later, and check it all.
sidebar:
  order: 3
---

The link the installer printed opens setup in your browser. You'll be your organisation's first administrator, and you
can change everything here later. Setup takes four short steps: you, your organisation, AI and a last look.

## 1. Create your account

![Set up Agenthix for your organisation, with fields for your name, username and password](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/setup-account.png)

Fill in **Your name**, how you're shown on your work; **Username**, how you sign in; and a **Password** of at least
8 characters. Select **Continue**.

## 2. Name your organisation

Give **Your organisation** a **Name**. A **Picture** and a **Cover** are optional: if you add none, HQ draws them, and you can change them later: see [Pictures and covers](../agents/pictures-and-covers.md). Choose its **Time zone**; HQ offers
your browser's. The preview beside the form shows your sign-in page as your people will see it. A month of
[usage](../your-tools/billing-and-usage.md) is cut in this time zone. Select **Continue**.

![Setup's organisation step, with the name and time zone filled in](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/setup-organisation.png)

## 3. Connect AI

Agents need a model to think with, and a voice to hear and to talk. **HQ**, your organisation's home in Agenthix,
gets both from *providers*: services such as Anthropic or Inworld that the organisation has an account with. This step
is one screen, whether you have no provider, one or several.

![Setup's AI step, with Inworld added and covering models, hearing and speaking, and What agents can do below it](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/setup-ai.png)

**Your providers** comes first and lists each provider you added as one line: its name, what it covers and whether it
works. Select a line to open it in place, with its state, what it runs and **Remove**. One line is open at a time.
(On the AI page an opened line also has its key, what uses it, **Check now**, **History** and the **More about** menu.) Before you add one it reads **None yet**.

### Add a provider

Select **Add a provider**. A pop-up lists every provider setup offers, with what each covers:

![The Add a provider pop-up, listing each provider and what it covers](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/setup-ai-add-provider.png)

| Provider | What it covers |
|---|---|
| **Anthropic** | Claude models |
| **OpenAI** | GPT models |
| **Google Gemini** | Gemini models |
| **OpenRouter** | Many models, free ones included, on one key |
| **Inworld** | Models, hearing and speaking, on one key |
| **AssemblyAI** | Hearing people |
| **Your own OpenAI-compatible endpoint** | Any server that answers like OpenAI's API, such as a model you run yourself |

The pop-up is the same one **Manage › AI** uses later. Select a provider and it asks for its key:

![The key form for a provider, with a short guide to getting the key above the fields](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/setup-ai-key-guide.png)

1. At the top, **Where do I get a key?** gives three steps: sign in or create an account at the provider, add credit if
   it asks, and create a key, copy it and paste it into the form. The button beside them opens the provider's key page.
   [Get an API key](../your-tools/get-an-api-key.md) has the same steps for each provider.
2. For your own endpoint, also enter its **Address**.
3. Paste the **API key**. **Name** is optional, and is useful beside a second key of the same provider later.
4. Select **Save**. HQ checks the key with the provider first, and stores it encrypted. It is never shown again, only
   its last four characters. The pop-up then closes and the provider appears in your list.

If the provider refuses the key, the form says why first, in plain words: the key is wrong, the account has no credit,
or the provider can't be reached. The provider's own message follows. Fix it and select **Save** again.

Inworld is listed like the others. Its one key covers models, hearing and speaking, so adding it alone covers all three.
You can add as many providers as you like, now or later under **Manage › AI**; [the AI page](../your-tools/providers.md)
explains each kind.

### What agents can do

Below it, **What agents can do** shows four lines: **Thinking**, the model agents think with; **Hearing**, what
turns people's words into text; **Speaking**, what gives agents a voice; and **Web search**. Each line has a mark: a
tick when agents can do it, an empty circle when a provider (or a key) would add it, and **!** when only some agents can.
Thinking, Hearing and Speaking are each chosen for you from what you connected, the moment a provider that can serve it
works, and each has **Change** to pick another. A choice you make is never replaced by a later one.

**Web search** depends on what the agent runs on. Claude Code agents search on their own. OpenCode agents search through
Exa with your organisation's key: **Add a key** opens a pop-up for it, which checks the key with Exa when you save it, and you can leave it for later with **Not now**.
Without a key an OpenCode agent says it can't search. [Web search](../your-tools/providers.md#web-search) has the detail.

A line nothing covers yet reads with what to add, for example **Add a provider that speaks** when only AssemblyAI is
added. That is a note, not a fault. [Models](../your-tools/models.md#the-organisations-defaults) explains each line.

### Skip for now

Skipping is never blocked: while no provider works, the button reads **Skip for now**, and you can finish setup with no
key and look around. It is not recommended. Agents can't think or talk until you add a provider, and the last look says
what stays off. Once a provider works, the same place reads **Continue**.

## 4. Check everything

![Check everything before you start, with You, Your organisation, AI, Your first agent and Where agents run](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/setup-review.png)

The last look lists what you set, each part with **Edit** to change it. It only confirms: the choices were made on the
AI step. **AI** is one row that says which providers work, then a short list of what agents can do: **Thinking**, **Hearing**,
**Speaking** and **Web search**, each with its mark. If you skipped, it says what isn't set up yet, and the choices
are made for you when you add a provider. **Your first agent** is **Kernel**, the built-in agent, speaking in the
default voice.

**Where agents run** should say **HQ's site — running on this machine**: that's the Execution Site the installer
started beside HQ, named after this machine. If it says the site isn't connected, wait a moment and select **Check again**.

Select **Finish**. You land on **Home**. If you left AI for later, Home and **Needs attention** on the Organisation page
remind you until you add a provider.

## Next

- [Your first conversation](first-conversation.md) with an agent.
- [Invite your people](../people/invite-people.md) when you're ready.

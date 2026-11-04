---
title: Set up your HQ
description: Create your administrator account, name your organisation, choose how agents reach AI models and voice, now or later, and check it all.
sidebar:
  order: 3
---

The link the installer printed opens setup in your browser. You'll be your organisation's first administrator, and you
can change everything here later. With your own keys setup takes six short steps; with Agenthix Cloud, or if you leave
AI for later, it takes four.

## 1. Create your account

![Set up Agenthix for your organisation, with fields for your name, username and password](screenshot:setup-account)

Fill in **Your name**, how you're shown on your work; **Username**, how you sign in; and a **Password** of at least
8 characters. Select **Continue**.

## 2. Name your organisation

Give **Your organisation** a **Name**. A **Picture** and a **Cover** are optional. Choose its **Time zone**; HQ offers
your browser's. The preview beside the form shows your sign-in page as your people will see it. A month of
[usage](../your-tools/billing-and-usage.md) is cut in this time zone. Select **Continue**.

![Setup's organisation step, with the name and time zone filled in](screenshot:setup-organisation)

## 3. Choose how agents reach AI

Agents need a model to think with, and a voice to hear and to talk. **HQ**, your organisation's home in Agenthix,
gets both from *providers*: services such as Anthropic or AssemblyAI that the organisation has an account with.

![How will your agents reach AI, with Agenthix Cloud, Your own keys and Later to choose between](screenshot:setup-ai-choice)

| Choice | What it is |
|---|---|
| **Agenthix Cloud** | Models and voice with no keys, billed by Agenthix each month. You approve the connection with a short code. It reads **Not available yet** until Cloud offers it, and then **Connect** is greyed out |
| **Your own keys** | You bring an account at a model provider and one at a speech provider. Two more steps |
| **Later** | Goes straight to the last look. Agents can't think or talk until you add a provider under **Manage › Providers** |

To add your keys now, select **Choose** under **Your own keys**. [Providers](../your-tools/providers.md) explains both
kinds, and how to add or change them later.

## 4. Add your model provider

Pick the provider your agents will think with: **Anthropic**, **OpenAI**, **Google Gemini**, **OpenRouter** (one key
that reaches many models, free ones included) or **Your own OpenAI-compatible endpoint**, any server that answers like
OpenAI's API, such as a model you run yourself.

![Setup's model provider step, with OpenRouter chosen and its key typed in](screenshot:setup-ai-model)

1. Select the provider. For your own endpoint, also enter its **Address**.
2. Paste its **API key**. **Name** is optional, and is useful beside a second key of the same provider later.
3. Select **Save**. HQ checks the key with the provider first, and stores it encrypted. It is never shown again, only
   its last four characters.

The step then reads **works. Added by you.** and **Continue** can be selected. You can add more providers later. If
you don't have a key yet, select **Skip for now**.

## 5. Add your voice

People talk to agents, and agents talk back. Voice needs one provider for each direction:

![Setup's voice step, with a speech to text and a text to speech provider to add](screenshot:setup-ai-voice)

- **Speech to text**: **AssemblyAI** turns what you say into text.
- **Text to speech**: **Inworld** speaks the answer.

Choose each, paste its key and select **Save**. Each key is checked with its provider before it is stored.
**Continue** needs both; **Skip for now** keeps whichever you added. [Voice](../your-tools/phone-and-voice.md) explains
how people use it.

## 6. Check everything

![Check everything before you start, with You, Your organisation, Models and voice, Defaults for everyone, Your first agent and Where agents run](screenshot:setup-review)

The last look lists what you set, each part with **Edit** to change it, and one more thing setup chooses for you,
**Defaults for everyone**: four settings that say what every agent uses unless it has its own.

| Default | What setup picks |
|---|---|
| **Conversation** | The model a new conversation starts on. Claude Sonnet 5 where your provider reaches it, otherwise a mid-priced model it does |
| **Workers** | The model for work an agent hands off. Claude Opus 5 where your provider reaches it, otherwise a higher-priced model it does |
| **Voice** | The voice agents speak with, on Inworld |
| **Listening** | The AssemblyAI model that hears people |

Select **Change** beside any of them to pick another. [Models](../your-tools/models.md) explains each. **Your first
agent** is **Kernel**, the built-in agent, speaking in the default voice.

If you left models or voice for later, **Models and voice** says what isn't set up yet, and the defaults are chosen for
you when you add a provider.

**Where agents run** should say **HQ's site — running on this machine**: that's the Execution Site the installer
started beside HQ, named after this machine. If it says the site isn't connected, wait a moment and select **Check again**.

Select **Finish**. You land on **Home**. If you left AI for later, Home and **Needs attention** on the Organisation page
remind you until you add a provider.

## Next

- [Your first conversation](first-conversation.md) with an agent.
- [Invite your people](../people/invite-people.md) when you're ready.

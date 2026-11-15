---
title: The AI page
description: Where your organisation's AI comes from and what agents can do with it, and how an organisation admin adds, checks and removes providers.
sidebar:
  order: 1
---

A **provider** is a service your organisation reaches AI through and is billed by: Anthropic for Claude models,
OpenRouter for many models, Inworld for models, hearing people and speaking to them on one key. AssemblyAI also hears people.
**HQ**, your organisation's home in Agenthix, holds the providers. Every model and every voice an agent uses comes from one of them, whichever
person, project or machine asks.

What a provider lets agents do is said in three words: **Thinking** (it serves the models agents think with),
**Hearing** (it turns what people say into text) and **Speaking** (it gives agents a voice). A provider offers one or
more of them:

| What it lets agents do | Vendors |
|---|---|
| **Thinking** | Anthropic, OpenAI, Google Gemini, OpenRouter, Inworld, your own OpenAI-compatible endpoint |
| **Hearing** | Inworld, AssemblyAI |
| **Speaking** | Inworld |

Inworld offers all three: the one key you enter covers models, hearing and speaking, so adding it is the whole of
voice and can be the whole of AI. Add it once. AssemblyAI only hears people.

An organisation has at most one provider of each vendor. A model's maker is not a provider: a DeepSeek model reached
through OpenRouter is OpenRouter's. This page is about where AI comes from and what agents can do with it;
[Models](models.md) is about which models may run and how each choice is made.

Only an organisation admin sees the AI page. Open it from the menu behind your name, with **Manage**, then **AI**
under **Models and billing**. It has three sections: **What agents can do** first, then **Your providers**
and **Which models may run** (folded, because most organisations never open it; it is on
[Models](models.md#which-models-may-run)).

![The AI page, with What agents can do and Your providers, one provider opened](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/providers.png)

## Your providers

Each provider is one line: its **name**, what it lets agents do (Thinking, Hearing, Speaking) and the runtime it
serves, and its **state**. Select the line and it opens in place: the last four characters of its key and since when
its state holds, **Used by** (what depends on it: the default model, the default for Hearing or Speaking, or the agents
that chose it themselves), **Check now**, **History** and the **More about** menu. One line is open at a time; opening
another closes the first. When an alert about a provider links here, its line is opened for you. Setup's AI step shows
the same lines, opening into less: its state, what it runs and **Remove**.

### What a line says

| State | Meaning |
|---|---|
| **Works** | The last call or check succeeded |
| **Key refused** | The vendor refuses the key |
| **Out of credit** | The vendor refuses because the account has no money left |
| **Unreachable** | Three calls or checks in a row failed |
| **Not available yet** | The provider does not offer this yet. There is nothing to do until it does |

When a vendor refuses, its own message is shown in the opened line. A busy provider that asks HQ to slow down is not a
state; HQ waits and tries again. **Check now** asks the vendor at once. **History** lists every change to the provider
and who made it.

### Add a provider

1. Select **Add a provider**. A pop-up lists every vendor and what it covers; setup's AI step uses the same pop-up
   (see [Set up your HQ](../getting-started/setup-hq.md#add-a-provider)).
2. Choose the vendor. There is no separate question about what it does: its line shows what it lets agents do.
3. At the top of its form, a short guide gives three steps to get a key and a button to the vendor's key page; the
   [Get an API key](get-an-api-key.md) page has them for each vendor. Optionally give it a **Name**. For your own
   endpoint, enter its **Address**: HQ sends prompts there, and every organisation admin sees the address on the line.
4. Paste the **API key** and select **Save**. HQ checks the key with the vendor first, and stores it encrypted. It is
   never shown again, only its last four characters. If the vendor refuses the key, the form says the plain reason first
(the key is wrong, no credit, or not reachable), then the vendor's own message.

Every organisation admin is told when a provider is added, changed or removed, and the change is recorded. A provider's
key is kept in HQ. An agent's container never holds one, and the machine that runs the agent reaches providers through
HQ and reports what each call used.

### Replace, rename, remove or revoke a key

Open a line and select its **More about** menu:

- **Replace key**: a new key, checked before the old one is dropped. Nothing changes for anyone: every model through the
  provider stays as it is. Runs already under way finish on the old key. Revoke the old key at the vendor once the new
  one is saved.
- **Rename**: changes only the name admins see.
- **Remove**: first lists what falls to what. A default that used the provider falls to the next provider that works
  for it, until you choose again; an agent that chose it itself follows the organisation's defaults. Removing the last
  provider that offers Thinking, Hearing or Speaking is allowed, and the confirmation warns that nothing then provides it until you add another.
- **Revoke now**: for a key that may have leaked. HQ drops it at once and nothing can use it again. It is never
  refused, and warns when nothing else provides what it did. Revoke the key at the vendor too: HQ cannot.

## What agents can do

At the top of the page, above **Your providers**, **What agents can do** lists the four things agents do with the AI you connected. Each line
has a mark (it reads out as "Agents can do it", "A provider would add it" or "Only some agents can do it"), what agents
use for it, and one action. A line nothing covers yet is a note and never a fault: it says what to add.

| Line | What it says | Its action |
|---|---|---|
| **Thinking** | The default model agents think with | **Change** opens the model list |
| **Hearing** | The model that hears people, and so the provider that hears | **Change** lists the live models of the providers that work, each with its languages and price per hour of audio |
| **Speaking** | The voice agents speak with | **Change** lists the provider's voices to choose by ear |
| **Web search** | Whether agents can search the web, by the way each kind of agent does it | **Add a key**, or **Change** once a key is saved |

If nothing provides Thinking, Hearing or Speaking, its line reads **Add a provider that offers models**, **Add a
provider that hears people** or **Add a provider that speaks**, with **Add a provider**. Each default is chosen for you
from what you connected, the moment a provider that can serve it works, and a choice you make is never replaced. How
each choice is made, and how an agent gets its own, is on [Models](models.md#the-organisations-defaults).

### Web search

How an agent searches the web depends on what it runs on, not on which provider serves its model:

- **Claude Code** agents search on their own, with Anthropic's search. It is on unless the admin of the Anthropic
  account has turned it off in the Claude Console, under **Settings**, then **Capabilities**. Anthropic bills each
  search to the organisation's Anthropic account.
- **OpenCode** agents search through Exa, with the organisation's key. Select **Add a key**, paste the Exa key
  (**Get one from Exa** opens its key page) and select **Save key** in the **Web search for OpenCode** pop-up. Saving
  checks the key with Exa first, with one search, which Exa counts against the account. If Exa refuses the key, the
  pop-up says so under the field and nothing is stored. If Exa does not answer, the pop-up says the key could not be
  checked, and **Save without checking** saves it anyway. **Remove key** takes it away. The key stays in HQ and never
  reaches an agent. **Not now** closes the pop-up and nothing is blocked.
- An OpenCode agent with no key says it can't search, and why, rather than trying.
- Either kind searches only as far as its own permissions allow: **Search the web** is **Ask** for every agent until
  an administrator changes it, so a person approves each search. An agent set to **Never** says so rather than
  trying. See [Fetching pages and searching the web](../agents/permissions.md#fetching-pages-and-searching-the-web).

![The Web search for OpenCode pop-up, asking for an Exa key](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/web-search-key.png)

When both kinds of agent are in use, the line says **Every agent can search** or **Some agents can search** and lists
each kind: **✓ on its own** for Claude Code, **✓ Exa** or **needs a search key** for OpenCode. The **?** beside **Web
search** says what a runtime is, the program an agent works in, and that each agent's own permissions decide whether it
may search.

## From a terminal

A machine admin, anyone who can use Docker on HQ's machine, can add and remove providers without a browser, for a
machine stood up at a terminal. Run the commands in the host service
([Commands on a machine](../running-agenthix/commands.md)):

```sh
docker exec -it agenthix-host agenthix provider add anthropic
docker exec -it agenthix-host agenthix provider list
docker exec -it agenthix-host agenthix provider remove anthropic
```

`provider add` takes the vendor (`anthropic`, `openai`, `google`, `openrouter`, `openai_compatible`, `assemblyai` or
`inworld`; Inworld's one key covers models, hearing and speaking), and `--name` and `--address` where they apply. It asks for the key, which is not shown as you type it. From
a script, pipe the key in. A key is never typed on the command line, where the shell would keep it. The same check with
the vendor, record and notice to every organisation admin apply as on this page.

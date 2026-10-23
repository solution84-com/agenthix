---
title: Providers
description: Where your organisation's models and voice come from, how an organisation admin adds, checks and removes them, and how to connect Agenthix Cloud.
sidebar:
  order: 1
---

A **provider** is a service your organisation reaches AI through and is billed by: Anthropic for Claude models,
OpenRouter for many models, AssemblyAI for hearing people, Inworld for speaking to them. **HQ**, your organisation's
home in Agenthix, holds the providers. Every model and every voice an agent uses comes from one of them, whichever
person, project or machine asks.

Each provider is one or more of three types:

| Type | What it does | Vendors |
|---|---|---|
| **LLM** | Serves the models agents think with | Anthropic, OpenAI, Google Gemini, OpenRouter, your own OpenAI-compatible endpoint |
| **STT** | Speech to text: hears people | AssemblyAI |
| **TTS** | Text to speech: gives agents a voice | Inworld |

An organisation has at most one provider of each vendor. A model's maker is not a provider: a DeepSeek model reached
through OpenRouter is OpenRouter's. [Models](models.md) chooses which models agents use; this page is about where they
come from.

Only an organisation admin sees Providers. Open it from the menu behind your name, with **Manage**, then **Providers**
under **Models and billing**.

![Providers, with each line's state, what uses it and its key's last four characters](screenshot:providers)

## What a line says

Each provider is a line with its **name**, its **state** and since when, its type and vendor, and the last four
characters of its key. Under it, **Used by** names what depends on it: the default conversation model, the default
voice, or the agents that chose it themselves.

| State | Meaning |
|---|---|
| **Works** | The last call or check succeeded |
| **Key refused** | The vendor refuses the key |
| **Out of credit** | The vendor refuses because the account has no money left |
| **Unreachable** | Three calls or checks in a row failed |
| **Not available yet**, **Disconnected** | Agenthix Cloud only: it does not offer AI to this organisation yet, or the connection ended |

When a vendor refuses, its own message is shown under the line. A busy provider that asks HQ to slow down is not a
state; HQ waits and tries again. **Check now** asks the vendor at once. **History** lists every change to the provider
and who made it.

## Add a provider

1. Select **Add provider**.
2. Choose what it does, **LLM provider**, **STT provider** or **TTS provider**, then its vendor.
3. Optionally give it a **Name**. For your own endpoint, enter its **Address**: HQ sends prompts there, and every
   organisation admin sees the address on the line.
4. Paste the **API key** and select **Save**. HQ checks the key with the vendor first, and stores it encrypted. It is
   never shown again, only its last four characters.

Every organisation admin is told when a provider is added, changed or removed, and the change is recorded. A provider's
key is kept in HQ. An agent's container never holds one, and the machine that runs the agent reaches providers through
HQ and reports what each call used.

## Replace, rename, remove or revoke a key

Select the **More about** menu on a line:

- **Replace key**: a new key, checked before the old one is dropped. Nothing changes for anyone: every model through the
  provider stays as it is. Runs already under way finish on the old key. Revoke the old key at the vendor once the new
  one is saved.
- **Rename**: changes only the name admins see.
- **Remove**: first lists what falls to what. A default that used the provider falls to the next provider that works
  for it, until you choose again; an agent that chose it itself follows the organisation's defaults. HQ refuses to remove
  the last provider of a type, and says why, because nothing could then provide it.
- **Revoke now**: for a key that may have leaked. HQ drops it at once and nothing can use it again. It is never
  refused, and warns when nothing else provides a type. Revoke the key at the vendor too: HQ cannot.

## Connect Agenthix Cloud

**Agenthix Cloud** is the hosted service from the makers of Agenthix. As a provider it supplies models and voice with no
keys, billed by Agenthix. It is not available yet: its line reads **Not available yet**.

An organisation admin connects HQ from here, with **Connect Agenthix Cloud**, or from **Add provider**:

1. Select **Connect Agenthix Cloud**. HQ shows a short code.
2. Select **Approve on Agenthix Cloud**, sign in there and check that Cloud shows the same code. Approve it.
3. This page updates by itself: **Agenthix Cloud is connected**.

**Disconnect…** ends the connection after asking. People who sign in with an Agenthix account are told and use their
password from then on. When Cloud runs HQ for you it connected HQ itself, and there is no **Disconnect**.
[Agenthix Cloud](../running-agenthix/agenthix-cloud.md) explains what else the connection adds. The Fleet Console only
shows the connection; it is made and removed here.

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
`inworld`), and `--name` and `--address` where they apply. It asks for the key, which is not shown as you type it. From
a script, pipe the key in. A key is never typed on the command line, where the shell would keep it. The same check with
the vendor, record and notice to every organisation admin apply as on this page.

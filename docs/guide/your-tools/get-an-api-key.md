---
title: Get an API key
description: Where to create the API key for each provider setup offers, and the one thing to watch for with each.
sidebar:
  order: 8
---

To add a [provider](providers.md) to **HQ**, your organisation's home in Agenthix, you paste an *API key*: a long
secret string that lets HQ use your account at that provider. You create it on the provider's own website, not in
Agenthix. The key form, in [setup](../getting-started/setup-hq.md#add-a-provider) and under **Manage › Providers**,
shows a short guide with a button to the provider's key page. This page has the same steps with a little more on each
provider.

Every provider works the same way:

1. Sign in, or create an account.
2. Add credit if it asks.
3. Create a key, copy it and paste it into HQ. Most providers show a key only once, so copy it straight away. If you
   lose it, create another.

HQ checks the key with the provider when you select **Save**, and stores it encrypted. If the provider refuses it, the
form says why.

## Anthropic

For Claude models. Create the key at [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys).

An API key is billed to the account it was made in, separately from a Claude chat plan. A Claude Pro or Max plan is not
an API key. If that is what you have, each person can sign in with it later instead: see
[Your Claude subscription](models.md#your-claude-subscription).

## OpenAI

For GPT models. Create the key on the API keys page of your OpenAI platform account; the button in HQ's key form opens
it. Copy the key when it is shown.

## Google Gemini

For Gemini models. Create the key in Google AI Studio at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
It asks you to sign in with a Google account first. Copy the key when it is shown.

## OpenRouter

For many models on one key. Create the key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).

Credit is bought first, before a key can pay for anything. Give the key a name, and you can set a credit limit on it. A
key with no limit can spend the whole balance of the account.

## Inworld

For models, hearing and speaking on one key. Create it in Inworld's portal at
[platform.inworld.ai/api-keys](https://platform.inworld.ai/api-keys): **API Keys**, then **Generate new key**.

- Choose a key that covers all of Inworld's products, a standard key, so that one key serves models, hearing and
  speaking.
- On the key's page, copy the value labelled **Basic (Base64)** and paste it into HQ.

## AssemblyAI

For hearing people; it cannot speak. Create the key at
[assemblyai.com/dashboard/api-keys](https://www.assemblyai.com/dashboard/api-keys), under your workspace's API keys,
with **Create New API Key**.

## Your own endpoint

Your own OpenAI-compatible endpoint needs its **Address** and, if the server wants one, the key that server gives you;
how you get it depends on the server.

## If a key is refused

The form says the plain reason first: the key is wrong, the account has no credit, or the provider can't be reached.
Check that you copied the whole key, and that the account has credit, then try again. A key you have lost is not
recoverable; create a new one and revoke the old one at the provider.

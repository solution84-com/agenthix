---
name: Providers and their custody
description: Part 1 of models from one place — at most one key per provider, managed by organisation admins in hq's admin area, written through one module by three named actors, never read back.
created: 2026-10-23
author: leang
---

# 1 · Providers and their custody

Part of the [spec](../spec.md). **Status:** high-level design agreed; what happens when a provider fails deep-dived (with parts 4 and 6).

## Settled

- **A provider** is one service the organisation reaches AI through and is billed by: an LLM, STT or TTS provider.
  Today's vendors: LLM — Anthropic (by API key), OpenAI, Google Gemini, OpenRouter, your own
  OpenAI-compatible endpoint, Agenthix Cloud; STT — AssemblyAI, Agenthix Cloud; TTS — Inworld, Agenthix Cloud.
- **At most one key per provider for the organisation.** A provider holds a name, its type, the vendor and address, the
  credential (encrypted under `SECRETS_MASTER_KEY`; none for Agenthix Cloud), its state and last check, and an owner:
  the organisation. A Claude subscription is never the organisation's: it belongs to one person, who signs in with it
  in hq for their own place (part 4).
- **Organisation admins manage providers, on *Providers* in the admin area** (part 3), under *Models and billing*,
  beside the defaults, the lists, billing profiles and usage. They can:
  - **add** one, checked with the vendor before it is stored
  - **replace a key**, checked before the old one is dropped; nothing else changes
  - **rename** one
  - **remove** one, refused only when it would leave no LLM, STT or TTS provider at all
  - **revoke** one, at once, whatever it breaks
  - **check** one now

  A provider that a default or an agent uses falls to another of its type when it is removed. The confirmation says
  what falls to what. Everything about models is in one place, for the people who choose them. The fleet admin's job
  is machines only.
- **Which provider listens and speaks** is chosen like a model: a default, and an agent's own (part 4).
- **One write module in hq**, the only holder of keys, with three named actors and nothing else:
  - an organisation admin, in the admin area or in setup (part 2), Agenthix Cloud included, connected with the
    device approval
  - the machine admin, through hq's control socket (`agenthix provider add|list|remove`)
  - the hosted service's controller, on a machine it runs
- **No method returns a credential**: reads give name, type, state, the last four characters, what uses it (defaults, agents),
  and this month's cost.
- **Every write is recorded** with who and when, shown on the provider, and **announced to every organisation
  admin**. An admin could point a custom endpoint elsewhere to read prompts, so the address of a custom endpoint is
  always shown on its line.
- **Removed:** every key form in hq (organisation, project, person), `ModelCredential`, the model and voice rows of
  today's `Provider` table, and the Anthropic key read from hq's environment at boot without being checked.

## When a provider fails

This covers parts 1, 4 and 6 together.

- **A provider's state** is one of:
  - *works*
  - *key refused*: an `auth` failure confirmed by an immediate check
  - *out of credit*: a `quota` failure confirmed by a check
  - *unreachable*: three failures in a row, at least a minute apart
  - for Agenthix Cloud, *not available* or *disconnected*

  `rate-limit` is retried and is not a state. `Provider` gains `state`, `stateSince`, `stateDetail` (the vendor's
  message, trimmed, with anything like a key removed), `lastCheckedAt` and `lastWorkedAt`. One module,
  `providers/health.ts`, moves the state, and each change is a provider record.
- **Where hq learns it:**
  - **Every failed call:** hq's own calls, and agents' calls through the relay's usage reports, which add the
    upstream status.
  - **A check per vendor that costs nothing:** hourly on every provider, every 5 minutes while one is not working,
    and at once after a failed call.
  - **Agenthix Cloud's answers.**
- **Who is told:**
  - **Organisation admins:** `provider_not_working`, one per provider. It says what is down in the vendor's words,
    what depends on it, and what new work moved to. It links to the provider's line, cannot be dismissed, and
    clears once the provider works. Fleet admins are not told: providers are not theirs.
  - **Everyone else:** only where they are, in the conversation, the voice button and the pickers, where the
    provider is greyed out and marked *not working*, with *an organisation admin has been told*.

  This replaces `credential_health` for keys. A person's own Claude login still tells that person.
- **New work goes around it:**
  - The resolver treats a provider that is not working as unreachable.
  - Defaults resolve to the next allowed, the same model via another provider first, as for a removal. Nothing is
    stored, so they come back by themselves.
  - Voice resolves to the other provider of its type.
- **What is fixed to it is never switched silently:**
  - **A conversation:** a failed turn shows the reason, who was told, and one offer: the same model via another
    provider, else the conversation default, else the picker. Taking it switches the conversation, writes today's
    *Switched to …* notice, and sends the message again. With nothing reachable, the message is kept. A provider
    that comes back switches nobody back. This replaces the per-conversation list of refused keys.
  - **An unattended run:** it fails with the reason, and its task waits for its person (`task_waiting`) or its
    routine raises `routine_failing`, as today.
- **Agenthix Cloud:**
  - *Disconnected* is handled as above, and organisation admins get one notification with today's
    `cloud.disconnected`.
  - *Not available* notifies nobody and is never a default.
  - **Its spending limit** is not a provider state. That profile's calls get the limit's own words and reset date,
    other providers' models stay offered, and organisation admins get `cloud_limit_reached`.

## Left to the plan

The provider table's other fields, the control-socket commands with their refusals, how a run's container gets the
provider through the site relay, and the *Providers* page in full are settled in the implementation plan, from what is
decided here and in UI flows 4 and 6.

---
name: Model routing
description: Part 4 of models from one place — one resolver for every call; the provider comes with the model; the organisation's defaults, each agent's own models, and allow and ban lists that only narrow.
created: 2026-10-23
author: leang
---

# 4 · Model routing

Part of the [spec](../spec.md). **Status:** high-level design agreed; personal projects deep-dived; provider failure deep-dived in part 1.

## Settled

- **One resolver for every call**: conversation replies, titles and summaries (on the conversation's model),
  handed-off work, task runs, the voice sample phrase, speech to text and text to speech. It answers a model, its provider, the runtime
  and the cost basis, or one problem naming what is missing and who adds it.
- **Model via provider.** Every choice names its provider, on one line as today (*Claude Sonnet 5 · via
  Anthropic*); a model two providers reach appears twice. Nothing else chooses a provider.
- **Every model picker has a search box**, wherever a model is chosen: the conversation, the defaults, an agent's,
  the lists, a task's or routine's.
- **Two defaults, overridden in order** (no light and heavy tiers). The organisation sets a **default conversation
  model** and a **default worker model**, each a model via a provider; an agent may override either with its own.
  - **The conversation:** a new one starts on the agent's default, else the organisation's; the person picks another
    at any time.
  - **Workers, and their helpers:** the default worker model, unless the person's instruction in the conversation, or
    the task's or routine's instruction, names another; the agent follows it.
  - If a choice stops working, the next layer down is used and said once.
- **Which models may run.** Every model the providers reach, narrowed by every allow and ban list that applies: the
  organisation's, the agent's, the project's, the person's. A ban beats an allow; no list widens. The price ceiling
  goes. Lists stay workable with hundreds of models (OpenRouter's): an entry may be a pattern for a maker
  (`deepseek/*`) or a family (`*-pro`), in either mode; *Only these* turns a list into an allow list, where a pattern
  such as `anthropic/claude-*` keeps up with new models while everything else stays off, and *Never* still carves
  exceptions out of it; patterns match a model's maker and name, never its provider; and the editor selects in bulk by
  maker, provider or price band, as a one-time selection rather than a rule that moves with prices.
- **Voice is chosen like a model, per agent rather than per message.** Each STT or TTS provider offers its own
  speech models (AssemblyAI's Universal-Streaming, Inworld's TTS models) and, for speech, its voices. Organisation
  admins choose the default speech to text and text to speech, each a provider with its model (and a voice); an
  agent's definition may override them, so each agent is bound to one of each. Every agent has a voice: the
  organisation's default is always set, from what setup supplied, and *none* is never a choice; the agent's
  *Enable voice mode* switch goes. There is no picker in a conversation:
  listening streams continuously, and an agent's voice is part of who it is.
- **The runtime** follows the model and provider: a Claude model on an Anthropic key, a person's own Claude subscription or Agenthix Cloud runs on
  Claude Code; anything else on OpenCode.
- **A person's own place** is their space (their default personal project) and every personal project they make.
  A person can make and manage several personal projects; they can never have members, only agents, and can never
  be shared. The chat list shows conversations from all of them.
- **A person's own Claude subscription** stays. It is offered in their pickers (*via your Claude subscription*) and
  serves Claude models across their own place, never a shared project. Personal API keys go.
- **Memory search** always uses hq's built-in embedding model, run inside hq: no provider, no key, no setting. The
  option of a provider's embedding model, and the organisation key it read directly, are removed.
- **Settings in hq** (in the admin area): the two model defaults, the two voice defaults and the organisation's
  lists on *Models*; an agent's own models, voice providers and lists on its page; a project's and a person's lists. None names a key.
- **Removed:** `ModelPolicy`, the five deciders it replaces, the agent's single default model and runtime setting,
  per-project model overrides.

## Personal projects

- **Your space stays as it is.** It is the person's default personal project, made with the account, never deleted,
  and its storage is the person's own.
- **Anyone can make more personal projects**, admin or not, as many as they like. Only their owner sees them, and
  organisation admins see neither their contents nor their names. They have no members. As in the space, any agent in
  the organisation can work there.
- **Each has its own storage** (`files/`, `workspaces/`, `knowledge/`, `artefacts/`, `tasks/`), on the Execution Site
  that holds the person's own storage.
- **Runs act as the person**, in the project's own storage. The person's Claude subscription, choices, list and agent
  settings apply. `taskRunOwner` gains the storage to use: `{kind: 'person', storage: 'own' | {projectId}}`. A
  personal project has no list or billing profile of its own: the person's list applies, and its cost goes to the
  default profile.
- **It never has** members, teams, an access level, filing under a product or programme, or becomes an organisation
  project. A conversation is never moved in or out of it.
- **The data:** `Project.personalOwnerId` stops being unique. `Project.personalSpace` (new) marks the space, with a
  partial unique index on `(personalOwnerId) WHERE personalSpace`.
- **Making:** one *New project* for everyone. People who are not organisation admins see only *Just for you*.
  `createPersonalProject {name, description?}` asks for nothing else.
- **Listing:** with the other projects, under *Your personal projects*, marked *Only you*. They also appear in Your
  space's overview, the project switcher and the dock's place picker.
- **Managing:** the owner can rename, describe, add a picture, set the automation switch, and delete it (typing its
  name). `deleteProject` takes the owner for a personal project, and the organisation admin for any other; the space
  is never deleted.
- **Leaving and erasing:** as for the space today. Leaving keeps them for Reactivate. Erasing deletes them all,
  storage included, and the erase dialog says how many there are.
- **The code:** `homeAccess.ts`'s own place covers any project whose `personalOwnerId` is the person. Every reader of
  `personalOwnerId` is checked: storage and the Your space screens test `personalSpace`, while privacy and membership
  keep testing `personalOwnerId`. `docs/concepts/projects/personal-projects.md` and `places.md` are rewritten.

## When a provider fails

New work resolves past a provider that is not working, and a conversation fixed to one is offered the same model via
another provider: [part 1, *When a provider fails*](providers.md#when-a-provider-fails).

## Left to the plan

The resolver's types and callers, what a run carries to the site, and the pickers' and messages' wording are settled in
the implementation plan.

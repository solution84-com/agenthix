---
name: Model access and policy
description: Which access pays for a turn, in which order; the model policy and who picks the model for whom.
created: 2026-10-16
author: leang
---

# Model access and policy

Part of the conversational experience's spec: the [overview](../spec.md) holds the terms, the governing
decisions and the data model this part builds on.

*Changed 2026-10-16, after the owner tried phase 1: a conversation's talking model is the person's to change at any
time, from a picker beside the agent's name, rather than fixed when the conversation opens. A provider caches per
model, so a switch costs one reply that reads the whole conversation again, and nothing else.*

## Model access for a conversation

A conversation's turns are **direct inference, always**. **Who pays is the home's rule.** A personal or project
conversation is one person's, and is paid for by that person's own access where it exists, so that as many people
as possible can talk from the first day; it is opened on the first of these that is usable, and keeps it:

1. **The person's ChatGPT plan**, through *Sign in with ChatGPT* — personal, or a seat the organisation gives
   them — for direct inference on OpenAI models. The person sets the weekly cap an app may use of their plan, in
   ChatGPT; the platform needs a client id from OpenAI before it can offer it.
2. **An API key**, resolved as runs resolve one today, for the conversation's model's provider: in a project, the
   project's key, then the person's own, then the organisation's — the project first, because an organisation that
   gives a project a key has chosen to pay for its work; in a person's own space, the person's, then the
   organisation's.

**A task's thread is the team's and the project's work, so the project pays:** every turn in it, whoever typed,
and every report turn, runs on the project's key, then the organisation's, never on a personal plan or key; its
talking model is the project policy's talking row, fixed when the thread is created, with no personal knob. With
no key on the project or the organisation the thread says so: *task threads need a key on the project*.

There is no third route. A Claude subscription stays what it is today — the credential of a person's harness home
on a site, used by workers and task runs there — and never pays for a conversation's turn: routing a conversation
through a harness to reach it would make one tier of conversation behave unlike the other, for one vendor's
plan, and a subscription is a person's own sign-in to the vendor's tools, not an access for the platform's direct
inference. A person with only a
Claude subscription can still commission work in every boundary; what they need for the conversation itself is a
key or a ChatGPT plan, and the conversation says which and where to add it.

The access decides which models are reachable; the policy decides which is preferred among them (*Model
selection*). The conversation's talking model is chosen when it opens, from what its access reaches, and kept
until the person changes it (*Model selection*). Should that access stop being usable — the plan's weekly cap is spent,
the key is revoked — the conversation says so and offers to continue on the next usable access, which may be
another provider's model; the switch is the person's, said once, and written into the record. With no access at
all, the conversation says what is missing and where to add it.

## Model selection

*Diagram: [Model selection by policy](../diagrams/model-policy.md).*

Two models are in play — the lead's and the worker's — and each helper has its own. They are chosen by rule, not
one by one.

**A model policy** is a short rule set by the person for their own space and by a project for its boundary, with
the organisation's as the default. It names a model for **talking**, for **light work** and for **heavy work**,
what may be picked at all, and a ceiling. A project's model override today becomes its policy; an agent's default
model and runtime become the fallback where no policy says.

**Each layer picks for the one below it, within the policy.** The lead reads the brief it is about to send and
names the worker's model from the policy's tiers, as a person assigns a model to a helper. The worker names each
helper's model the same way, through its harness's per-agent model setting, and the harness enforces the
allow-list. The policy reaches the lead in its instructions for the turn and as the start-work tool's `model`
argument, validated against the policy and the worker's access; it reaches the worker as its harness's agent
definitions and a line in its instructions.

**Access decides what is possible; the policy what is preferred.** The lead picks with the person's access, under
*Model access for a conversation*; the worker with its boundary's credentials, as runs resolve them today. A
preferred model nobody's access reaches falls to the next the policy allows, said once.

**The person keeps one knob** in a personal or project conversation: its talking model, defaulting from the
policy's talking row, chosen from a **model picker** beside the agent's name before the first message and changeable
at any time after. *Board: [Model picker](../boards/model-picker.html).* The picker lists only the models the
person's access reaches, within the policy's allow-list and ceiling, so nothing in it fails when chosen. It has a
search field that matches any part of a name, the person's recent models first, then the models grouped by who
makes them — Anthropic, DeepSeek, OpenAI — with the access that reaches them beside the group ("via OpenRouter"), a
few in each group and *Show N more*, and a rough price hint ($ to $$$) on each. A switch writes one quiet line in
the thread (*Switched to Claude Sonnet 5*); the next reply reads the whole conversation again, the one cost of
switching, since a provider caches per model. The agent and the model are two quiet buttons side by side, plain text with no boxes: the agent's face and name
(*Kernel ⌄*) and the maker's mark with a short model name (*V4.1 Flash ⌄*), each opening its own picker. Before the
first message both sit in the message box with Send alone on the right; after it the agent's name is plain text in
the conversation's header, the model button beside it, and the message box keeps only Send. The agent picker
searches too — name, handle or role — with the primary agent first, then recent agents, then the rest by name. The
label drops what the mark already says, and the menus keep full names. On a phone each picker is a sheet from the
bottom. The same picker chooses a
model wherever one is chosen, the model policy's forms included. A task thread has no knob: the project policy decides. A person may also say "use Opus for this" in the conversation, which the lead honours within the policy.

## Acceptance criteria

- [ ] Ordinary conversation streams through direct inference without a harness: a personal or project conversation
      on its person's access, an API key resolved as runs resolve one; a task thread on the project's key then the
      organisation's. With no usable access the conversation says what is missing and where to add it. Conditional
      on OpenAI issuing the client id: a person's conversation through Sign in with ChatGPT.
- [ ] A person picks a conversation's talking model from the picker before the first message and changes it at any
      time; the picker searches, groups by maker, lists only what the person's access reaches within the policy, and a
      switch is a quiet line in the record. When the conversation's access stops being usable it says so and offers
      the next, and the switch is recorded.
- [ ] A model policy — talking, light work and heavy work, an allow-list and a ceiling — can be set for a person's
      own space and for a project, with the organisation's as the default; the lead names the worker's model from
      it per operation and the worker names each helper's; a preferred model nobody's access reaches falls to the
      next allowed, said once.

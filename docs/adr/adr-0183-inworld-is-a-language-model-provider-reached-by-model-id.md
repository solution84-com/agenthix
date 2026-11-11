---
created: 2026-11-10
description: Inworld is a provider of language models as well as speech, reached by a model's id in the OpenAI-compatible form, one key for all three. A saved router, which only Inworld has and which its holder configures in Inworld's own portal, is never created, required or called.
---

# ADR-0183: Inworld Is a Language-Model Provider Reached by Model Id, and a Saved Router Is Never Used

**Date:** 2026-11-10
**Status:** Accepted

## Context

Inworld is a provider of speech to text and text to speech (ADR-0180). It also offers an OpenAI-compatible service that
reaches many vendors' models by a `provider/model` id, with the same key. Offered as a language-model provider, one key covers
models, hearing and speaking.

Its service also has *routers*: named configurations, kept in Inworld's portal, that choose a model by rules over
metadata the caller sends, split traffic by weight for A/B tests, and order fallbacks. A caller names one as
`inworld/<router-id>`. No other provider Agenthix offers is relied on to have an equivalent, so building on routers would tie the product to one vendor. A router is
also something its holder sets up in Inworld, not something Agenthix owns.

## Options considered

**Use saved routers** for model choice, fallback and experiments. Rejected: it adds a second decider beside the resolver
(ADR-0139), which chooses every model together with its provider. The resolver and the ledger could not see which model
served a call until the answer came back, a router's fallback could step around an organisation's allow and ban lists and hide a
failure the provider screen should show, and Agenthix would depend on a feature of one vendor that no other provider offers.

**Call a bare model name** and let Inworld pick the provider by latency. Rejected for the same reason: the provider is part
of the choice.

**Reach models by their `provider/model` id** (chosen). Inworld documents that call as one to that provider's copy of the
model with no routing logic.

## Decision

**Inworld is a provider of language models, speech to text and text to speech, on one key, and a model is reached through it by
its `provider/model` id. Agenthix never creates, requires or calls a saved router, and never uses Inworld's bare-name,
automatic or sort forms.** A model via Inworld is a model via a provider like any other: it is chosen with its provider and
appears separately from the same model at another provider.

A person who wants an Inworld router can add it as their own OpenAI-compatible endpoint, with the router's name as the model.

## What this binds

- A request to Inworld names a model by `provider/model`. It carries no router, no automatic model and no provider order.
- A feature that would send traffic through a provider's own routing, for any vendor, is a new decision, recorded before
  it is built.
- Inworld's bring-your-own-key option is not used: a vendor key that Inworld rejects is retried on Inworld's own key and billed
  as Inworld usage, which is the opposite of one key per provider.

## Consequences

### Positive
- One resolver still decides every call, and the ledger and the lists see what was chosen.
- Providers stay interchangeable: the contract is an OpenAI-format address and a model id.
- The key needs no permission to create routers.

### Negative
- An organisation that wants model choice by user, region or experiment on its own traffic gets it from Agenthix's own
  settings, not from Inworld.

### Risks
- Inworld's model list is marked an early version, so reading it can break; it is read defensively, with the last list kept.

Implemented by the one-key unit (built 10 Nov 2026): `inworld` is a provider of `llm`, `stt` and `tts` (`core/src/providers/providers.ts`; it was first behind the flag `inworldLanguageModels`, which went on 11 Nov 2026, and is no longer behind a flag); hq calls it by `provider/model` id on the OpenAI-compatible path (`hq/src/conversations/model/providers.ts`); the site's relay has the fixed upstream and adds a Bearer key that never reaches the container (`site/src/server/modelRelay/relayProviders.ts`); models via Inworld run on OpenCode, named `inworld/<id as Inworld lists it>`. No request names a router, an automatic model or a provider order. Measured results are in the unit's findings.

## References

adr-0138 (providers), adr-0139 (one resolver), adr-0180 (Inworld hears and speaks). The unit's
design is in its spec.

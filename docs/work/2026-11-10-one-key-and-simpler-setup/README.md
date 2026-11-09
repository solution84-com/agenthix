---
created: 2026-11-10
description: Setup with one AI step and no required vendor accounts — Inworld as a language-model provider beside its speech, a list of providers with one pop-up to add one and a short guide to each key, and every default model picked as the newest of a family by one shared helper.
---

# One key, and a simpler AI step

An **initiative**, run before the first early-access release is cut. A new organisation connects a separate account for each model
vendor and one for voice before its agents work, setup takes six steps on the own-keys path, and the key form never says where a key
comes from. Inworld already hears and speaks on one key; offered as a language-model provider as well, one key can cover everything.

**It covers:**

- **Inworld as a language-model provider**, reached by a model's id with one key, through hq's calls and the site's relay. It is
  listed like any other provider: no price, plan or limit on a screen, and no saved router is ever used.
- **One AI step in setup**, four steps instead of six: a list of the organisation's providers, one *Add a provider* pop-up, what
  agents use by default, and *Skip for now*, which is never blocked.
- **A short guide to each key** in the key form: three steps and a button to the vendor's key page.
- **Defaults by the newest of a family**: one shared helper in core picks every default model, and a test fails when a model id is
  fixed in source.

**It holds** [`spec.md`](spec.md) (what is there today and the design), [`boards/setup-ai-step.html`](boards/setup-ai-step.html)
(the setup screens, the build baseline) and [`plan.md`](plan.md) (the phases, as checkboxes).

**It follows** [voice that stays in the conversation](../2026-11-08-voice-that-stays-in-the-conversation/spec.md), which made Inworld
a provider of speech, and [models from one place](../2026-10-23-models-from-one-place/spec.md), whose providers, resolver and setup
it changes. Decision records: [ADR-0183](../../adr/adr-0183-inworld-is-a-language-model-provider-reached-by-model-id.md) and
[ADR-0184](../../adr/adr-0184-a-default-model-is-the-newest-of-a-named-family.md).

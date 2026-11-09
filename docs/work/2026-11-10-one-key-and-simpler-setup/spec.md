---
created: 2026-11-10
description: Inworld as a language-model provider, one simpler AI step in setup (a list of providers, a pop-up to add one, a short guide to each key, and defaults chosen for the person), and one shared way to pick the newest model of a family so no default names a fixed model.
---

# One key, and a simpler AI step — spec

**Status:** Design decided by the owner on 9 and 10 Nov 2026. The unit is open on its own branch; nothing is built. The voice unit
(`2026-11-08-voice-that-stays-in-the-conversation`), which made Inworld a provider of speech to text and text to speech, has merged.
Facts about Inworld are from its public documentation read on 9 Nov 2026; each is checked by a measurement in phase 1 before it
is relied on.

## Why

A new organisation connects a separate account for each model vendor (Anthropic, OpenAI, Google, OpenRouter) and one
for voice before agents work. Inworld offers an OpenAI-compatible service that reaches many vendors' models with the same
key that already hears and speaks. Offered as a language-model provider it lets setup be one key, without the product
promoting it.

Setup itself is also harder than it needs to be: six steps on the own-keys path (You, Organisation, a choice of Cloud,
own keys or later, a model provider, voice, last look), the model default only visible on the last screen, and a key form
that never says where a key comes from.

## What is there today

| Part | State | Where |
|---|---|---|
| Vendors | `inworld` is a speech provider (hearing and speaking) only; no language-model route | `core/src/providers/providers.ts` |
| hq's own calls | Reach `anthropic`, `openai`, `google`, `openrouter`, `openai_compatible` | `hq/src/routing/reaching.ts`, `conversations/model/providers.ts` |
| A run on a site | The site's relay adds the key and sends to a fixed upstream per provider | `site/src/server/modelRelay/relayProviders.ts` |
| Setup | Six steps on the own-keys path, four on Cloud or later; defaults chosen automatically, changeable on the last look; skipping AI is allowed (ADR-0160) | `hq/src/setup/` |
| The add form | Type, then vendor, then Name and API key; "Checked with X when you save." Nothing about where a key comes from | `hq/src/providers/components/AddProviderDialog.tsx` |
| Default model | Three separate fixed spots: `DEFAULT_MODELS` (`claude-sonnet-5`) in core, `PREFERRED` in `setupDefaults.ts`, and a price-band guess that picks Google's "Deep Research Max (preview)" | `core/src/models/modelList.ts`, `hq/src/setup/setupDefaults.ts` |
| Catalogue | Built by hand from the pinned OpenCode model list (`core/scripts/generate-model-list.mjs`); keeps id, label, provider, cost rank; no release date | `core/src/models/openCodeModels.generated.ts` |

## Decisions (owner, 10 Nov 2026)

1. **Inworld is a language-model provider reached by `provider/model` id. Saved routers are not supported.** A router is
   configured by the person in Inworld's own portal and its rules map to no other provider, so the product keeps one
   contract (an OpenAI-format endpoint plus a model id). A person who wants a router can add it as their own
   OpenAI-compatible endpoint.
2. **Inworld is not promoted.** It is listed like any other provider. No price, plan, limit or uptime appears on a screen,
   since they go out of date. Which types a provider covers (models, hearing, speaking) is shown as chips.
3. **Setup gets one AI step** instead of three: a list of the organisation's providers, one **Add a provider** button that
   opens a pop-up, and a block of what agents use. The list, the button and the pop-up are the same whether nothing,
   one or several providers are added.
4. **The model is chosen for the person and changeable** (a line with a Change link). Nothing has to be decided to continue.
5. **A short guide to each key** sits at the top of the key form: three steps and a button to the vendor's key page. The
   fuller steps live in the user guide.
6. **A default model is the newest model of a family, picked by one shared helper**, never a fixed id.

The voice unit's bridge no longer exists (the conversation model decides a spoken turn in its own call, ADR-0181), so
nothing here needs a model order for it.

## The design

### 1. Inworld as a language-model provider

`inworld` becomes a provider of three types: `llm`, `stt` and `tts`. One Standard key covers all three, so one working
Inworld provider makes `providerTypesCovered` complete.

- hq's own calls: `languageModelFor` gains an Inworld case on the OpenAI-compatible path (`https://api.inworld.ai/v1`);
  `hqCallAccess` and `runProviderDescriptor` accept the vendor.
- A run: the site's relay gets the same address as the fixed upstream and presents the key as a Bearer token,
  the relay's default (measured: Bearer and Basic both work; `x-api-key` is refused). The upstream is never taken from
  the request, as for every provider.
- The provider check is one cheap authenticated call; its failures map to the existing states (key refused, out of credit,
  unreachable). A `429` has no retry hint and is retried with a back-off, and is a limit, not a bad key.
- Subscription logins are unchanged. A model via Inworld is a model via a provider like any other, and appears twice
  when another provider reaches it too (*Claude Sonnet 5 · via Anthropic* and *· via Inworld*).
- Bring-your-own-key through Inworld, its `auto` model and its sort are not used.

**Harness.** A Claude model via Inworld is not on an Anthropic key, so under today's rule it runs on OpenCode over the
OpenAI-compatible API. Inworld also offers an Anthropic-compatible `/v1/messages`, and Claude Code works through it
(measured: tools, thinking, caching, streaming and interruption, with the key as a Bearer token). **Decided: OpenCode for every
model via Inworld.** One harness and one OpenAI-format path serve every vendor, the relay needs no new case, and Claude Code's
extra value is not needed for a first release. See [`findings.md`](findings.md).

### 2. The catalogue of models via Inworld

Read live with the key (`GET /llm/v1alpha/models`, since the plain `/v1/models` does not exist). It gives each model's
provider, creator, price per token (with cache read and write prices), context length, function calling, vision, reasoning and
caching support. It has no model name, no release date, and (measured) no `deprecationDate` or health on any model today. The
list is `v1alpha`, so reading it is defensive, unknown fields are ignored, and a failure falls back to the last list kept. Maker names are normalised (`google-ai-studio/…` is Google) so allow and ban patterns work across providers. Prices
become per provider, since Inworld's own hosted models differ from OpenRouter's; costs stay estimated from list prices.
If the list later carries a `deprecationDate`, a model near it can be marked; nothing is built on it in this unit because there is
nothing to read yet.

### 3. One AI step in setup

Steps become **You, Your organisation, AI, Last look** (four, down from six). The AI step replaces the choice, model and
voice steps; Agenthix Cloud is one entry in the add pop-up (still *Not available yet* until Cloud offers it); **Skip for
now** stays, so setup can finish with nothing added (ADR-0160).

- **Your providers:** each as a card with the vendor's name, chips for what it covers, its state and Remove. Empty reads
  "None yet".
- **＋ Add a provider:** the pop-up lists the vendors, then asks for the key, checks it with the vendor, and closes. It is
  hq's existing add-provider dialog, so Manage › Providers and setup share it.
- **What agents use:** the model, hearing and speaking, each with Change. Chosen the moment a provider that can serve it
  works, never overwritten if the person changed it. Today's "Defaults for everyone" moves here, so the last look only
  confirms.
- **The guide** (decision 5): "Where do I get a key?", three steps (sign in or create an account; add credit if asked; create
  a key, copy it and paste it below), a button to the vendor's key page, and for Anthropic one line that a Claude chat plan
  is not an API key. A refused key says the plain reason first (key wrong, no credit, not reachable). Each vendor's page
  address and its lines live in one place in the code next to its name; the fuller steps with screenshots are a user-guide
  page the product links to.

- **Skipping is never blocked.** A person can finish setup and look around with no provider and no key. It is not recommended,
  and the screen says what stays off until one is added ("Agents can't think or talk until you add a provider"; ADR-0160).
  **Skip for now** shows while nothing works; once a provider works the same place reads **Continue**.
- **When only some types are covered:** a type nothing covers (for example speaking, when only AssemblyAI is added) reads
  "Not set. Add a provider that speaks." in *What agents use*, and **Continue** is enabled. It is an ordinary state, not an outage.
- **The type question goes:** today's dialog asks what a provider does before the vendor. The chips say it, so the pop-up lists
  vendors directly. Agenthix Cloud is an entry that behaves as today's Cloud choice.

The guide pages for setup, providers and voice, and the setup spec's step list, change with it.

**The design board.** [`boards/setup-ai-step.html`](boards/setup-ai-step.html) draws this section: the steps today and after,
the AI step in four states (nothing added, the pop-up open, one provider added, only a hearing provider added), the key form with
its guide and a refusal, the default model for each provider, and the last look. Each box is numbered and keyed to a note under
it, with a *Why* for each feature. It is text and CSS only (no images), has a light and dark switch, and is the build baseline for
the screens. Where the board and this spec disagree, the spec is corrected in place and then the board.

### 4. Defaults by the newest of a family

There is no shared helper today; three places each fix a model. The unit adds one in core:

- **A family per vendor, a name pattern in one table:** Anthropic, OpenRouter and Inworld: Claude Sonnet; OpenAI: the main GPT
  line; Google: Gemini Pro. Mid-tier on purpose, as today's default is Sonnet and not Opus.
- **The newest stable member:** it orders by the release date in the pinned catalogue where the model has one (OpenCode's list
  carries `release_date` on every model; the generator now keeps it), else by the version in the name, read the same whether written `5-5` or `5.5`; it skips
  specialised variants (mini, nano, codex, deep-research, computer-use); a preview counts only when no stable one exists.
  Where a vendor keeps a "latest" alias (OpenRouter's `~anthropic/claude-sonnet-latest`), the alias is preferred.
- **A safety net:** a family with no match falls back to today's price-band rule, and says so, so a default is never empty.
- **Every caller uses it:** setup's defaults, `DEFAULT_MODELS` and any later default (a title model, a voice sample model, a
  task fallback). Its freshness is the catalogue's: if the pinned catalogue lags a vendor's newest model, so does the default.
- **Kept honest by a guard test** that fails when a specific model id appears in non-test source outside the family table,
  like `noProviderCalls` for provider calls.

### Not changing

Direct providers, their keys and preference; subscription logins; the resolver's rules (one choice, the provider comes with
the model, lists only narrow); the ledger and billing profiles; voice's own settings; ADR-0160 (AI may be skipped).

## Measuring it first (phase 1)

With the development key, written to a findings file before any code in hq:

1. Auth header: `Basic` against `Bearer`, from the AI SDK and from OpenCode.
2. A chat, a tool-calling turn and a streamed turn on the OpenAI-compatible path for a Claude, a GPT, a Gemini and a
   DeepSeek model, through the relay and through hq's own call.
3. Claude Code through `/v1/messages`: tools, thinking, caching, interruption.
4. Prompt caching: whether a cached prefix is read at the cached price and the answer's usage says so (the ledger needs it).
5. Limits: three agent runs, a title call and a voice call at once on the development account; what the `429` looks like.
   (Inworld's published limits are low on its free plan and shared by every key; this is operational, not shown on screens.)
6. The model list: fields, maker names, `deprecationDate`, and whether every listed model can be called.
7. Whether OpenCode's catalogue file carries a release date for each model (for the latest-of-family helper).
8. The key page address of each vendor and its current wording, for the guide.

## Not in this unit

Saved routers, A/B tests of models, `auto` and sort; bring-your-own-key; Inworld's usage records as actual cost; moving
existing organisations; changing what Agenthix Cloud offers.

## Decision records

Two short records, Accepted on the unit's branch at its start: *Inworld is a language-model provider reached by model id, and
a saved router is never used*, and *A default model is the newest of a named family, picked by one shared helper*.

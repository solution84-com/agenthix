---
created: 2026-11-10
description: How the one-key unit is built — a measuring phase, a shared newest-of-a-family model helper, Inworld as a language-model provider in core, hq and the site's relay, its catalogue, one AI step in setup with a key guide, and a one-key walkthrough from an empty organisation. Tasks are checkboxes, ticked as they are done.
---

# Implementation Plan · One key, and a simpler AI step

## Goal

A new organisation completes setup in four steps, with one Inworld key or any other provider, and runs a conversation, a
scheduled run and a voice call; no default model names a fixed id. The design is [`spec.md`](spec.md).

**In scope:** the newest-of-a-family helper and its guard; Inworld as `llm`; hq's calls and runs through it; its catalogue and
prices; the unified AI step with its add pop-up, defaults block and key guide; the user guide.

**Out of scope:** saved routers, A/B tests, `auto`; bring-your-own-key; actual cost from Inworld; data migration (the
clean-slate rule holds until the first release candidate).

## Approach

**Starts from `main`, on its own branch `feature/one-key-and-simpler-setup`, now the voice unit has merged**: it needs that unit's
Inworld speech providers and the voice settings. Phases run as lanes from short briefs (`running-lanes`), one squashed commit each; the lead runs the
integration and cross-application suites for what a lane changed, and the full regression and image start tests once at the
close. Each task is done when its own test passes and the typecheck of the module it touched is clean.

**Phase 1 comes first and can change the rest.** If the OpenAI-compatible path fails tool calling or streaming for any of
four vendors, or three concurrent runs fail on a paid plan, the owner hears before phase 4. Its Claude Code result sets
phase 4's harness rule; its release-date result sets phase 2's ordering.

**Flags.** Only the new vendor route is not ready on its own: Inworld as a language-model provider ships behind a flag with
a stage (`core/src/shared/featureFlags.ts`, `docs/architecture/feature-flags.md`). The helper and the four-step setup replace
behaviour that already works, so they are ready when merged.

**Resource strategy for lanes.** They contend for: the one Inworld account's rate limit, the shared test databases and fixed
ports, and memory when two builds run. So: only the lead and phase 1's lane call Inworld; no lane's tests call it (recorded
answers, never a mock that returns what the test expects); suites on fixed ports run once, by the lead; phases 2 and 3 share
no files and may run side by side, each in its own worktree; the lead watches free memory and the Inworld error rate,
pausing the second lane first. Every build that changes what a person sees is design-checked by an independent reviewer
before the owner sees it.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0139 (one resolver), ADR-0138 (providers), ADR-0160 (setup, AI may come later), ADR-0081 (harness as its vendor intends), and the voice unit's Inworld speech records |
| **New** | Two short records Accepted on the unit's branch at its start: Inworld is a language-model provider reached by model id, never a saved router; a default model is the newest of a named family, picked by one shared helper |
| **Revisits** | None |

- [x] The two records are written and Accepted on the unit's branch

## Phases

### Phase 1 · Measure (one lane; no hq code; the lead runs the Inworld calls)

Output: `findings.md` in the unit folder, one section per item. The development key only.

- [x] Auth header: `Basic` against `Bearer`, from the AI SDK and from OpenCode
- [x] A chat, a tool-calling turn and a streamed turn on the OpenAI-compatible path for a Claude, a GPT, a Gemini and a DeepSeek model, through the relay and through hq's own call
- [x] Claude Code through `/v1/messages`: tools, thinking, caching, interruption
- [x] Prompt caching: a cached prefix is read at the cached price, and the answer's usage says so
- [x] Limits: three agent runs, a title call and a voice call at once; what the `429` looks like
- [x] The model list: fields, maker names, `deprecationDate`, and whether every listed model can be called
- [x] Whether OpenCode's catalogue file carries a release date for each model (read from the agent image's model file)
- [x] Each vendor's key-page address and current wording, for the guide
- [x] The real error bodies Inworld returns for a wrong key, a limit and an unknown model, recorded for phase 3's tests (no-credit not measured: the account has credit)

**Deviations:** `findings.md` was written by the lead from the lane's returned text (the harness refuses report files from subagents). The no-credit answer was not measured (the development account has credit). The harness question was settled: OpenCode for every model via Inworld.

### Phase 2 · The newest-of-a-family helper (lane; model: Sonnet; no files shared with phase 3)

- [x] Core: the helper `newestOfFamily(vendor, family, catalogue)`, reading versions the same whether written `5-5` or `5.5`; newest stable first, previews only when no stable one exists; specialised variants skipped (mini, nano, codex, deep-research, computer-use); a vendor's "latest" alias preferred where it exists (`core/src/models/`)
- [x] The family table, one file: Claude Sonnet for Anthropic, OpenRouter and Inworld; the main GPT line for OpenAI; Gemini Pro for Google
- [x] The price-band fallback when a family has no match, returning a notice that it fell back
- [x] The generator keeps `release_date` (phase 1: OpenCode's list carries it on every model) and the helper prefers it (`core/scripts/generate-model-list.mjs`, regenerated list committed)
- [x] Setup's defaults use it (`hq/src/setup/setupDefaults.ts`: `PREFERRED` and `recommendedModel` go)
- [x] `DEFAULT_MODELS` and `DEFAULT_MODEL` use it (`core/src/models/modelList.ts`, `hq/src/agents/models.ts`)
- [x] The guard test: fails when a specific model id appears in non-test source outside the family table; every id it finds today is moved or excused with a reason
- [x] Tests on the real pinned catalogue: Google no longer picks a deep-research model; a catalogue with a newer Sonnet picks it with no code change; a dated and an undated id of one model count once

**Deviations:** `recommendedModel` stays as a thin wrapper over the helper, not removed. The main GPT line matches only `gpt-<version>`, so the codename tiers (luna, sol, terra, astra) are outside it. A vendor's `-latest` alias wins even where a numbered model is newer. The guard allows three files that name a model on purpose, each by a stated reason, and a second test fails if one of them stops naming a model. A catalogue with no Sonnet falls back to the price rule instead of failing to load (added at close).

### Phase 3 · The provider in core and hq (lane; model: Sonnet)

- [x] The flag for the Inworld language-model route, with its stage (`core/src/shared/featureFlags.ts`)
- [x] Core: `inworld` gains `llm` in `AI_PROVIDER_VENDOR_INFO`; `providerTypesCovered` test for one Inworld provider covering all three; the run descriptor and any received shape move as `docs/architecture/versioning.md` says
- [x] hq: `languageModelFor`'s Inworld case on the OpenAI-compatible path (`hq/src/conversations/model/providers.ts`)
- [x] hq: Inworld among the vendors hq may call; `hqCallAccess` and `runProviderDescriptor` accept it (`hq/src/routing/reaching.ts`)
- [x] The provider check: one cheap authenticated call (`hq/src/providers/checks.ts`)
- [x] Failure mapping with the recorded error bodies: key refused, out of credit, unreachable; a `429` retried with a back-off and treated as a limit, never as a bad key
- [x] Tests: the store and the state machine with Inworld's real error shapes

**Deviations:** the flag `inworldLanguageModels` is stage `preview`. Core stays pure: `providerTypesOf` and `providerTypesCovered` take an optional flag callback, and hq decides the flag where providers enter it (`hq/src/providers/typeGate.ts`). The Inworld error reading is one function (`inworldFailure`) and the header one constant, adjusted by the lead to the measured answers. The check, with the flag on, probes the model list and then the voice list and works when either works (code review).

### Phase 4 · The site's relay and runtimes (lane; model: Opus, it touches keys and the relay)

- [x] The relay's fixed upstream and key header for Inworld (`site/src/server/modelRelay/relayProviders.ts`, `runAccess.ts`)
- [x] OpenCode's provider block for Inworld and the model-name form it takes (`site/src/agents/runtime/OpenCodeRuntime.ts`, `openCodeTranslate.ts`); `dispatchParams.ts`
- [x] The harness rule from phase 1: OpenCode for every model via Inworld, or Claude Code through `/v1/messages` for Claude models
- [x] Tests: the relay refuses a request that names another upstream; no key reaches the container; a run's cost is recorded

**Deviations:** the relay's provider list is the site's own (`RELAY_PROVIDERS`), because core's deprecated credential list is left as it is. The site also checks the flag, and the Claude runtime refuses any non-Anthropic API key with a readable error. No site protocol minor was added to tell hq whether a site can relay Inworld (pre-release; hq and its site ship together).

### Phase 5 · Catalogue, prices, resolver (lane after 3; model: Sonnet)

- [x] The model list read with the key, kept, refreshed on a schedule, defensive about its fields, falling back to the last list kept (`hq/src/routing/`)
- [x] Maker names normalised (`google-ai-studio` is Google) so allow and ban patterns match across providers (`hq/src/routing/modelKeys.ts`, `listMatch.ts`)
- [x] A per-provider price list; the estimated cost of a call via Inworld, with cached input if phase 1 shows it is reported (`core/src/models/priceList.ts`)
- [-] `deprecationDate` marks a model in pickers and warns where it is a default (dropped: Inworld's list carries none today; the read stays defensive)
- [x] Resolver: models via Inworld offered like any provider's; a conversation fixed to a model offered the same model via another provider when Inworld fails
- [x] Tests: a pattern such as `google/*` matches the same model on both providers; the newest-of-a-family helper over Inworld's list

**Deviations:** the `deprecationDate` marking was dropped (Inworld's list has no such field). The model list is held in memory per provider, with no table. A model hosted under two providers at Inworld appears once, the cheaper entry. The list is not read on a successful provider check (the check already reads the same address and discards the body).

### Phase 6 · The AI step and the key guide (lane after 2, 3 and 5; model: Sonnet; design-checked)

Built to the design board, [`boards/setup-ai-step.html`](boards/setup-ai-step.html), which is part of the spec.

- [x] Setup steps become You, Your organisation, AI, Last look (`hq/src/setup/pages/setupSteps.ts`, `SetupPage.tsx`; the choice, model and voice steps go)
- [x] The AI step: the providers list with chips for what each covers, the one **Add a provider** button and the pop-up, Agenthix Cloud as an entry in it, **Skip for now**
- [x] The pop-up is the existing add-provider dialog, reused in setup and in Manage › Providers; one list of vendors for both (`hq/src/providers/components/AddProviderDialog.tsx`, `providerWords.ts`)
- [x] What agents use: the model, hearing and speaking, each with Change; chosen when a provider that serves it works, never overwriting a choice the person made (`DefaultsSection.tsx`, `setupDefaults.ts`)
- [x] The key guide at the top of the key form: three steps, the vendor's key-page button, the Anthropic line; each vendor's address and lines in one place next to its name
- [x] A refused key says the plain reason first, then the vendor's own message
- [x] The last look only confirms; its AI row says what works
- [x] The user guide: `getting-started/setup-hq.md` (four steps), `your-tools/providers.md`, `your-tools/models.md`, voice's page, and a new "Get an API key" page with a screenshot per provider (the page has no per-provider screenshot: vendor pages cannot be captured by the guide tooling)
- [x] The setup spec's step list is corrected in place (`docs/work/2026-10-23-models-from-one-place/spec/setup.md`)
- [x] Tests: setup integration finishing with nothing, with one Inworld key and with two providers; the page's component tests for the board's four states (nothing added, pop-up, one provider, only a hearing provider); the step order (`hq/src/setup/pages/__tests__/`)

**Deviations:** the guide's Inworld step leaves the 'one key covers models, hearing and speaking' line to the key field's own hint, which follows the flag; the rows keep the order of the shared rows (Model, Speaking, Hearing) and Change only where they had it; setup shows no price on its rows (a prop; Manage › Models keeps its own); choosing how agents hear opens a pop-up like the model and the voice (found in the owner's test), on Manage › Models and an agent's page too. The design review's items 1 to 11 and 14 to 17, the code review's items and the live run's three are fixed.

### Phase 7 · Verification (the lead)

- [ ] Model checks on the low-cost baseline model through Inworld: a conversation with tools, a scheduled run, a title call (done: the lead checks through Inworld, 29 of 30 pass; a scheduled run and a title call were not run)
- [ ] The one-key walkthrough from an empty organisation, with a fresh Inworld key, by the owner: setup, a conversation, a scheduled run and a voice call
- [ ] The same with another provider only (setup is walked against a stand-in model in the end-to-end spec; the owner walk is still to do)
- [ ] The full regression, the image start tests and the all-flags-on run (done: unit, integration and cross-app suites, cross-app with every flag on, the image start tests and the install test; not run: the full hq end-to-end suite, the guide screenshot recipes, and the end-to-end suite with every flag on)

**Deviations:** not run, and queued: a scheduled run, a title call and a voice call live on Inworld, the guide's screenshot recipes, and the end-to-end suite with every flag on. The full hq end-to-end suite ran: 116 passed; of the 6 that failed, 5 passed on their own re-run (sign-in timeouts under load) and one, the Chat page's search, still fails and is unconfirmed as pre-existing.

## Verification of the objective

- [x] Setup is four steps and finishes with one key — the walkthrough and the setup integration test (the integration and end-to-end tests pass, and the owner walked setup)
- [ ] A conversation, a scheduled run and a voice call run on it — the walkthrough (a conversation with a tool ran live on a real key; the scheduled run and the voice call are in [#203](https://github.com/solution84-com/agenthix/issues/203))
- [x] No default names a fixed model — the guard test, and the catalogue test with a newer model
- [ ] A new person can find their key — design review, and the walkthrough by someone new to the providers (the design review passed; the walkthrough by someone new is in [#203](https://github.com/solution84-com/agenthix/issues/203), and the guide's addresses in [#199](https://github.com/solution84-com/agenthix/issues/199))

## Closing note — 10 Nov 2026

**Accepted by the owner on 10 Nov 2026**, after walking setup on a fresh HQ with their own keys; the one change that walk found (choosing how agents hear opened an inline select that broke the layout) was fixed in the unit.

**Open items.** Triage checked every item the lanes, the two independent reviews and the live run surfaced against the code at head: 20 were closed in the unit, and the rest were deferred as eleven public issues, [#197](https://github.com/solution84-com/agenthix/issues/197) to [#207](https://github.com/solution84-com/agenthix/issues/207) (a second Inworld model in one container, the same model at another provider, the key guide's addresses, the guide's screenshots, the end-to-end suites not run, setup polish, the Inworld paths walked only with stand-ins, a site protocol minor, the removal-impact views and the flag, a context limit and prompt caching for models via Inworld), and three feature requests raised outside this repository. No item is critical, so none blocks release.

**QA.** The unit wrote its QA contract at close (SC-1842 to SC-1868 and US-447 to US-449, and the setup, provider and listening entries corrected) and tagged its tests. No full QA audit ran at close; the entries the unit wrote for itself await the audit before release.

**Decision records.** [ADR-0183](../../adr/adr-0183-inworld-is-a-language-model-provider-reached-by-model-id.md) and [ADR-0184](../../adr/adr-0184-a-default-model-is-the-newest-of-a-named-family.md) are Accepted and carry a note on what implemented them; the records this unit depends on (ADR-0138, 0139, 0160, 0081, 0180) are still Accepted. No record was superseded.

**Reference documents** changed: the user guide's setup and providers pages and a new page on getting an API key; the setup, providers, model relay and runtimes concepts and architecture documents; the QA contract; and the setup spec of models from one place, whose step list is corrected in place.

This plan is frozen.

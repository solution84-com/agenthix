---
created: 2026-10-23
description: How models from one place is built — providers managed in hq's admin area, one resolver, setup that requires models and voice, personal projects, the ledger and billing profiles — in six phases carried out by lanes.
---

# Implementation Plan · Models from one place

## Goal

Every model, speech-to-text and text-to-speech call in an organisation is supplied, chosen and costed from one place:
providers managed by organisation admins in hq's admin area, one resolver for every call, every call written to a
ledger against a billing profile, and a first setup that requires models and voice.

**In scope:** the six parts of the [spec](spec.md) as settled, including the four deep dives:
- **Providers:** the store, its three writers, health, notifications, and the *Providers* page in the admin area.
- **Setup:** one flow in hq, with models and voice required, and the setup state.
- **The admin area** at `/admin`.
- **Routing:** the resolver, defaults, an agent's models and voice, lists with patterns, personal projects, and what
  happens when a provider fails.
- **Billing:** the ledger, price lists, billing profiles, and the usage report.
- **Agenthix Cloud:** its contract typed in `core`, and the provider entry that says *not available yet*.

Also in scope: removing every old key form, `ModelCredential`, `ModelPolicy`, the five deciders, the provider embedder
and the environment key seeding. The documents, decision records and QA contract for all of it are in scope too.

**Out of scope:**
- **hq's calls to Agenthix Cloud's AI endpoints** (the token scoped to AI, the catalogue, the gateway, voice tokens,
  actual costs, pushing billing profiles) **and the key rollover's calls**. The spec says hq builds them when the
  hosted side is ready (part 6, ADR-0130). Building against an endpoint that does not exist yet would be built twice.
  The contract is typed now, so both sides build to one shape.
- **The hosted service's metering, invoices and caps.** They are the hosted service's own work.
- **Sets of providers, remote configuration of flags, spend limits, and signing in with ChatGPT.** Each is set aside
  in the spec's *Not in this unit*.
- **The port plan for dev, tests and installs.** The owner wants it as its own unit, started straight after this one
  closes and before the next release.

## Approach

**Contracts first, then the store, then everything that reads it.** The work follows the spec's dependency order:
providers must exist before anything is chosen, the resolver decides every call before anything can be costed, and
setup needs the provider store to write into. So phase 1 commits the shared contracts and the additive schema
on the unit's branch before any lane starts. That covers the types in `core` that hq, the site and the hosted service
all build against, and every new table and column. Every later lane is cut from it, and no two
lanes write the same contract.

**Additive first, removal with the callers.** The new tables sit beside the old ones until the lane that moves the
callers onto the resolver removes `ModelCredential`, `ModelPolicy`, the deciders and the agent's single model and
runtime fields, in the same change. The repository is a clean slate before its first release candidate, so old rows
are dropped and never converted. Today's `Provider` table also holds the web-search key, which is not an AI provider:
the new providers live in a new table, `AiProvider`, and the old table keeps only the web-search row.

**One module per authority.** Every provider write goes through `providers/write.ts`, and every state change through
`providers/health.ts`. Every call is resolved by one resolver and written by one ledger writer. A lane that needs to
write a provider, change a state or record a cost calls one of these modules, never the table, so the rules the spec
puts on each (who may write, no read-back, append-only) are enforced in one place and tested there.

**The site learns about providers only through the run.** A run carries a provider descriptor: the vendor, its
address and either the key or, for a person's own Claude subscription, the login file as today. The relay adds the
key, as it does now. It also reads each answer's usage and upstream status and reports them to hq in `usage.report`
frames, which feed both the ledger and provider health. The site keeps no provider table of its own.

**How the work is carried out.**
- **Lanes:** every phase runs as lanes under the lead (`running-lanes`). Each lane has its own branch and worktree,
  a brief and the shared rules in `execution/lane-common.md`.
- **Merging:** lanes merge into `feature/models-from-one-place` one at a time, in the order the phase lists them.
  Each lane is rebased onto the branch's current head, the tests for what it changed are run again, and it merges
  with `--no-ff`.
- **Migrations:** the lead generates every migration at merge; lanes never write one.
- **Suites:** the lead runs the integration, cross-application and container suites after the lanes that change
  what they test. The full regression runs once, at the close.
- **At most three lanes build at once.** The machine is a 24 GB, 10-core Mac with little free disk. Every heavy
  command goes through the lock wrapper, and the lead watches memory, swap, load and disk (`execution/README.md`).
- **Decisions:** lanes and the lead settle what the spec and the code make obvious, and record each assumption. A
  security threat with one obvious fix is closed and reported. Anything that takes the design somewhere new, or is
  high risk with no obvious path, stops for the owner. Every such item goes into one numbered list in the handover.
- **The owner's walkthrough** comes after phase 5: setup from a fresh install, the Providers page, the admin
  area, models and lists, personal projects, a provider failing, billing profiles and the usage report. It is the
  unit's feedback loop, and its fixes are small lanes.
- **Landing:** the branch merges to `main` once, at the close, after the full regression and only on the owner's
  say-so. Nothing is pushed without it.
- **Documents** (this plan, decision records, the spec) are committed only with the owner's approval.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0042 (hq is the organisation's own), ADR-0096 (a conversation belongs to a place), ADR-0100 (leaving deactivates, erasing is separate), ADR-0107 and ADR-0109 (machine authority stays out of hq; the Fleet Console signs its commands), ADR-0110 (fleet admin is a role on hq accounts), ADR-0116 (a feature not ready ships behind a flag), ADR-0130 (Cloud features are gated by their own conditions), ADR-0133 and ADR-0135 (Cloud on a machine it runs), ADR-0134 (hq connects to Cloud by device approval). All are Accepted |
| **Implements** | New: providers are the organisation admin's, written through one module by three named actors. New: setup requires models and voice before the organisation is defined. New: every call is costed to a billing profile in an append-only ledger. New: the organisation's admin area is separate from its page. Amended: ADR-0134 (90-day rollover, with the client id fixed to the first key and each key named by `kid`, and Agenthix Cloud connected from hq by an organisation admin). Amended: ADR-0116 (the flag list returns, with `usageBilling`) |
| **Revisits** | ADR-0127 (who pays: the key order of project, person and organisation goes, replaced by one key per provider and billing profiles). ADR-0105 (a run's model access: a person's login now only in their own place, and personal keys go). ADR-0078 (an agent's runtime is a setting: it now follows the model). ADR-0122 (one embedding model per organisation: now always the built-in one). ADR-0125 (speech providers are organisation settings outside the model policy: now chosen per agent, with organisation defaults) |

## Key decisions

| Decision | Why |
|---|---|
| Contracts and the additive schema are committed in phase 1, before any lane | Four modules and the hosted service build against the same types, and many lanes need the same tables. One author for each avoids conflicting migrations and rewritten contracts |
| Not: each lane adds the tables it needs | Two lanes adding to one schema produce conflicting migrations, and the resolver, ledger and setup all need the provider and billing profile tables at once |
| The new providers live in `AiProvider`; today's `Provider` keeps only the web-search key | The web-search key is not an LLM, STT or TTS provider, and moving it is not this unit's work. A new table lets the old one be emptied of model and voice rows without touching search |
| A person's own Claude login is an `AiProvider` row owned by that person, not a separate table | The spec's provider holds an owner (the organisation, or one person's login), and the site already treats a subscription as a run credential. `SubscriptionGrant` moves to point at it |
| Old tables are removed in the lane that moves their callers | Removing them earlier breaks the build; removing them later leaves two sources of truth while lanes are still running |
| The site receives a provider descriptor per run, and keeps no provider table | hq is the only holder of keys (part 1). The relay already adds a key per request; it now reports usage and status too |
| hq's calls to Cloud's AI endpoints wait for the hosted side | The spec says so (part 6), and an untested call to an endpoint that does not exist would be written twice. The contract and a *not available yet* provider are built now |
| Not: a fake Cloud server, so the calls can be built now | It would test hq against our own guess of the hosted side, which the hosted side is still free to change within the typed contract |
| At most three building lanes at once | The machine has 24 GB, swap already in use and about 14 GB of free disk. Two earlier units exhausted memory with six lanes |
| No execution plans | No phase has steps that are the risk in themselves. The riskiest code (the provider store) is specified to the mechanism in the spec, so a capable lane can derive the steps |
| Providers in hq's admin area, setup in hq (D34, D35) | The owner, before phase 2: as a user, *fleet* means machines and model access belongs with the organisation's admin. Setup in hq needs no tunnel, no browser binding and no Fleet Console first run |
| Not: providers in the Fleet Console with a first run passed through hq | The earlier design. It split model choices from model supply across two tools, and needed the riskiest piece of the design, a tunnel through hq's public address, only to reach the Fleet Console before an account existed |

## Work breakdown

Six phases. The seams follow the spec's dependency order:
1. The contracts and tables everything builds on.
2. The provider store and the admin area that holds the new pages, which every later phase reads or draws into.
3. The resolver and setup, which both need the store but not each other.
4. The ledger, which needs the resolver's call ids and billing profiles.
5. Agenthix Cloud's provider entry, which needs all of the above.
6. The documents, records and QA contract, written against the code.

### Phase 1 — Contracts and tables
**Delivers:** every shared type the unit builds against in `core`, and every new table and column in hq's schema
with its migration, committed on the unit's branch. Nothing reads them yet.
**Starts when:** —
**Execution plan:** none — lanes. One Opus lane writes the contracts and the schema; the lead generates the migration.

- [x] 1.1 Provider types: types (LLM, STT, TTS), vendors, states (works, key refused, out of credit, unreachable, not available, disconnected), the model-via-provider reference
- [x] 1.2 The resolver's request and answer, and the problem it answers when something is missing
- [x] 1.3 Feature flags in `core` (ADR-0116), with `usageBilling`
- [x] 1.4 Ledger types (kinds, basis, purpose, price reference), the voice price table with its version, and the model catalogue's version
- [x] 1.5 The Agenthix Cloud AI contract in `core/src/cloud/ai.ts` (calls C1–C8, refusals X1–X5), with the Cloud protocol at 1.1
- [x] 1.6 Provider writes' actors (organisation admin, machine, Cloud's controller) and the `provider_not_working` notice kind
- [x] 1.7 Site protocol additions: a run's provider descriptor in place of `RunCredential`, `usage.report` with upstream status, and the request for hq's Cloud access token, with the minor version raised
- [x] 1.8 Client protocol: `public-identity` states the setup state
- [x] 1.9 hq schema, additive:
  - `AiProvider` and its record
  - `BillingProfile` and `UsageEntry`
  - `CloudUsageCursor`
  - `Org.timeZone`, `Project.billingProfileId` and `Project.personalSpace`
  - the organisation's model and voice defaults
  - an agent's own models and voice
  - model lists with entries

### Phase 2 — Providers, the admin area, personal projects
**Delivers:**
- The provider store, with its three writers, health, checks and the organisation admins' notification.
- `agenthix provider add|list|remove`.
- The `/admin` frame with every admin page moved under it, and the *Providers* page in it.
- Personal projects.

**Starts when:** phase 1 is merged.
**Execution plan:** none — lanes. Four lanes, at most three building at once:
- 2a, the provider store (Opus)
- 2c, the admin area (Sonnet)
- 2d, personal projects (Sonnet)
- 2b, the Providers page (Sonnet), dispatched once 2a and 2c have merged, since it sits in 2c's frame and calls
  2a's operations

They merge in the order 2a, 2c, 2d, 2b.

- [ ] 2.1 `providers/write.ts`: add, replace, rename, remove (refused when it would leave no LLM, STT or TTS provider), revoke. It checks keys with the vendor, encrypts them, records and announces every write, never reads a key back, and accepts only its three named actors
- [ ] 2.2 Vendor checks that cost nothing, for Anthropic, OpenAI, Google Gemini, OpenRouter, an OpenAI-compatible endpoint, AssemblyAI and Inworld
- [ ] 2.3 `providers/health.ts`: states S1–S5, the hourly and five-minute checks, and recovery
- [ ] 2.4 `provider_not_working` for organisation admins: what is down, what depends on it, and what new work moved to
- [ ] 2.5 The providers' operations for organisation admins: list, add, replace, rename, remove, revoke, check now
- [ ] 2.6 `agenthix provider add|list|remove` over hq's control socket, and the host command line
- [ ] 2.7 The hosted service's controller supplies Agenthix Cloud as a provider on a machine it runs
- [ ] 2.8 Remove `seedLlmApiKey` and reading a key from hq's environment
- [ ] 2.9 The *Providers* page in the admin area: the list with states, add, replace, rename, remove (showing what it touches), revoke, check now, and a custom endpoint's address always shown
- [ ] 2.11 The admin area's frame at `/admin`: its own menu, *Back to* the organisation, no docked conversation, and on a phone
- [ ] 2.12 *Manage* on the organisation's page, the role check on every `/admin` page, and the refusal a member sees
- [ ] 2.13 Settings, infrastructure, people, invitations, teams and agents' settings move under `/admin`, with redirects from their old addresses
- [ ] 2.14 The admin area's Overview: what needs an admin, and today's figures
- [ ] 2.15 Personal projects: several per person, `personalSpace` marking Your space, made by anyone, deleted by their owner, never shared
- [ ] 2.16 A personal project's own storage on the site that holds the person's storage, with its runs acting as the person
- [ ] 2.17 Personal projects listed with the other projects, marked *Only you*, and in Your space's overview, the switcher and the place picker
- [ ] 2.18 Erasing a person deletes every personal project and its storage; the erase dialog says how many

### Phase 3 — Routing and bootstrap
**Delivers:**
- One resolver for every call: defaults, an agent's models and voice, lists with patterns, a person's Claude
  subscription in their own place, and failures routed around.
- Every old decider, key form and table removed.
- Setup in hq, with models and voice required.

**Starts when:** phase 2 is merged.
**Execution plan:** none — lanes. 3a, the resolver and its server callers (Opus), and 3e, setup (Sonnet), run
first, in parallel. Once 3a merges, these run within three building lanes at a time:
- 3b, the site and relay (Opus)
- 3c, model settings and pickers (Sonnet)
- 3d, voice (Sonnet)

They merge in the order 3a, 3e, 3b, 3d, 3c.

- [ ] 3.1 The resolver: model via provider, the two defaults, the agent's own, the person's or task's instruction, lists that only narrow, the runtime that follows the model, and the cost basis
- [ ] 3.2 Lists with maker and family patterns, *Only these*, and a ban that beats an allow
- [ ] 3.3 Conversations, titles, summaries and compaction resolve through it
- [ ] 3.4 Dispatch, task runs, workers and helpers resolve through it
- [ ] 3.5 A person's own Claude subscription serves Claude models across their own place, and nowhere else
- [ ] 3.6 A provider that is not working is skipped for new work, and a conversation fixed to it gets the reason and one offer, which resends the message
- [ ] 3.7 Remove `ModelCredential`, `ModelPolicy`, the five deciders, per-conversation refused keys, the agent's single model and runtime, per-project model overrides, and every key form
- [ ] 3.8 Memory search always uses the built-in embedding model; remove the provider embedder
- [ ] 3.9 The site takes a run's provider descriptor; the relay adds the key, reads each answer's usage and upstream status, and sends `usage.report`
- [ ] 3.10 Claude Code's key helper and a subscription's login file work from the descriptor
- [ ] 3.11 *Models* in the admin area: the two model defaults, the two voice defaults, and the organisation's list
- [ ] 3.12 The list editor: patterns, *Only these*, how many models each entry covers, and selecting in bulk
- [ ] 3.13 An agent's own models, voice and list on its admin page
- [ ] 3.14 A project's list in its settings, and a person's list and Claude subscription in their settings
- [ ] 3.15 Every model picker has a search box, shows the model with its provider, and greys out a provider that is not working
- [ ] 3.16 Voice is chosen per agent: speech to text and text to speech resolve through the resolver, every agent has a voice, and the *Enable voice mode* switch goes
- [ ] 3.17 The voice sample phrase, the STT token and TTS calls use the resolved provider; the old voice settings page goes
- [ ] 3.18 hq's setup state (unclaimed, setting up, set up), stated in `public-identity`
- [ ] 3.19 Setup's steps: you; one choice, Agenthix Cloud or your own keys; for own keys, one model provider, then one speech-to-text and one text-to-speech provider; the organisation with its time zone and default billing profile; the last look
- [ ] 3.20 Resuming setup at the step it stopped at, after sign-in
- [ ] 3.21 What hq's address shows before setup is finished: no form without the link, an expired or used link, *almost ready*, and apps' *not set up yet*
- [ ] 3.22 Connecting Agenthix Cloud from hq, in setup and on *Providers*, by an organisation admin with the device approval, recorded and announced (ADR-0134 amended)

### Phase 4 — Billing and costing
**Delivers:** every call written to the ledger against a billing profile, with prices; billing profiles; the new
project's billing field; the usage report with its export.
**Starts when:** phase 3 is merged.
**Execution plan:** none — lanes. Two lanes, merged in this order: 4a, the ledger and its sources (Opus); then 4b,
the billing screens (Sonnet), cut from 4a once its operations exist.

- [ ] 4.1 The ledger writer: append-only, one `CALL` row per call id, `ACTUAL` and `CORRECTION` rows pointing at their call
- [ ] 4.2 hq's own calls write a row per step, failed calls that used tokens included
- [ ] 4.3 `usage.report` from the relay writes rows, delivered at least once and counted once
- [ ] 4.4 Claude Code on a person's own subscription writes one *included* row per run
- [ ] 4.5 Speech to text writes a row at the session's end; text to speech writes the characters sent
- [ ] 4.6 Prices: the catalogue's version in millionths, voice prices, *unpriced*, and *awaiting actual* for Agenthix Cloud
- [ ] 4.7 Billing profiles: made, renamed, archived (refused for the default or one in use), one default, and the organisation's time zone
- [ ] 4.8 A new project gets the default or its creator's pick; a later change is for organisation admins only, from the next call, recorded
- [ ] 4.9 The view of each call's cost; the report by profile, then project, agent and person; each currency and basis apart; months in the organisation's time zone
- [ ] 4.10 The streamed CSV export
- [ ] 4.11 Billing profiles and the usage report in the admin area, and the billing field in the new project form
- [ ] 4.12 Erasing a person keeps their rows, named *Former member*

### Phase 5 — Agenthix Cloud as a provider
**Delivers:** Agenthix Cloud in the provider store and the pickers as one provider of all three types, reading *not
available yet* until hq's calls are built (ADR-0130), and its line on the *Providers* page.
**Starts when:** phase 4 is merged.
**Execution plan:** none — lanes. One lane (Sonnet).

- [ ] 5.1 Connecting to Cloud adds the Agenthix Cloud provider, with no key; disconnecting marks it *disconnected*
- [ ] 5.2 While its calls are not built it reads *not available yet*: its models are never offered or made a default, and nobody is notified
- [ ] 5.3 Its line on the *Providers* page, with *Roll the key now* shown only once the rollover's calls are built
- [ ] 5.4 `CloudUsageCursor` kept with Cloud's organisation id across a disconnect

### Phase 6 — Documents, decision records, QA contract
**Delivers:** the documents describe the code as built; the decision records are written and amended; the QA
stories and scenarios exist, with their tests tagged.
**Starts when:** phase 5 is merged, and the owner's walkthrough has passed.
**Execution plan:** none — lanes. Documentation lanes split by area (Sonnet), each reviewed by the lead.

- [ ] 6.1 Concepts: providers, model choice and lists, voice, billing and the ledger, personal projects, the admin area, setup
- [ ] 6.2 Architecture: cloud-connection (the AI contract, the rollover, where Cloud is connected), deployment (setup), and the control channel (the provider descriptor, `usage.report`)
- [ ] 6.3 The user guide: install, finish setup, commands, models, voice, billing, personal projects, and the admin area's pages
- [ ] 6.4 The four new decision records, ADR-0134 and ADR-0116 amended, and ADR-0127, ADR-0105, ADR-0078, ADR-0122 and ADR-0125 superseded or amended where the work disproved them
- [ ] 6.5 The QA stories and scenarios for what this unit built, with the tests that cover them tagged

## Deviations

| Phase | What changed | Why |
|---|---|---|
| Phase 1 | The contract follows the repository's rules where the spec did not: gateway headers `X-Call-Id` and `X-Billing-Profile-Id` and the error field `cloud_error` (no product name); the site's usage reports and its request for hq's Cloud token are HTTPS calls, not channel frames; the key rollover's call is form-encoded like the other `/connect/*` calls; the price list's version is the OpenCode release; an agent's own models are a 1:1 table `AgentModelChoices`; `Org.timeZone` defaults to UTC. The spec was corrected in place | Found by lane 1 against the code: versioning forbids the product name on the wire, and hq answers no requests on the control channel |
| Before phase 2 | Providers moved to organisation admins in hq's admin area (D34); setup stays in hq, and the Fleet Console's first run and the first-run tunnel are removed (D35). Phase 2's lanes and phase 3's setup tasks rewritten; the spec's parts 1 and 2 corrected in place (`spec/bootstrap.md` became `spec/setup.md`) | The owner, before any provider code was written: simpler for a user, since *fleet* means machines and model access belongs with the organisation's admin |

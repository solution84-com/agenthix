---
name: Billing and costing
description: Part 5 of models from one place — every call costed to a billing profile in an append-only ledger, actual through Agenthix Cloud and estimated on the organisation's own keys; billing profiles and the usage report.
created: 2026-10-23
author: leang
---

# 5 · Billing and costing

Part of the [spec](../spec.md). **Status:** high-level design agreed; the ledger deep-dived. The screens and the report's layout are settled in the plan. The organisation's billing is
built in this unit; only reporting usage to Agenthix Cloud waits behind the `usageBilling` flag.

## Settled

- **From a call to a cost:** the resolver routes it (part 4); it is costed to the billing profile of its place; its
  usage is measured (tokens, seconds of audio, characters); it is priced; one ledger row is written.
- **The basis of every cost:** *actual* when Agenthix Cloud served it (its own figure, returned with the answer);
  *estimated* on the organisation's own keys (hq's price list times the usage); *included* on a person's own Claude subscription;
  *unpriced* for a model with no known price.
- **Billing profiles**, organisation admins', in the admin area: made, renamed and archived, never deleted. There is
  always a default, made in setup. A new project gets the default and works at once; its creator may pick
  another in the new project form, shown only when there are two or more. Later changes are organisation admins'
  only, from the next call, recorded. A person's own place and hq's own calls use the default.
- **The usage report**, in the admin area: cost by billing profile, project, agent and person, actual and estimated
  apart, exportable.
- **The eight rules the ledger is built on:**
  1. Money as whole millionths of a currency unit, with its currency; never a floating-point number.
  2. The ledger is append-only; a correction is a new row pointing at its call.
  3. One call id, made on the organisation's side and shared with Agenthix Cloud, used end to end. hq makes it for
     its own calls, and the site relay for an agent's. A retry reuses it, so a call is counted once. Cloud
     may keep its own internal id; hq never needs it.
  4. Each row names its price: the price list's version, or the provider's figure.
  5. A billing profile is archived, never deleted, and its id never reused; it survives backups, restores and moves.
  6. Rows in UTC; a month cut in the organisation's time zone (`Org.timeZone`, new; set in setup).
  7. A refusal for money (a provider's cap) is its own kind, with its own message.
  8. The contract with Agenthix Cloud in `core/src/cloud/`.
- **To Agenthix Cloud, behind `usageBilling`:** each call through it carries the billing profile's id and the call id;
  billing profiles' ids and names are sent to it; it reports the actual cost by call id afterwards, since answers stream. It learns the organisation, the billing
  profile and the usage, never projects, agents, people or conversations.
- **What hq adds to what it tracks today:** titles and summaries, agents' calls through the site relay, speech to text
  and text to speech, the price fixed when written, the billing profile and the basis.

## The ledger

- **`UsageEntry`, one row per model call:**
  - `id`
  - `at` (UTC, when the call ended)
  - `kind`: `CALL`; `ACTUAL`, Cloud's figure for an earlier call; or `CORRECTION`. Both of the last two point at the
    call through `refersTo`.
  - `callId`, unique for `CALL`, so a report that arrives twice counts once
  - `purpose`: conversation, worker, helper, title, summary, stt, tts or voice_sample
  - `providerId`, `providerName` as it was then, and `model`
  - usage: input, output, cache-read and cache-write tokens, `audioMs` and `characters`
  - `amountMicros` (BigInt) and `currency`
  - `basis`: actual, estimated, included, unpriced or awaiting actual
  - `priceRef`: `hq:<version>`, `cloud-catalogue:<version>` or `cloud-actual`
  - `billingProfileId`, required
  - nullable `projectId`, `agentId`, `userId`, `conversationId`, `runId` and `turnId`, none of them cascading, so
    deleting anything never deletes cost. An erased person's rows stay, named *Former member*, as erasing does today

  It is indexed on time, on profile and time, and on project and time.
- **`BillingProfile`:** `id` (never reused), `name` (unique among those not archived), `isDefault` (exactly one, by a
  partial unique index), `createdAt`, `createdBy` and `archivedAt`. `Project.billingProfileId` is required. Archiving
  is refused for the default and while projects use the profile.
- **How each source reports usage:**
  - **hq's own calls:** the AI SDK's usage for each step (`onStepFinish`), one row per model call, failed calls that
    used tokens included.
  - **An agent's calls through the site relay:** the relay reads the vendor's own usage from each streamed answer
    without changing it (Anthropic's `message_start` and `message_delta`, the OpenAI and OpenRouter final usage chunk,
    Gemini's `usageMetadata`). It sends usage reports to hq over HTTPS (`POST /api/v1/usage/report`, with the site's
    machine credential; hq answers with the call ids it kept), delivered at least once and kept on disk until hq
    acknowledges them. hq answers no requests on the control channel, so this is an HTTPS call like the site's other
    calls to hq. An answer with no usage is written unpriced and logged.
  - **Claude Code on a person's own subscription:** one row per run from the run's report, *included*.
  - **Speech to text:** a row at the voice session's end, its duration capped at the time from the token's issue to the
    session's close.
  - **Text to speech:** hq counts the characters it sent.
- **The price list:**
  - **Models on own keys:** today's catalogue in `core`, versioned by the OpenCode release it was generated from
    (`opencode-<version>`), converted to
    millionths of a dollar.
  - **Voice on own keys:** a hand-kept table, `core/src/models/voicePrices.ts`, with its own version, holding each
    vendor's public list price for the two voice models. It is an estimate, and the usage report says so: an
    account on a cheaper plan is billed less by the vendor, and no plan is asked for.
  - **Through Agenthix Cloud:** written *awaiting actual*, with Cloud's catalogue price shown as a guide. An `ACTUAL`
    row is appended when Cloud reports the call. With `usageBilling` off, the row is written *estimated* from Cloud's
    catalogue.
  - **Disconnected before the actuals came:** Cloud bills from its own meter, never from hq's ledger, so only hq's
    copy is left short. An admin's disconnect reads the actuals once more before revoking the key. Rows still
    waiting keep Cloud's catalogue price and read *awaiting Agenthix Cloud*. The cursor is kept with Cloud's
    organisation id (`CloudUsageCursor`), so reconnecting to the same Cloud organisation catches up.
  - **A model with no known price** is unpriced. There are no prices entered by hand.
- **The report:**
  - **A call's cost** is its latest row with an amount, from one database view.
  - **Months** are cut in `Org.timeZone`.
  - **Totals** are by profile, then project, agent or person, each currency and basis apart.
  - **The export** is a streamed CSV of one call cost per line.

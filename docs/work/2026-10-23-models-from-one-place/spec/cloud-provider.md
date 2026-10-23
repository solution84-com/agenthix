---
name: Agenthix Cloud as a provider
description: Part 6 of models from one place — the contract hq and the hosted service build to so that Agenthix Cloud is one more provider of models and voice; hq's calls are built when the hosted side is ready.
created: 2026-10-23
author: leang
---

# 6 · Agenthix Cloud as a provider

Part of the [spec](../spec.md). **Status:** high-level design agreed; the contract and the key rollover deep-dived. The contract is written in
`core/src/cloud/` during part 1; hq's calls behind it are built when the hosted side is ready, and until then the
provider says *not available yet* in its own words (ADR-0130).

## Settled

- **No key is handed to the organisation.** The provider stores no secret: it uses hq's existing connection to the
  hosted service (ADR-0134), whose private key never leaves hq.
- **A token scoped to AI.** hq signs a one-minute request with its own key for an access token that lasts about an
  hour, kept in memory only. The site relay asks hq for it over its existing channel for a container's calls.
- **Its catalogue.** hq asks for the models and voices it carries, with their prices, and refreshes them at each
  check-in; that is what pickers offer *via Agenthix Cloud*.
- **Voice.** Speech to text: a single-use token for the browser, which still streams to the speech service itself.
  Text to speech: a single-use token per reply, with hq still pacing and timing speech.
- **Models through its gateway**, which speaks each vendor's own API, so Claude Code and OpenCode need no change. An
  hq the hosted service runs works exactly like a connected self-hosted one: through the gateway, with no
  provider key on any hq. Model vendors offer no short-lived credential for chat from one account; voice vendors do,
  which is why voice uses minted tokens and models the gateway.
- **Costs.** Each call carries the billing profile and call id (behind `usageBilling`); Cloud reports the
  actual cost by call id afterwards (part 5), since answers stream and the cost is known only at their end.
- **hq's identity key rolls over** automatically every 90 days, registered with the current key, with a short
  overlap; an admin can roll it at once from the Fleet Console.
- **Off, or disconnected:** no new tokens; conversations on its models are offered another; defaults naming it fall to
  the next allowed.
- **Reaching the Fleet Console remotely** through the hosted service's relay, for a self-hosted machine connected to
  it, uses the same guards as its remote access today.

## The contract

Typed in `core/src/cloud/ai.ts`, checked by the same parsers on both sides. These are additions, so the Cloud protocol
moves from 1.0 to 1.1.

- **Token:** `POST /connect/token` with the scope `ai`, signed as today. It gives an access token of an hour at most,
  kept in memory. The site relay asks hq for it over the site channel.
- **Catalogue:** `GET /ai/catalogue`, with `If-None-Match`, at each check-in. It answers
  `{version, currency, models, stt, tts}`, each with prices in millionths: per million tokens, per hour of audio and
  per million characters. TTS entries also carry their voices.
- **Gateway:** `/ai/v1/anthropic/…` and `/ai/v1/openai/…`, each vendor's own API unchanged, with the token as
  `Authorization: Bearer` or `x-api-key`. With `usageBilling` on, calls also carry `X-Agenthix-Call-Id` and
  `X-Agenthix-Billing-Profile`.
- **Voice:** `POST /ai/voice/stt-token` and `/ai/voice/tts-token` answer `{token, url, expiresAt}`, each good for one
  session or one reply.
- **Actual costs:** `GET /ai/usage?after=<cursor>` (with `usageBilling`) answers `{entries: [{callId, at, amountMicros,
  currency}], next}`, at most 500 at a time. It is read at each check-in, and when the usage report opens, at most once
  a minute. An entry for an unknown call is logged and kept apart. Cloud answers an entry for as
  long as it keeps its own billing record of that call, so what hq can see always matches what Cloud billed. An hq
  that was down or disconnected catches up when it reconnects to the same Cloud organisation. An admin's disconnect reads them once more first.
- **Billing profiles:** `PUT /billing/profiles/:id {name, archived}` (with `usageBilling`) when a profile is made,
  renamed or archived, and for all of them after reconnecting.
- **Refusals:**
  - `not_available`: `invalid_scope` at the token, `403` elsewhere. The provider reads *not available yet*, and hq
    asks again at the next check-in.
  - `cap_reached`: `402` with `{scope: organisation | billing_profile, resetsAt}`. Through the gateway it comes inside
    the vendor's own error shape, with an `agenthix_error` field. It is a refusal of its own (part 5's rule 7), with its
    own words. Otherwise it is handled like any provider that refuses: any allowed model another provider reaches
    stays available.
  - `disconnected`: `invalid_client`, handled as today.
  - `model_not_offered`: `404`. hq refreshes the catalogue at once.
  - `429` and `426` are handled as today.

## The key rollover

- At a check-in once the key is 90 days old, or from *Roll the key now* in the Fleet Console.
- hq stores the new Ed25519 key, marked *pending*, **before** it asks Cloud. A crash leaves either a pending key to
  register again, or nothing changed.
- `POST /connect/keys` carries hq's usual assertion signed with the current key, the new public key, and a one-minute
  proof signed with the new key over the client id and a fresh `jti`. Registering the same key again is answered as
  done.
- From Cloud's answer, hq signs with the new key. Each assertion names its key by `kid`, the RFC 7638 thumbprint. Cloud
  accepts the old key for 24 hours, or for none with `retireOldNow` after a suspected leak, and hq then destroys it.
- Cloud away: the old key stays, and hq tries again at the next check-in. A key never expires by itself.
- **The client id stays the thumbprint of the first key** for the life of the connection, so Cloud's records of the hq
  don't break every 90 days. Connecting again still makes a new key and a new client id. This amends ADR-0134.

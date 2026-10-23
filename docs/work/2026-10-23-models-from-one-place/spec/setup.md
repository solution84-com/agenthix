---
name: Setup
description: Part 2 of models from one place — one setup flow in hq, opened from the installer's setup link: the first account, then models and voice (required), then the organisation.
created: 2026-10-23
author: leang
---

# 2 · Setup

Part of the [spec](../spec.md). **Status:** high-level design agreed, revised by the owner on 2026-10-23: setup stays in
hq as one flow. An earlier version made the Fleet Console the bootstrap and passed its first run through hq; that went
when providers became the organisation admin's (part 1). The detail is settled in the plan.

## Settled

- **One setup, in hq, opened from the installer's setup link, as today.**
  - The link is today's `Invite` of kind `FIRST_ADMIN`: only its hash is stored, it lasts 24 hours, and a new one
    withdraws the last.
  - The installer prints it, and `agenthix hq invite-admin` on hq's machine makes a new one.
  - It is spent the moment the first account is made, so it needs no binding to a browser.
- **The steps, one person straight through, kept short (owner):**
  1. **You:** the first account. It holds both admin roles, as today (ADR-0110).
  2. **How your agents reach AI:** one choice.
     - **Agenthix Cloud:** connect with today's device approval, a short code approved at Agenthix Cloud. It covers
       models and voice, so setup goes straight on to step 5.
     - **Your own keys:** steps 3 and 4 follow.
     - While Agenthix Cloud's models and voice are not available yet (part 6, ADR-0130), its card says so and cannot
       be chosen, and own keys is the way through.
  3. **Your model provider** (own keys only): one vendor and its key, checked with the vendor.
  4. **Voice** (own keys only): one speech-to-text and one text-to-speech provider, each with its key, checked.
     Voice is not optional.
  5. **Your organisation:** name, picture, cover and time zone. The default billing profile is made, named after the
     organisation (part 5).
  6. **Last look:** the organisation's four defaults, chosen by setup from what was added and each changeable here:
     the conversation and worker models (the provider's recommended ones), the voice (Inworld TTS 2 speaking as
     Alistair, with a preview) and listening (AssemblyAI's Universal-3 Pro realtime); and the first agent, Kernel,
     speaking as that voice. Setup writes the defaults when it finishes, so a new organisation never runs on the
     resolver's last-resort fallback.

  One provider of each is enough to finish. More, and any mix with Agenthix Cloud, are added afterwards on
  *Providers* in the admin area. Every provider written in setup goes through the provider store with the actor
  *organisation admin* (part 1).
- **hq's setup state**, derived and never stored:
  - *unclaimed*: no user
  - *setting up*: a first account, and setup not finished
  - *set up*: `Org.setupCompletedAt` is set, which needs providers that reach an LLM, an STT and a TTS

  It decides what hq's address serves, and `public-identity` states it, so apps say so before sign-in.
- **What hq's address shows before setup is finished:**
  - **Opened without the link:** a holding page with the command to get a new link, and no form.
  - **An expired or used link:** says so, with the same command.
  - **Setting up:** *almost ready* to visitors. The first person signs in and goes back to the step they stopped
    at.
  - **Apps** say *not set up yet*.
- **Agenthix Cloud is connected from hq**, in setup and from *Providers*, by an organisation admin, with today's
  device approval. Every connection is recorded and announced to every organisation admin. This amends ADR-0134, which
  had connecting only on the Fleet Console's own machine (owner, 2026-10-23). The account exists first, so nothing
  is approved before an account.
- **On a machine the hosted service runs:** its controller supplies Agenthix Cloud as a provider through the machine
  path (part 1). The person arrives by Cloud's admin link (ADR-0133), and steps 2 to 4 are already complete.
- **Removed from the earlier design:** the Fleet Console's first run, the first-run tunnel, binding the link to a
  browser, and the console link's first-run methods.

## Left to the plan

The setup state's checks on each request, resuming at the right step, the guide's install and finish-setup pages,
and the tests that an unclaimed hq offers no form without the link.

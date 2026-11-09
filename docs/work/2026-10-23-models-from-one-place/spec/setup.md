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
- **The steps, one person straight through, kept short (owner; the order and the AI step since ADR-0160 and the one-key unit):**
  1. **You:** the first account. It holds both admin roles, as today (ADR-0110).
  2. **Your organisation:** name, picture, cover and time zone. The default billing profile is made, named after the
     organisation (part 5).
  3. **AI:** one screen. A list of the organisation's providers, one *Add a provider* pop-up (the same dialog as
     *Providers* in the admin area) that lists every vendor, each with what it covers, and Agenthix Cloud as an entry
     (connected with today's device approval, a short code approved at Agenthix Cloud; while its models and voice are not
     available yet, part 6 and ADR-0130, it says so and cannot be chosen). Each vendor's key form carries a short guide to
     getting the key. Below the list, *What agents use*: the model, hearing and speaking, chosen by setup from what was
     added (the newest model of a named family, ADR-0184) and each changeable here. *Skip for now* is never blocked
     (ADR-0160).
  4. **Last look:** what was set, with a way back to each; one AI row saying what works and what is not set; the first
     agent, Kernel, speaking as the default voice when there is one. Setup writes the defaults when it finishes, so a new
     organisation that added providers never runs on the resolver's last-resort fallback.

  Any number of providers, or none, is enough to finish. More, and any mix with Agenthix Cloud, are added afterwards on
  *Providers* in the admin area. Every provider written in setup goes through the provider store with the actor
  *organisation admin* (part 1). The screens are drawn in the one-key unit's design board.
- **hq's setup state**, derived and never stored:
  - *unclaimed*: no user
  - *setting up*: a first account, and setup not finished
  - *set up*: `Org.setupCompletedAt` is set; it needs no provider (ADR-0160)

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
  path (part 1). The person arrives by Cloud's admin link (ADR-0133), and its steps are already complete.
- **Removed from the earlier design:** the Fleet Console's first run, the first-run tunnel, binding the link to a
  browser, and the console link's first-run methods.

## Left to the plan

The setup state's checks on each request, resuming at the right step, the guide's install and finish-setup pages,
and the tests that an unclaimed hq offers no form without the link.

---
name: Bootstrap and onboarding
description: Part 2 of models from one place — the Fleet Console as the bootstrap of a self-hosted install; onboarding 1 defines HQ, models and voice first; onboarding 2 defines the organisation in hq; hq runs unclaimed until then.
created: 2026-10-23
author: leang
---

# 2 · Bootstrap and onboarding

Part of the [spec](../spec.md). **Status:** high-level design agreed; the first-run tunnel deep-dived. The rest is settled in the plan.

## Settled

- **Two onboardings.** *Defining HQ* is the fleet admin's, in the Fleet Console, first. *Defining the organisation* is
  the organisation admin's, in hq, after. hq is never used before it is defined.
- **Onboarding 1, in the Fleet Console:**
  1. **Models and voice**, first and required: connect Agenthix Cloud, or add an LLM, an STT and a TTS provider. No
     way past without all three.
  2. **You**: the first account, made in hq through the console link, accepted only while hq is unclaimed and only
     with the install's one-time token. It holds both admin roles, as today, and goes straight on to onboarding 2.
- **Onboarding 2, in hq:** the organisation's name, picture and cover; then a last look that says where models and
  voice come from and who supplied them.
- **hq's claim state**, derived and never stored: *unclaimed* (no user), *HQ defined* (a first account and a complete
  set of providers), *organisation defined* (setup finished). It decides what hq's address serves and what hq accepts,
  and is stated in `public-identity` so apps say so before sign-in.
- **The installer** prints the Fleet Console's first-run link instead of hq's setup link.
- **Reaching the first run from another computer:** while unclaimed, hq's address passes `/first-run/` requests
  to the Fleet Console as frames on the console link it already holds. Only first-run routes, only with a session hq
  vouched for, closed for good once the first account exists. The Fleet Console's own guards on `127.0.0.1` are
  unchanged.
- **The link is bound to the first browser** that opens it; another browser is told setup is under way.
  `agenthix hq invite-admin` withdraws it and cancels a first run under way.
- **What hq's address shows before it is defined:** a holding page with the command to get a new link (no form); the
  expired, used and other-browser cases; *almost ready* once HQ is defined but the organisation is not, with sign-in for the first person, which resumes
  onboarding 2.
- **Agenthix Cloud at bootstrap:** the first run may connect it before any account exists; the first-run session
  approves on hq's side (ADR-0134 amended). On a machine the hosted service runs, it does onboarding 1 itself.

## The first-run tunnel

Every first-run write lands in hq: the providers, the Cloud connection and the first account. hq vouching for the
session is therefore enough. The Fleet Console holds nothing here that hq could misuse, and no host command or sealed
envelope can be reached through the tunnel.

- **The link.** It is issued as today (`issueFirstAdminLink`, at a start with no users and on `agenthix hq invite-admin`,
  which the installer calls). While hq is unclaimed it is `https://<hq>/first-run/<token>`. A link Agenthix Cloud asks
  for (ADR-0133) stays an `/invite/` link.
- **Opening it.** hq answers `GET /first-run/<token>` itself. Whatever is not unclaimed is sent to `/`. A token that
  matches no open invite gets *expired*, *used* or *replaced*. The first browser binds the link; any other gets
  *setup under way*.
- **The session.** It is 32 random bytes, and only its SHA-256 is stored, on the invite (`boundSessionHash`,
  `boundAt`). The cookie is `first_run`: `HttpOnly`, `Secure` wherever hq is on https, `SameSite=Lax`,
  `Path=/first-run`. `Lax`, because the link is opened from another app. The answer is a 303 to `/first-run/`, which
  takes the token out of the address bar, with `Referrer-Policy: no-referrer`. The session lasts as long as the link
  does: until its 24 hours end, a new link replaces it, or the account is made. It has no idle timeout.
- **hq's gateway** (`hq/src/fleet/firstRun/gateway.ts`; `hq-web` adds `/first-run` to its server paths). Every request
  must pass all of these before anything goes on:
  - the claim state is unclaimed
  - the cookie matches the binding
  - the method is GET, HEAD or POST, and a POST is JSON from hq's own origin
  - the normalised path is under `/first-run/`, at most 512 characters, with no traversal
  - the query is at most 2 KB and the body at most 64 KB
  - at most 8 requests are in flight per session

  While the Fleet Console's link is down, hq answers *setup will continue in a moment*, a page that retries by
  itself.
- **The frames on the console link**, the first that hq sends the Fleet Console unasked:
  - `firstRun.request {method, path, query, contentType, body, inviteId}`. No cookie, credential, client address or
    other header crosses.
  - `firstRun.response {status, contentType, cacheControl, location?, body, more}`, then `firstRun.chunk` frames of at
    most 512 KB.

  hq passes on only those four headers, and a `location` only when it stays under `/first-run/`. It sets its own
  security headers: the Fleet Console's content security policy, `no-store`, `nosniff` and `no-referrer`. A request
  with no answer after 30 seconds gets a 504.
- **In the Fleet Console**, a first-run router (`console/src/firstRun/`) is reached only by those frames, never by its
  HTTP listener, whose guards do not change. Its routes are fixed: the first-run screens (a second `console-web` entry
  with the base `/first-run/`) and an API whose routes each call one console-link method. On `127.0.0.1:4300` before
  HQ is defined, the Fleet Console says to open the installer's link. There is no first run on the loopback.
- **hq's methods.** `firstRun.state`, `firstRun.providers.add|remove`, `firstRun.cloud.start|status` and
  `firstRun.account`. Each refuses `not_unclaimed` outside the unclaimed state, and `link_withdrawn` unless the
  `inviteId` is the open, bound invite. `firstRun.account` runs in one transaction under `lockFirstAdmin`. It refuses
  `providers_incomplete` unless the providers cover an LLM, an STT and a TTS. It makes the user with both admin roles,
  marks the invite consumed, and records the first account against everything this first run made.
- **Going on into hq without a second sign-in.** hq's `/setup` page posts once to `POST /first-run/continue`, which hq
  answers itself. It works with the bound cookie only, within 10 minutes of the account and only once (`continuedAt`).
  hq makes the session with the `makeSession` used by signing in with an Agenthix account, and the page keeps it with
  `setSessionId`. On any failure the person gets sign-in with their username filled in.
- **What a withdrawn first run leaves.** The providers it added and the Cloud connection stay, and the next first run
  starts from them. Their records read *added during setup, before the first account*.
- **Tests that prove the tunnel closed:**
  - With a user in the database, no `/first-run/*` path sends a frame.
  - No frame is sent without the bound cookie, or for a withdrawn or expired invite.
  - Every method refuses outside the unclaimed state.
  - A path outside the route table, a traversal or an oversized body is refused.
  - A response's other headers never reach the browser.
  - A cross-origin POST is refused.
  - The Fleet Console's HTTP app has no first-run routes.
  - Continue works once.
  - In the cross-app suite and the install test: link → providers → account → onboarding 2, and then the tunnel is
    closed.
- **The guide.** `install.md`: the setup link, models and voice first, `invite-admin` for a lost link or to cancel
  someone else's setup. `finish-setup.md`: the organisation only. `commands.md`: what `hq invite-admin` does before
  setup.

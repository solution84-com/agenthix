---
name: What agents can do — plan
description: The phases of the what-agents-can-do unit, from the shared capability list and provider card to setup, the one AI page, the missing-key run path and the guide, then the walk.
created: 2026-11-14
---

# What agents can do — plan

**Status:** approved by the owner on 14 Nov. Adjusted from the code on 14 Nov: the web search key block is
`hq/src/model-access/pages/WebSearchKeyBlock.tsx`; the board is committed under `boards/`.

## Goal

Setup and Settings show the same **What agents can do** list: Thinking, Hearing, Speaking and Web search, each with a
tick, worded by runtime. Web search for OpenCode is set up with an Exa key in that list. Providers and Models become
one AI page, and an OpenCode run without a key isn't offered a search tool that can't work. See the [spec](spec.md).

**In scope:**
- the capability list and the provider card core, shared;
- setup's AI and review steps;
- the AI page, its redirects and the menu;
- the renamed words, on the organisation's page and on an agent's own models;
- the missing-key run path and its model check;
- the guide and its screenshots.

**Out of scope:** search providers other than Exa; OpenAI's or Google's own runtimes; a person's Claude subscription
screen; Agenthix Cloud as a search provider.

## Size

**Large, about the size of the one-key unit.** Setup alone would be small; making Settings consistent is most of it.
The screens it rebuilds or merges are about 80 source files and 4,500 lines today (`hq/src/providers/` 24 files,
`models-settings/` 35, `model-access/` 11, setup's steps 12), with 36 test files beside them; 14 files link to the
pages that move, and 43 carry "Voice" or "Listening", each to be checked (not all are these screens). Five lanes, two
pairs of them in parallel, then the guide's rewrite and new screenshots, a usability review and the owner's walk.

## Approach

**The shared pieces go first, as one lane**, so setup and Settings are built on the same list and card rather than two
copies:
- the function that computes the capability list (marks and lines) from providers, defaults and the key status,
  unit-tested over every case in the spec's table;
- the `WhatAgentsCanDo` component;
- the provider card core with the runtime line;
- the one word map;
- the "Web search for OpenCode" pop-up, made from `WebSearchKeyBlock` (`hq/src/model-access/pages/`).

**Then setup and the AI page, as two lanes.**
- Setup touches `hq/src/setup/`.
- The AI page touches `hq/src/providers/`, `hq/src/models-settings/`, `hq/src/model-access/`, `hq/src/admin/` and the
  links into them. They are file-disjoint, so they can run at once.

**The missing-key run path is its own lane from the start.** It touches the site (`site/src/server/mcp/`) and the
instructions hq builds for an OpenCode run, not the screens, so it doesn't wait for the shared pieces. The spec's open point,
the tool list a harness keeps across a conversation's runs, is settled: the tool is hidden by the turn's OpenCode
session rules, which are brought up to date at every turn.

**The guide goes last**, once the screens are final, with new recipes run by the shared capture script.

**A usability review at the end of the build**, making things fail on purpose:
- a refused key;
- a provider that stops working while the page is open;
- HQ not answering;
- an OpenCode agent asked to search with no key.

Then the owner walks it.

### How the work is carried out

- **Lanes**: one purpose, one agent, one branch and worktree each, briefed from this plan and the
  spec. Each lane lands as one commit onto the unit's branch, one at a time.
- **Order:**
  1. Lane A, the shared pieces, and lane D, the run path, start together.
  2. Lanes B (setup) and C (the AI page) start when lane A has landed.
  3. Lane E, the guide, starts when B and C have landed.
- **The lead runs the suites lanes may not** (integration, cross-app, the full regression) once lanes are combined.
  Lanes run the typecheck and the tests of what they changed.
- **Resource strategy** (in every brief): at most the machine's limit of hq and site pairs at once; heavy commands
  through the machine-wide lock; the reviewer pauses before the builders when memory runs short.
- **The branch** is `feature/what-agents-can-do`, from `main` after `0.1.0-alpha.4`.
  - At the close it is regrouped by feature and merged to `main` with `--no-ff`, on the owner's say-so.
  - Before the merge it is backed up, and the tree is checked identical.
  - Nothing is pushed without the owner.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0160 (setup never blocks on AI) |
| **Implements** | None new expected; see the spec's *Decision records* for when one is written |
| **Revisits** | None |

## Key decisions

| Decision | Why |
|---|---|
| One capability list and one card core for setup and Settings | The owner wants one experience; two copies drift, which is how today's different words came about |
| Wording by runtime, never by provider | The runtime decides search; it scales to OpenAI's and Google's runtimes without new words |
| Web search in the list, behind Add a key | It reuses today's key storage untouched; it sits where people look for what agents can do |
| One AI page in setup's order | The accounts and the choices are always used together; setup already shows them as one |
| No search tool without a key | The agent explains instead of failing mid-run |
| Against: Exa as a provider | A new provider kind, and a move of the key's storage, before launch |
| Against: keeping Providers and Models apart | Every visit to Models starts with a trip to Providers |
| Against: an execution plan for any phase | Lanes from this plan and the spec; no data migration or risky refactoring |

## Work breakdown

Five phases. The seams:
- the shared pieces must exist before either screen uses them;
- the run path is independent of the screens;
- the guide needs the final screens;
- the walk needs everything.

### Phase 1 — Opened and planned
**Delivers:** the unit's folder in `docs/work/`, its branch, the spec and this plan committed, the boards moved in, and
the owner's approval.
**Starts when:** `v0.1.0-alpha.4` is released.
**Execution plan:** none.

- [x] 1.1 `docs/work/2026-11-14-what-agents-can-do/`, with its README, spec, plan and board, on `feature/what-agents-can-do`
- [x] 1.2 The plan adjusted from what the code holds

### Phase 2 — The shared pieces, and the run path
**Delivers:** the capability list, its component, the provider card core, the word map and the key pop-up; and the run
path: no `web_search` without a key, the instructions line, and the model check.
**Starts when:** the plan is approved.
**Execution plan:** none — lanes A and D.

- [x] 2.1 Lane A: the capability list function, with unit tests over the spec's table
- [x] 2.2 Lane A: `WhatAgentsCanDo`, the provider card core with the runtime line, and the one word map
- [x] 2.3 Lane A: the "Web search for OpenCode" pop-up, from `WebSearchKeyBlock` (`hq/src/model-access/pages/`), saving through `setWebSearchKey`
- [x] 2.4 The open point on a harness's kept tool list, settled while planning and written into the spec (section 4):
      hidden by the turn's session rules, re-synced every turn
- [x] 2.5 Whether an Anthropic account can turn Claude's own search off: it can (Claude Console › Capabilities, on by
      default); HQ doesn't check, the guide says so (spec, decision 2 and section 5)
- [x] 2.6 Lane D: `web_search` hidden from an OpenCode turn with no key by its session rules, and still refused when
      called without one; tests for with, without, a key added and removed between turns, and Claude Code
- [x] 2.7 Lane D: the instructions line for a run with no key, and its model check on the baseline model

### Phase 3 — Setup and the AI page
**Delivers:** setup's AI and review steps on the list; the AI page with its three sections, redirects and menu; the
renamed words everywhere.
**Starts when:** lane A has landed.
**Execution plan:** none — lanes B and C.

- [x] 3.1 Lane B: setup's AI step on *What agents can do*, with its new lead line; Continue and Skip unchanged
- [x] 3.2 Lane B: the review step's AI section as the short list
- [x] 3.3 Lane C: the AI page at `/admin/ai`: Your providers (the full line, with the runtime), What agents can do, Which models may run (folded)
- [x] 3.4 Lane C: the redirects (`/admin/providers`, `/admin/models`, `/admin/settings/model-access`), the menu, and the links that open a provider's line
- [x] 3.5 Lane C: the web search Settings page and its entry removed; Voice and Listening renamed on an agent's own models
- [x] 3.6 The words check: no "Voice", "Listening", "LLM", "STT" or "TTS" left on these screens, held by the design guard if it can

### Phase 4 — The guide
**Delivers:** the guide describes setup's list and the one AI page, with new screenshots.
**Starts when:** lanes B and C have landed.
**Execution plan:** none — lane E.

- [x] 4.1 `providers.md` and `models.md` rewritten for the AI page; *Web search for OpenCode agents* folded into it; links into the guide kept or redirected
- [x] 4.2 `setup-hq.md` on the AI step's list; the Web search description says where Anthropic's own search is
      switched off, and that Anthropic bills each search
- [x] 4.3 New screenshot recipes for setup's AI step and the AI page, run by `scripts/guide/capture.mjs`

### Phase 5 — Verify and close
**Delivers:** proof that the screens and the run path match the spec, the owner's acceptance, and the merge.
**Starts when:** every lane has landed and the lead's suites pass.
**Execution plan:** none.

- [x] 5.1 The usability review, making things fail on purpose, against the spec
- [x] 5.2 Critical and Should fix findings fixed, at most two rounds; what remains is raised as issues
- [x] 5.2b Lane H: the owner's three decisions (key checked with Exa, ! for a stopped provider's default, failure words for all of hq)
- [x] 5.2c Lane I: one-line providers that open in place (setup and the AI page); What agents can do first on the AI page
- [x] 5.3 **The owner walks it:** setup with no key, adding one in setup and on the AI page, an OpenCode agent asked to search before and after
- [x] 5.3b Lane J: every failed press and read in hq says what happened in words; lane K: the guide and its recipes; lanes L and M: the walk's findings W1 and W2

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 3 | The words check is rendered-text tests on the AI page and an agent's models, not a design-guard rule | The guard has no per-path rule; a rule for four folders would need one, for a check the tests already hold |
| 3 | Lane F added: hq's own sentences (agent-facing errors, setup's hints, model-check text) renamed to *Manage organisation › AI* | Lane C found them outside its files |
| 5 | Owner's decisions after the screenshot scan: the Exa key checked with Exa on save; a stopped provider's default marked ! with Open its provider; one shared helper so every failure dialog in hq says "HQ did not answer." — built in lane H | Found by the usability review, left for the owner |
| 5 | The AI page puts What agents can do first, and providers become one line each that opens in place, in setup and on the AI page — lane I, after lane H | The owner found the list of providers pushed the summary out of view (board ai-page-scroll v2, option A + 2a) |
| 5 | Thinking's Change on the AI page is a text action like Hearing's and Speaking's (owner, after the screenshot board) | It was the model picker's chip, which read as a different kind of action in one list |
| 5 | The owner's walk was cut to two steps (a real Exa key; an agent asked to search), with the keyboard check by the lead | The screenshot board already showed every screen and state; only what it faked was left to walk |
| 5 | Walk finding W1, lane L: a conversation's reply is told whether its background work can search and hands a web lookup to it, or says why not (decision 10) | The reply is HQ's own turn with no web search, and told the person it couldn't reach the web |
| 5 | Walk finding W2, lane M: web tools default to Ask; the reply, the run and the Web search help say when an agent's tools withhold search (decision 9) | Every agent defaulted to Never, so no agent could search however the key was set, and the run blamed the key |
| 1, 2, 4 | None | — |

## Closing note (14 Nov 2026)

- **Accepted** by the owner after a short walk on the dev stack (a real Exa key saved; an agent asked to search in a
  conversation, approved, and searched through Exa), with the screenshot board scanned and spot-checked before it.
- **Open items:** 30 closed in the unit with evidence (the triage, and the full regression for the two end-to-end
  specs never run and a channel test once unreliable). Deferred as issues, none critical and none blocking a release:
  agenthix#277–#289. Found alongside and raised: agenthix#276 (pictures not cached on a remote HQ); a conversation's
  reply searching the web itself is planned separately.
- **Full regression** on the branch rebased onto main: 37 steps, all passing after one fix (an import in a core test).
- **QA:** the unit's stories and scenarios are written (US-491–US-495, SC-2135–SC-2159) and their tests tagged; stale
  scenarios naming the old Providers and Models pages are corrected. No QA audit ran: these entries await the audit
  before `v0.1.0`.
- **Decision records:** ADR-0160 (setup never blocks on AI) still holds, and the unit kept it: Web search never blocks
  setup. No record was created.
- The release that ships this is `0.1.0-alpha.5`, cut separately after the merge.

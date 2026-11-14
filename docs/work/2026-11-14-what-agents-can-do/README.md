---
created: 2026-11-14
description: What agents can do — web search set up in setup's AI step, one list of what agents can do in setup and Settings, Providers and Models as one AI page, and no search tool for an OpenCode run without a key.
---

# What agents can do

**Initiative**, on `feature/what-agents-can-do` from `main`. The design is agreed with the owner; the
[spec](spec.md) holds it and the [plan](plan.md) has the phases. The settled board is
[`boards/what-agents-can-do.html`](boards/what-agents-can-do.html): its A3 page is the reference for the capability
list, S5 for the AI page.

## Why

- Agents on Claude Code (an Anthropic key, or a person's Claude subscription) search the web with Claude's own search.
- Agents on OpenCode search only through the platform's `web_search` tool, which the site sends to Exa with the
  organisation's key. That covers OpenAI, Google, OpenRouter, Inworld and an organisation's own endpoint.
- Setup never asks for that key. Without it, OpenCode agents still see `web_search`, and the call fails with "Web
  search is not set up for this organisation: it has no search key." A person sees a failure, not a setup step.
- Setup and Settings say the same things in different words, and Settings spreads them over three pages.

## Objectives

1. **Setup and Settings show one list, *What agents can do*:** Thinking, Hearing, Speaking and Web search, each with
   its mark, worded by runtime, built from one component and one provider-card core.
2. **Web search for OpenCode is set up from that list**, with an Exa key saved through today's key storage, and never
   blocks setup.
3. **Providers and Models are one AI page**, with the old addresses redirected and the web search Settings page gone.
4. **An OpenCode run without a key is not offered `web_search`**, and the agent says why when asked to search.
5. **The guide describes the new screens**, with new screenshots.

## What exists

- Key storage and admin screen: `hq/src/model-access/` (`pages/WebSearchKeyBlock.tsx`, `webSearchKeyActions.ts`,
  `webSearchKeyQueries.ts`), reached from Settings › Access to models and tools › Web search.
- The tool: `site/src/server/mcp/siteTools.ts` (`web_search`, registered for OpenCode only) and
  `site/src/server/search/webSearch.ts` (Exa, behind `WebSearchService`).
- The key reaches a run in `hq/src/agents/runContext.ts`, for OpenCode runs only.
- The runtime choice: `hq/src/routing/modelKeys.ts` › `runtimeFor`.
- Setup's AI step: `hq/src/setup/pages/steps/AiStep.tsx`, `AgentsUse.tsx`, `ReviewStep.tsx`.
- Provider words: `hq/src/providers/components/providerWords.ts`.
- OpenCode's own Exa search stays off: `OPENCODE_ENABLE_EXA` is in `FORBIDDEN_SERVER_ENV`.
- The guide: `docs/guide/your-tools/models.md` › *Web search for OpenCode agents*, and `providers.md`.

## Decisions (owner, 14 Nov 2026)

| # | Decision |
|---|---|
| D1 | Web search goes in setup's AI step, in the list of defaults, not as a provider or a section of its own |
| W2 | "What agents use" becomes **What agents can do**: Thinking (was Model), Hearing, Speaking, Web search, each with a mark: ✓ agents can do it; ○ a provider would add it (a note, never a fault); ! only some agents can |
| W1 | Wording is by runtime, never by provider: each provider card says which runtime its models run on; under Web search, one line per runtime in use |
| D2 | Web search is always in the list: ○ "Comes with your first model provider" before any model provider is added |
| A2 | **Add a key** opens a pop-up, "Web search for OpenCode": one field, a link to Exa's key page, Not now / Save key, saved through today's `setWebSearchKey`; a refused key is said under the field; setup is never blocked |
| D4 | The review step's AI section shows the same list |
| S1 | Settings is made consistent with setup in this unit: one component, one provider-card core, the same words (Thinking, Hearing, Speaking, Web search) |
| S2 | One AI page replaces Providers and Models; the menu becomes *Models and billing › AI · Billing profiles · Usage*; the old addresses redirect; the web search Settings page goes |
| D3 | An OpenCode run with no key isn't offered `web_search`, and its instructions say so; keeping the tool with an error was rejected |

---
created: 2026-11-14
description: What agents can do — setup's AI step and one AI page in Settings show Thinking, Hearing, Speaking and Web search with a tick each, worded by runtime; web search for OpenCode is set up with an Exa key in the same place; an OpenCode run without a key is not offered the search tool.
---

# What agents can do — spec

**Status:** design agreed with the owner on 14 Nov 2026. The settled screens are in
[`boards/what-agents-can-do.html`](boards/what-agents-can-do.html) (page A3 for the capability list, S5 for the AI
page).

## The problem

- **Web search depends on the runtime.**
  - Agents on **Claude Code** search with Claude's own search. That covers an Anthropic key, a person's Claude
    subscription, and later Agenthix Cloud's Claude models.
  - Agents on **OpenCode** search only through the site's `web_search` tool, which sends queries to Exa with the
    organisation's key. That covers OpenAI, Google, OpenRouter, Inworld, an organisation's own endpoint, and later
    Cloud's other models.
  - OpenCode's own Exa search is off (`OPENCODE_ENABLE_EXA` is in `FORBIDDEN_SERVER_ENV`).
- **Setup never asks for the Exa key.** It lives only in *Settings › Access to models and tools › Web search*.
- **Without a key, OpenCode agents still see `web_search`.** The call fails with "Web search is not set up for this
  organisation: it has no search key." A person sees a failure, not a missing setup step.
- **Setup and Settings say the same things in different words:**
  - setup's "Model / Hearing / Speaking" against Settings' "Model / Voice / Listening";
  - kinds as chips ("Models, Hearing, Speaking") against words ("LLM, STT, TTS");
  - three pages in two places: Providers, Models, and Web search.

## Decisions (owner, 14 Nov 2026)

1. **"What agents use" becomes What agents can do.** It is one list of four capabilities: **Thinking** (was Model),
   **Hearing**, **Speaking** and **Web search**. Each line carries one of three marks:

   | Mark | Means | The line shows |
   |---|---|---|
   | ✓ | Agents can do it | What they use, and **Change** |
   | ○ | A provider would add it | Which kind to add ("Add a provider that hears people."). It is a note, never a fault, and setup still continues |
   | ! | Only some agents can do it | Today only Web search, when a runtime that searches on its own is in use beside OpenCode with no key |

2. **The wording is by runtime, never by provider.**
   - Each provider card says which runtime its models run on: "Agents run its models on **Claude Code**" or "…on
     **OpenCode**". A provider that only hears or speaks has no runtime line.
   - Under Web search, one line per runtime in use:
     - a runtime that searches on its own reads "✓ on its own";
     - OpenCode reads "needs a search key", with **Add a key**, or "✓ Exa" once a key is saved.
   - The sub-lines show only when more than one runtime is in use. With one, the line itself says it (see section 1 of
     the design).
   - Help, under the line's "?": *"A runtime is the program an agent works in. Claude Code searches the web on its own.
     OpenCode searches through Exa, with your organisation's key."*
   - Claude Code's "on its own" holds unless the Anthropic account's admin has turned web search off in the Claude
     Console (Settings › Capabilities); it is on by default. HQ does not check for it: the guide says where the setting
     is, and that Anthropic bills each search to the organisation's account (decided 14 Nov). Asked to search there,
     the agent says the search failed and why.
   - When OpenAI's and Google's own runtimes arrive, each becomes one more "on its own" line, with no new wording.
3. **Web search is always in the list.** Before any model provider is added it reads ○ "Comes with your first model
   provider."
4. **Add a key opens a pop-up titled "Web search for OpenCode".**
   - One field, the Exa API key, and a link to Exa's key page.
   - It says the key stays in HQ and never reaches an agent, and that runtimes which search on their own, like Claude
     Code, don't need it.
   - **Not now** and **Save key**. A refused key is said under the field and the pop-up stays open.
   - **The key is checked with Exa when it is saved** (owner, 14 Nov): HQ sends Exa its smallest request with the key.
     A key Exa refuses is said under the field and isn't saved; when Exa doesn't answer, the pop-up says the key
     couldn't be checked and offers to save it anyway.
   - It saves through today's `setWebSearchKey`, so the key's storage doesn't change.
   - It never blocks setup.
5. **No search tool without a key.**
   - An OpenCode run of an organisation with no key is not offered `web_search`.
   - Its instructions say web search isn't set up. Asked to search, the agent replies that it works in OpenCode and
     the organisation hasn't added the search key, and that it can answer from what it knows meanwhile.
   - It tells an admin where to add the key (the AI page's Web search line), and anyone else that an organisation admin
     can.
   - Keeping the tool with an explanatory error was rejected.
6. **The review step's AI section shows the same list,** with the same marks and words.
7. **Settings is made consistent in this unit.** One *What agents can do* component and one provider-card core are used
   in setup and in Settings, with the same words everywhere:
   - "Voice" becomes **Speaking** and "Listening" becomes **Hearing**, on the organisation's page and on an agent's own
     models;
   - a provider's kinds read **Thinking, Hearing, Speaking** wherever they show, replacing "LLM, STT, TTS" and "Models".
8. **One AI page replaces Providers and Models.**
   - It is called *Manage organisation › AI*, at `/admin/ai`. It holds, in this order (owner, 14 Nov: the answer first, so
     a long list of providers never pushes it out of view):
     1. **What agents can do:** the list of decision 1.
     2. **Your providers:** one line per provider (name, kinds, runtime, state; a provider that isn't working stands
        out in the error colour with its reason). Pressing a line opens it in place — one at a time — as the full Settings line, keeping its state and since when, kinds, key, Check now, History,
        Replace key, Rename, Remove and Revoke, what depends on it, and the vendor's message. It gains the runtime line,
        and Add a provider and Agenthix Cloud stay in the page's header.
     3. **Which models may run:** folded by default, its summary line visible.
   - The menu becomes *Models and billing › AI · Billing profiles · Usage*.
   - `/admin/providers` and `/admin/models` redirect to the page's sections. Links to a provider's line (alerts,
     notifications, *Needs attention*) open that line on the AI page.
   - *Settings › Access to models and tools › Web search* and its page `/admin/settings/model-access` go. The route
     redirects to the Web search line, and the Settings entry is removed or points there.
   - A person's own Claude subscription stays where it is today, under the person's own settings.
9. **An agent's own tools decide whether it may search, and Ask is the default** (owner, 14 Nov, in the walk). Fetch a
   page and Search the web start at **Ask** for every agent on either runtime (they were Never, so no agent could
   search); an agent whose tools were saved keeps what was saved. In a conversation a person approves each search; a run
   nobody can approve gets no web search. Every place that says an agent can't search gives the real reason — the
   agent's tools, or OpenCode's missing key — and never blames a key for what its tools withhold.
10. **A conversation's reply hands a web lookup to background work** (owner, 14 Nov, in the walk). The reply is HQ's
    own turn and has no web search; it is told, each turn, whether this agent's background work can search (runtime,
    key, the agent's own permission) and either carries the request on in the background, saying when the person will
    be asked to approve, or says why not. A reply that searches itself is planned work outside this unit.

## Design

### 1. The capability list

- **Inputs:** the organisation's providers and their states, the defaults as today (`getSetupDefaults` /
  `getModelsSettings`), and whether the organisation has a web search key (`getWebSearchKeyStatus`).
- **Runtimes in use** are computed from the providers that offer models and work, through `runtimeFor` (vendor,
  credential kind, model). A person's subscription is a provider of credential kind `subscription` and counts as
  Claude Code where it applies to the viewer.
- **The marks:**

  | Capability | ✓ when | ○ when | ! when |
  |---|---|---|---|
  | Thinking | A default model is set from a working provider | No working provider offers models | The default's provider has stopped working |
  | Hearing | A hearing default is set | No working provider hears | The default's provider has stopped working |
  | Speaking | A speaking default is set | No working provider speaks | The default's provider has stopped working |
  | Web search | Every runtime in use can search: Claude Code always; OpenCode with a key | No model provider yet, or OpenCode is the only runtime and has no key | More than one runtime in use, and OpenCode has no key |

- **The words when only one runtime is in use:**
  - Claude Code only: ✓ "Built into Claude Code."
  - OpenCode only, no key: ○ "OpenCode needs a search key." with **Add a key**.
  - OpenCode only, with a key: ✓ "Exa", with **Change**.
- **Change on Web search** opens the same pop-up, with the key replaced, never shown back. **Remove key** goes in the
  pop-up when a key is stored.
- **A default whose provider stopped working** (owner, 14 Nov) is marked ! — agents with their own model still can —
  with its line ("<model> · via <provider>: its provider isn't working.") and **Open its provider**, which opens that
  provider's line on the AI page; a screen reader says "needs attention".
- **A failed press says what happened in words** (owner, 14 Nov): when HQ can't be reached, every failure dialog in hq
  says "HQ did not answer." with Try again, never the request's address; one shared helper decides the words.
- **Who can use it:** setup's first admin, and organisation admins on the AI page. Anyone else never sees the page,
  as today.

### 2. The provider card core

- The same core in setup and on the AI page:
  - the name;
  - the kinds (Thinking, Hearing, Speaking);
  - the state in words;
  - the runtime line, when the provider offers models.
- **Both places show a provider as one line** (name, kinds, runtime, state) that opens in place when pressed, one at a
  time; never a pop-up (owner, 14 Nov). Opened in setup it shows the state, the runtime, the vendor's message and
  **Remove**; on the AI page, Settings' full line. An alert's link opens the AI page with that provider's line open.
- Setup keeps its order — Your providers, then What agents can do — since setup is where providers are added.
- The words live in one place (`providerWords.ts`). `TYPE_WORDS` and `TYPE_CHIP_WORDS` become one map: `llm`
  Thinking, `stt` Hearing, `tts` Speaking.

### 3. Setup

- The AI step's lead becomes: "Agents think with a model, hear and speak with a voice, and search the web. Add the
  accounts you have."
- *What agents use* is replaced by *What agents can do*.
- Continue and Skip work as today (ADR-0160): Skip for now while nothing works, Continue once a provider does. Web
  search never changes which of the two shows.
- The review step's AI section shows the list in short form, each capability and its mark, with **Edit** going back to
  the AI step.

### 4. The missing key, at run time

- **Where the decision is made: the turn's session rules, not the tool registration.** OpenCode keeps the tools a
  connection listed for the conversation's later runs (`site/src/server/mcp/handler.ts`), so a listing that left
  `web_search` out could not bring it back once a key is saved mid-conversation. OpenCode's session rules are the
  per-turn control instead: they are read at every turn and brought up to date before the message is sent
  (`syncOpenCodeSessionRules`, `openCodeSessions.ts`), and a deny with pattern `*` removes a tool from the list the
  model receives ([opencode-tools.md](../../architecture/tools/opencode-tools.md#what-an-agents-permissions-hide)).
  - A turn with no key adds `<connection>_web_search` to the turn's hidden tools (`OpenCodeRuntime.ts`, beside
    `openCodeHiddenPlatformTools`). A key saved mid-conversation shows the tool at the next turn; a key removed hides it
    at the next turn.
  - The site's MCP server keeps registering `web_search` for OpenCode connections, and its call still refuses when the
    turn has no key (`siteTools.ts`): the backstop for a key removed while a turn runs.
- **The instructions:** a line saying web search isn't set up, added to an OpenCode turn's instructions by the site
  when the turn has no key (`OpenCodeRuntime.ts`; the words are core's `NO_WEB_SEARCH_INSTRUCTIONS`), decided again at
  every turn. hq sends no system prompt, so the line is not hq's. Its wording is checked on the baseline model, as the
  repository requires for agent-facing text, with one model check: asked to search with no key, the agent says why and
  doesn't pretend to search.
- Claude Code runs are unchanged. They never receive the key, as today (`runContext.ts`).
- **An agent's tools withhold it (decision 9):** when the agent's permissions set Search the web to Never, or to Ask in
  a run nobody can approve, the site adds core's `webSearchWithheldInstructions` to the run, on either runtime, with the
  words to say and where an admin allows it; the tools' reason comes before the key's. Each app's default tool
  permissions (hq and the site keep one copy each, held identical by a test) put `web_fetch` and `web_search` at Ask.
- **A conversation's reply (decision 10):** each turn, except a report, gets a block saying whether this agent's
  background work can search (`hq/src/conversations/lead/webSearchBlock.ts`): the runtime and model a brief in the
  conversation's place would get (`chooseRunModel`), whether a key is stored (never the key), and the agent's own
  permission (`runPermissions`). Can → carry it on in the background with the request word for word, saying at Ask that
  the person will approve the search; Never → the tools' words; no key → core's `NO_WEB_SEARCH_WORDS`. Checked by
  model checks on the baseline model for each case.

### 5. The guide

- `docs/guide/your-tools/providers.md` and `models.md` become one page or keep their names but describe the one AI
  page. *Web search for OpenCode agents* moves to the Web search line's description. The plan picks the layout so links
  into the guide (the website checks them, SC-665) keep resolving or are redirected.
- `docs/guide/getting-started/setup-hq.md` describes the AI step's list.
- The Web search description says that Claude Code's search is Anthropic's, on unless the account's admin turned it
  off in the Claude Console (Settings › Capabilities), and that Anthropic bills each search to the organisation.
- The screenshots of Providers, Models, Web search and setup's AI step get new recipes, run by the shared capture
  script (`scripts/guide/capture.mjs`).

## Not in this unit

- Search providers other than Exa.
- OpenAI's or Google's own runtimes. The wording is built to take them later.
- A person's own Claude subscription screen.
- Agenthix Cloud as a search provider.
- A conversation's reply searching the web itself, without background work (planned separately).

## How it is checked

- Tests, one per case, each saying what it proves:
  - **Capability marks:** every case of the table in section 1. Unit tests on the function that computes the list
    from providers, defaults and the key status.
  - **Setup:** a fresh organisation; skip, then configure in Settings; configured in setup; a refused key; Continue and
    Skip unchanged by web search.
  - **The AI page:** the three sections; the redirects from `/admin/providers`, `/admin/models` and
    `/admin/settings/model-access`; an alert's link opening the provider's line; the menu.
  - **Run time:** an OpenCode run without a key isn't offered `web_search`; with a key it is; a Claude Code run never
    gets the key. Plus the mid-conversation case the plan settles.
  - **Words:** no "Voice", "Listening", "LLM", "STT" or "TTS" left on these screens (a design-guard rule, if the guard
    can hold it).
- **One model check on the baseline model:** with no key, asked to search, the agent explains instead of searching.
- **A usability review** of the changed screens against this spec: making things fail on purpose (a refused key, a
  provider that stops working while the page is open, HQ not answering).
- **The owner walks setup** with no key, then adds one in setup and in Settings, and walks the AI page.

## Decision records

- **Implements:** ADR-0160 (setup never blocks on AI) unchanged. The removal of the web search page and the
  no-tool-without-a-key rule are design decisions recorded here.
- **New:** none expected. If the plan finds that withholding a tool by the organisation's configuration needs a rule
  of its own in the tools architecture (`docs/architecture/tools/opencode-tools.md`), it is written as an ADR in the
  unit.

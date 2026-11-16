---
created: 2026-11-16
description: An agent is shown a small set of must-have tools, a few lines naming what else it can do, and two tools to find and call everything else; the rest are found by a search over an index embedded with hq's built-in model, so the context no longer grows with the number of tools. Every tool slimmed first. Proved by the model checks on the baseline model, before and after.
---

# A lean agent context: must-have tools, and a tool search for the rest — spec

**Status:** design agreed with the owner on 16 Nov 2026. The boards are in the unit's companion
(`execution/companion/`: `context-size.html`, `stock-take.html`, `future-state-v2.html`); the stock-take with every
tool's size is `execution/stock-take.md`.

## The problem

Every request an agent sends carries about 20,000 tokens before the person has said anything, and 70–80% of it is
tool definitions: 38 tools in a conversation's reply, about 70 in a background run. Measured on 16 Nov at the code of
`v0.1.0-alpha.6` (`execution/stock-take.md`):

| First request | Tokens | Tools |
|---|---|---|
| A conversation's reply (Kernel) | ~21,000 | 38, ~13,600 tokens |
| A background run (a default agent) | ~18,700 | ~70, ~16,500 tokens |

The cost is not mainly money (providers cache the prefix). It is:

- **Accuracy.** A low-cost model choosing among dozens of tools misses the ones that matter. On the baseline model,
  two background-run checks fail every time (`execution/sweep.md`): asked to note a follow-up as a task, or to start
  another task, the run drifts into the code and never makes the one platform call. In a conversation, an agent said
  "I'll remember" for 32 turns without calling `remember`.
- **The context window.** 20,000 tokens is 15% of a 128k model and a third of a 64k one, gone before the first word.
- **First impressions.** v0.1.0 is the first release people keep. An agent that visibly eats context is a turn-off.

And it gets worse with every tool added. Once people connect their own tools (any MCP endpoint), a list shown in full
grows without bound: enabling a connector must not put all its tools in every request.

## Decisions (owner, 16 Nov 2026)

1. **Three layers.** An agent is *shown* a small set of must-have tools in full; it is *told* the names of the other
   platform tools, grouped by area, with no descriptions (and, later, only the names of connectors); and it *finds* a
   tool's definition, or a tool by what it wants to do, then calls it.
2. **The search is by meaning and by words,** over an index of every tool embedded with hq's built-in embedding model.
   No provider key, no network, no cost per search; it holds any number of tools.
3. **Built now for the platform's own tools,** in a conversation and in a background run, before v0.1.0. Connecting
   outside tools (MCP endpoints) and their gateway is a later unit that adds entries to the same index.
4. **The must-have sets** are as listed in design §1 (14 in a conversation, 21 in a run).
5. **The 7 tool fields marked deprecated** are removed now, before v0.1.0.
6. **This unit carries all of it:** the model checks on the baseline, the slimming and the tool search (no separate
   unit for the search).
7. **A task started with no agent named** is done by the agent the person is talking with.
8. **No standing job.** An agent never runs on its own: work starts only by an explicit act (ADR-0175), on behalf of
   a person. The "standing job" text left in the built-in agents from the heartbeat is removed. A person who wants an
   agent to run on a schedule creates a routine, with its own instructions, and may call it what they like.

## Design

### 1. The must-have tools

Shown in full, as native tools, in every request where they apply:

- **A conversation (14):** `start_work`, `create_task` (lean), `run_task`, `update_task` (lean), `list_tasks`,
  `get_task_details`, `open_board` ("let's go through the board" is common, and folded it was never found),
  `recall`, `remember`, `used_memory`, `search_knowledge`, `read_knowledge`, `suggest_place`,
  `ledger`. Plus, only while they apply, as today: `answer_approval`, `keep_listening`, `offer_live_preview`.
- **A background run (21):** the harness's own file and shell tools; `set_result`, `add_comment`, `get_task_details`,
  `update_task`, `create_task`, `recall`, `remember`, `search_knowledge`, `read_knowledge`; for code work `commit`,
  `update_from_main`, `merge_into_main`; with the live preview on `start_app`, `list_apps`, `reload_view`; and the
  site's own `stop_processes` and `install_packages` where they apply today.

Plus, in both, the two tools of §4: `find_tools` and `use_tool`. Every other tool is found by search.

### 2. Every tool slimmed

Before anything is folded, every description and schema is cut to what the model needs to call it. The stock-take
lists each tool's target size.

- **Said once.** A rule or pointer repeated across tools or between a tool and the base prompt is said in one place:
  the base prompt for a rule about behaviour, the one tool it belongs to otherwise (`execution/stock-take.md` §2).
- **Lean task tools in a conversation.** `create_task`: project, title, description, agent, workspace, when, then,
  model. `update_task`: task, title, description, state or column, agent, archive. The planning fields (type,
  priority, labels, plan dates, milestone, custom fields, order, epic and sprint) move to a conversation tool of their
  own, `plan_task`, which is folded (found by search when a person plans a task). Same tool names as today, so stored
  permissions don't change. A background run and hq's MCP server keep the full task editor; its words are slimmed.
- **The deprecated fields removed:** `attach_file.agentId`, `add_comment.agentId`, `list_products.agentId`,
  `remember.scope`, `forget.scope`, `remember.kind`'s four deprecated values, and `add_comment.runId` in a
  conversation. hq already drops a field it doesn't declare, so a site still sending one is not refused.
- **Rules only when they apply** (a conversation's base prompt): the voice rules only in a turn that is being heard;
  the folded-history rules, and the `expand` and `messages` tools, only once something has been folded.
- **A task with no agent named** (owner, 16 Nov): a task a conversation starts now or at a time, with no agent
  named, is done by the agent the person is talking with, instead of the call being refused. Naming another agent
  works as today; a task for later needs no agent.
- **The standing job removed** from the built-in agents' instructions (Kernel, Product Manager, Project Manager, QA)
  and their skills (`orchestrate`, `read-context`, `review-work`): what describes a run on the agent's own timer goes;
  what applies when a person asks stays, reworded where it named the standing job.
- **`remember`:** only a title and body required; the base rule ties saying "I'll remember" to the call; the memory
  rules near the top of the base prompt.

### 3. The names of the folded tools

Every request that has folded tools carries, after the must-haves, the **name of every folded platform tool, grouped
by area, with no description** (owner, 16 Nov), and the rule to search or call one:

> More tools, called with use_tool by name (find_tools gives one's description and input, or finds a tool by what you
> want to do):
> - planning boards, sprints and milestones: list_milestones, create_milestone, update_milestone, plan_task, …
> - knowledge pages: write_knowledge, edit_knowledge, delete_knowledge
> - people, agents and projects: get_org, list_agents, list_teams, list_projects, …

The platform's own tools are a set we ship, so naming them costs little and stays bounded: about 140 tokens in a
conversation (24 names) and 300 in a run (49 names). Tools from outside (connectors, later) are named only by their
connector, never one by one: people ask for those by what they do. The base rule says: before telling a person
something can't be done, search for a tool.

The groups carry plain labels a person would use ("people, agents and projects", "what's running"), not the areas'
keys (owner, 16 Nov). In a run the lines follow the platform tools' own rules. `use_tool` called with input that
doesn't fit a tool answers with that tool's description and input, so a model that knows a name can call it without
searching first. Two tools left from runs that fetched their own work (`fetch_my_queued_tasks`, `tick_subtask`) are no
longer offered to agents; hq still serves them.

Areas are a field of each tool's declaration (`area`), so a new tool is placed when it is written. Only areas the
agent has at least one tool in are listed, and only tools it may use (never one at Never).

### 4. The two tools

**`find_tools({ query })`.** The query is words: what the agent wants to do ("set a task's milestone"), or a tool's
name. It answers the best matches, at most five, each with its name, full description and input schema, from the same
declarations the native tool would have been shown. Only tools this agent may use are found (§6). When nothing passes
the bar, it says so in one line and names the areas.

**`use_tool({ name, input })`.** Runs the named tool with that input through the same path its native call takes
today (§5). The answer is the tool's own answer, or its own refusal; a name the agent may not use, or that does not
exist, is refused in one line that says to search.

A must-have may also be called through `use_tool`; a folded tool may only be called that way. A found definition is an
ordinary tool result in the conversation's messages, so a later turn can call it again without searching. The tool
list itself never changes within a conversation, so the provider's cached prefix stays whole.

### 5. Where it runs

**A conversation (hq's reply loop).** The turn's tools are built as today (`conversations/tools/toolAdapter.ts`),
minus the folded ones, plus `find_tools` and `use_tool`. `use_tool` dispatches to the same per-tool path a native call
takes: the tool's input validation, Ask with its required reason, Never, the action writer, operation rows and the
mailbox, all under the inner tool's name. The area lines go into the cached base prompt.

**A background run (the site's MCP server).** The site lists the run's must-haves, `find_tools` and `use_tool`, and
adds the area lines to the run's prompt beside the platform tools' instructions. `find_tools` is answered by hq, which
holds the index, through the run's existing data path (a new data-path tool, `find_tools`: an addition). `use_tool`
runs the inner tool through the site's call gate (`server/mcp/mcpCallGate.ts`), which decides Never and Ask on the
**inner** name against the run's manifest and records the call under that name, then forwards it to hq as a native
call is forwarded today. The harness sees `use_tool` itself as one more platform tool, allowed. OpenCode and Claude
Code behave the same.

### 6. Permissions, records and the wire

- **Searching grants nothing.** The index is filtered at search time by the agent's effective permissions: a tool at
  Never is never found, and `use_tool` refuses it as a native call would be refused. A tool at Ask is found with its
  reason field, and its call waits for the person's answer exactly as a native call does.
- **Records name the real tool.** Operation rows, tool-call logs, action lines and cards, usage and History name the
  inner tool, so nothing reads differently.
- **Not a breaking change.** Every tool keeps its name, input and behaviour, and stays callable. hq's MCP server, which
  people's own clients connect to, lists every tool in full as today. What hq and the site send each other gains one
  data-path tool; nothing changes shape. Stored permissions name the same tools.

### 7. The tool index

- **What an entry is:** a tool's name, area and source (the platform today; a connector later), and one short text
  embedded for search: its name in words, its description's first sentence and its input names.
- **The embedding:** hq's built-in model (`memory/embedding/`, all-MiniLM-L6-v2, 384 dimensions), run in hq's own
  process. The same model memory uses, loaded once.
- **Where it lives:** in hq's memory, built from the declarations when first searched and kept for the process's life,
  each entry keyed by a hash of its text so an unchanged tool is not embedded again. The platform's tools ship with
  the code, so nothing needs storing. A table comes with connectors, whose tools arrive at run time.
- **Scoring:** the embedding's similarity, plus a match on the tool's name and words (a query that names a tool, or a
  distinctive word of it, finds it first). The top five above a bar.
- **Without the model:** while the model is not yet on disk (a first start with no network), the search uses the word
  match alone and says nothing different. The checks run both.

## Not in this unit

- **Connecting outside tools:** an admin adding an MCP endpoint, its credentials in the secret store, the gateway that
  calls it so credentials never reach an agent's container, and Always / Ask / Never per connected tool (defaulting
  to Ask). Its entries go into the same index, and its area lines are its connector's name.
- **Skills found the same way:** the index holds any kind of entry; skill discovery is its own work.
- **A multilingual embedding model:** memory shares the question.
- **A worker's context on the site** (its own prompt, which hq can't build): #68.

## How it is checked

- **The model checks on the baseline model** (DeepSeek Flash), three runs each, before (`execution/sweep.md`) and
  after. A check grades a `use_tool` call as the tool it names, so it tests what the agent did, not the route.
- **New checks:** a folded tool is found and used in a conversation (a milestone, a comment, a board) and in a run (a
  routine, a workflow); a folded tool is never claimed impossible; a tool at Never is never found; "remember that …"
  calls `remember` (ten runs, a rate); the skills checks (#92).
- **The first request measured** from the provider's own count, for a conversation and a run, before and after.
  Target: a conversation about 10,000 tokens, a run about 8,000.
- **Unit tests:** the index (hashing, scoring, the permission filter, the word match without the model), `find_tools`
  and `use_tool` on both sides (Never refused, Ask waits, an unknown name refused, records under the inner name).
- **The full regression** at the close, with the container tests of the site's server.

## Decision records

| | Records |
|---|---|
| **Implements** | ADR-0193 (new): an agent is shown its must-have tools and finds the rest by search |
| **Depends on** | bdr-0018 (the baseline model); ADR-0136 and `versioning.md` (the change is additive) |

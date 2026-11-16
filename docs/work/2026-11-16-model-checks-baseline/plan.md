---
name: A lean agent context, proved by the model checks — plan
description: Every tool slimmed; an agent shown its must-have tools, the areas of the rest, and a tool search over an index embedded with hq's built-in model; every model check passing on the baseline model, before and after; the skills checks written.
created: 2026-11-16
---

# A lean agent context, proved by the model checks — plan

**Status:** approved 2026-11-16; reshaped the same day to carry the tool search ([spec](spec.md)). Initiative: the
spec holds the design.

## Goal

An agent's first request carries about half what it does today, and no longer grows with the number of tools: a
conversation's reply from about 21,000 tokens to about 10,000, a background run from about 18,700 to about 8,000. Every
model check passes on the baseline model (DeepSeek Flash) three runs of three, before and after, so the smaller context
is shown not to cost accuracy, and a model-check run before a release reports only what a change broke.

**Why now:** v0.1.0 is the first release people keep. An agent that uses a fifth of a model's window before the first
word, and misses the tools that matter on a low-cost model, is a turn-off (owner, 2026-11-16).

**Addresses:** #92 (skills checks on the baseline), #166 (the task, board and routine tool wording checks), #144 and
#145 (the propose-skill check), #263 (`MODEL_CHECK_ONLY`), #93 (tool descriptions over half of every request), and the
planned work on an agent's context size, all of it (the stock-take, the slimming, the tool search).

**Out of scope** (spec, *Not in this unit*): connecting outside tools and their gateway; skills found by the same
search; a multilingual model; a worker's context on the site (#68); the scripted tools' looseness (#158) unless a
failure traces to it.

## Size

**Large**, against a short window: slimming across hq, core and the site, a new index and two tools on both sides,
and the checks run throughout. The order hedges it: each phase leaves something shippable.

## Approach

One branch, `chore/model-checks-baseline`, merged to `main` once at the close.

**The order hedges the window.** Phase 3 (slimming) ships on its own as about a third off. Phase 4 (the conversation's
search) is the larger half of the gain for what people see first. Phase 5 (the run's search) completes it. Each phase
is proved by the checks before the next merges.

**Lanes** (`running-lanes`), each a squashed commit on the unit branch: the slimming of shared declarations goes
first (core and hq), since both searches build on the slimmed declarations; then the conversation's search and the
run's search side by side, file-disjoint (hq's reply loop; the site's MCP server and hq's data path, which the
run's lane owns).

**Every paid run states its strategy and cost first.** The baseline costs $0.02 per million input tokens: a full
sweep is well under a dollar. A large model only to diagnose a baseline failure, one run per failing check.

**Measured, not estimated, at the close:** the first request of a conversation and of a run, from the provider's own
count.

## Work breakdown

### Phase 1 — The checks' harness

- [x] 1.1 #263: the propose-skill check reads `MODEL_CHECK_ONLY` (fcece3b9)
- [x] 1.2 #145: the skills checks send the words a real run is told (moved to core) (cc84c3cd)
- [x] 1.3 #92: `skill-use`, `skill-picked`, `skill-picked-read`, `skill-what-can-you-do`, `propose-skill` (cc84c3cd)
- [x] 1.4 A check that "remember that …" calls `remember`, run ten times for a rate
- [x] 1.5 The first request measured from the provider's own count, for a conversation and a run
- [x] 1.6 The checks grade a `use_tool` call as the tool it names

### Phase 2 — The before

- [x] 2.1 Every check on the baseline as alpha.6's code is, three runs each (`execution/sweep.md`): 35 of 45 pass
      3/3; `taskrun-follow-up-not-started` and `taskrun-start-asked` 0/3
- [x] 2.2 The stock-take of every tool (`execution/stock-take.md`) and the must-have sets, agreed by the owner

### Phase 3 — Every tool slimmed (spec §2)

- [x] 3.1 Repeated rules and pointers said once (stock-take §2)
- [x] 3.2 Lean `create_task` and `update_task` in a conversation; `plan_task` with the planning fields; the full
      editor kept for runs and hq's MCP server
- [x] 3.3 The 7 deprecated fields removed
- [x] 3.4 Rules only when they apply: voice in a heard turn; folded history, `expand` and `messages` once folded
- [x] 3.5 `remember`: title and body required only; "I'll remember" tied to the call; memory rules near the top
- [x] 3.6 Each tool declares its `area`
- [x] 3.7 A task started now or at a time with no agent named goes to the agent being talked with
- [x] 3.8 The standing job removed from the built-in agents and their skills (leftover from the heartbeat)

### Phase 4 — The tool search in a conversation (spec §3–§7)

- [x] 4.1 The tool index in hq: entries from the declarations, embedded with the built-in model, keyed by hash;
      scoring by meaning and words; the word match alone without the model; the permission filter
- [x] 4.2 `find_tools` and `use_tool` in the reply loop, through the per-tool path (Ask, Never, records under the
      inner name); the folded tools no longer offered natively
- [x] 4.3 The area lines in the cached base prompt; the rule to search before saying something can't be done
- [x] 4.4 New checks: a folded tool found and used (a milestone, a comment, a board); never "I can't"; Never not found

### Phase 5 — The tool search in a run (spec §5)

- [x] 5.1 `find_tools` on hq's data path, answered from the index
- [x] 5.2 The site's MCP server: must-haves, `find_tools`, `use_tool` with the gate deciding on the inner name; the
      area lines in the run's prompt
- [x] 5.3 New checks: a run finds and uses a folded tool (a routine, a workflow); the container tests of the site's
      server

### Phase 6 — The after

- [x] 6.1 Each failure diagnosed and fixed for the baseline, re-run three of three; anything not fixed raised as its
      own issue
- [x] 6.2 The closing sweep: every check three of three; `propose-skill` three of three on a second occasion; the
      remember rate; the first request measured against the target
- [x] 6.3 The full regression

### Phase 7 — The record

- [x] 7.1 The model checks' README; the architecture of how an agent is offered tools; the guide where it says what
      agents can do; QA scenarios, tagged

## Decision records

| | Records |
|---|---|
| **Depends on** | bdr-0018 (the baseline model); ADR-0136 and `versioning.md` (the change is additive) |
| **Implements** | ADR-0193 (an agent is shown its must-have tools and finds the rest by search), written for this unit |
| **Revisits** | none |

## Deviations

| Phase | What changed | Why |
|---|---|---|
| All | The unit grew from model checks and slimming to carry the tool search, with a spec and ADR-0193 | The owner: the tool search before v0.1.0, in this unit, and built for an unbounded number of tools (16 Nov) |
| 4–5 | The area lines name every folded platform tool (no descriptions), not only its area, under plain labels | The first run with the search: the baseline rarely searched for a tool it couldn't see named; names cost ~140 tokens (owner, 16 Nov) |
| 4 | `open_board` is a must-have (14 in a conversation) | Folded, "let's go through the board" never reached it in 6 runs over two wordings |
| 6 | Several checks were wrong, not the model: a milestone set on a non-epic, a sprint on the real date, `ls` graded as work, a stand-in shell that printed nothing | Read from the traces of the failed runs (lane D) |
| 6 | A second pass on the baseline: a search that finds nothing sends the agent back to the named tools; "my space" read as the person's own space; `requested` only when asked; three more grades corrected (`remember-that` takes the project's page, `code-not-in-drafts` takes the project's own task, a memory with no kind is a fact) | Lane D2's ten-run diagnosis; `remember-that` by the owner: a project's fact belongs in its Knowledge |
| 6 | A run's user message is only the request — a person's ask, a background brief, a routine's instructions — with "Execute your assigned task." only when nobody asked | The owner's walk of the run prompts: the stacked lines contradicted the person's words ("do it now" beside "don't do that one now") |
| 6 | `get_task_details` gives the task's own reference (`tasks/KEY`) | The task-link check: the agent copies a reference it is handed and missed one it had to build |
| 6 | The task prompt's sections moved from the site to core, so the task-run checks send the real prompt | The checks sent a cut-down prompt, which hid the real one's pull |
| 6 | `rule-weight-none` only measures (ten runs, never failing) | The owner: with nothing shown the agent can't know the rule exists; finding rules in real use is planned work of its own |
| 6 | The web search checks' misses are left to their own unit | The owner: a reply should search the web itself, not hand every search to background work, planned as work of its own |
| 6.2 | Not every check passed three of three in one run: the closing run had three single misses at rates near nine in ten | The baseline varies; accepted by the owner (16 Nov), each recorded in the closing note |

## Closing note

**2026-11-16.** Accepted by the owner, with the three single misses below, and closed on the branch.

- **The first request:** 7,608 tokens for a conversation's reply (from about 21,000) and 7,349 for a background run
  (from about 18,700), both under the targets of about 10,000 and about 8,000. It no longer grows with the number of
  tools: the folded ones are named by area and found with `find_tools`.
- **The closing sweep on the baseline:**
  - the lead's checks: 49 of 52 pass three of three, and `rule-weight-none` measured 5 of 10;
  - the skills checks: 4 of 5, with `propose-skill` three of three on an earlier occasion;
  - three single misses, at their rates across every closing run: `board-open` 8 of 9, `taskrun-no-preview-not-asked`
    11 of 12, `propose-skill` 8 of 9. The owner accepted them as the baseline's variance.
- **Closing regression:** 49 steps; 48 pass. hq's integration suite had 5 failures, all tests that still cut a
  background brief from behind the opening this unit removed. They were corrected, and the suite was run again:
  4,239 passed, 7 skipped, none failed.
- **Open items, deferred as issues:**
  - #297: the Claude container tests share one set-up helper.
  - Planned work, outside this repository: the prompts said once and shorter; a Rule that memory only hints at,
    found in real use; a conversation's reply that searches the web itself.

  None blocks a release.
- **Closed by this unit:** #92, #93, #144, #145, #166 and #263, once pushed.
- **QA:** US-497 and its criteria; SC-2171 to SC-2183 written and tagged; SC-977 and SC-1548 corrected. No QA audit
  ran; these entries wait for the audit before `0.1.0`.
- **Records:** ADR-0193 notes that it is implemented. bdr-0018, ADR-0136 and `versioning.md` still hold.

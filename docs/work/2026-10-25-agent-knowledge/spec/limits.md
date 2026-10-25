# Part 6 · Limits and proof

What the design stops, what it does not, how it is proved, and what is left for later on purpose. Board: *7 · What it
stops, what it does not, what waits*.

## What it stops

- A tool call reaching a place the run or conversation does not hold: there is no place to name (part 4).
- A conversation reaching a place its person did not add, and the lead widening its own reach (part 4).
- A change to a page with no author, no previous version, broken front matter, or that silently overwrites another
  writer's change (part 2).
- An agent answering a question about Agenthix from guesswork, when the answer is in the guide (part 1).

## What it does not stop

| Gap | Why it stays | What limits it |
|---|---|---|
| A misled agent carrying one place's knowledge into another of the conversation's places, unasked | Within the places the person put together | The tools reach only the conversation's places; every brief shows in the conversation |
| An agent writing something wrong, or something it was tricked into, into a page | Agents writing knowledge when asked is the point | Every change shows who and why; History and Undo; agents change knowledge only when a person asks |
| The platform guide describing a feature a run's tools don't allow | The guide describes the product, not a run | Every `platform:` result starts with "what you may do here is what your tools allow" |

## How it is proved

| | Test | Kind |
|---|---|---|
| V1 | Asked "look through the files in my space", "where do I add a model key?", "how do I turn voice on?", the lead and a worker each map them to the right place without asking back | Model checks with a real model, run on demand and before a release |
| V2 | The guide's build fails on a page without a description, a glossary that doesn't parse, or anything else in its folder; the tools reference equals the registry | Unit (hq) |
| V3 | The file tools: Grep's parameters map to ripgrep and give Grep's output; read's line numbers, offset and limit; applyEdit's exact matching; write is all or nothing; the guards S1–S8 (a backtracking or look-around pattern, an over-long pattern, a slow search, too many calls, a name leaving its root, a flag smuggled in a pattern, the fixed messages, no pattern in the log) | Unit (core), in the security suite |
| V4 | The gate: write and edit, T1–T5, a changed page refused, an edit's passage not found exactly once refused, properties kept as written, versions, pruning, permanent deletion, restore; the itemiser lists hand-placed files with their problems | Unit (site), integration (hq and site) |
| V5 | The place rule: every knowledge tool reaches only the run's place or the conversation's places, the organisation and the guide; `start_work` refuses a place not in the conversation; only the person adds a place; a place they lose access to drops out; `org:` changes only for admins | Unit and cross-app, in the security suite |
| V6 | The Knowledge tool: the tree, property filters, Needs fixing, editing with properties, move, conflict, delete, restore, permanent deletion, permissions; organisation knowledge; places in a conversation | hq e2e |
| V7 | No run mounts knowledge; search across levels merges and marks results in order | Site container test, cross-app |

## What waits

| Later | Brought in when |
|---|---|
| Ranking by meaning (embeddings, as memory has) | Word patterns are seen to miss pages a person expected to be found |
| Caching search on the server | Search time is measured as a problem |
| Measuring knowledge use, as memory's outcomes do | There is a question it would answer |
| Pictures inside pages (a section's `assets/`) | Teams need them beyond linking to Files |
| "Copy to project" in the Knowledge tool | People ask for it; asking an agent covers it |
| Keeping a conversation's places apart (a worker's report not returned into its context) | A case shows the person's choice of places is not enough |

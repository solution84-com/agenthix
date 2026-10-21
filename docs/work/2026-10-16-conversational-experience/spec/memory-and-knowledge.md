---
name: Memory and knowledge
description: Knowledge is the place's files; memory is records in hq recalled by meaning; what decides a recall; who may recall what.
created: 2026-10-16
author: leang
---

# Memory and knowledge

Part of the conversational experience's spec: the [overview](../spec.md) holds the terms, the governing
decisions and the data model this part builds on.

*Changed 2026-10-16, building phase 3: no `pgvector` for now — every install's database image stays as it is, and
hq searches the vectors exactly; the extension is the way to grow.*

*Changed 2026-10-17, the walkthrough: "Show in Memory" in the thread opens Settings › Memory.*

Defined by analogy with how a person works with a coding agent in a repository: the repository is the agent's
**knowledge** — files it reads and greps — and what it learns about the person as it works, written down and
indexed, is its **memory**.

## The two kinds

| | Knowledge | Memory |
|---|---|---|
| What | Files about a place: code, docs, the `knowledge/` folder with its `INDEX.md` | Records of what an agent learned: facts, preferences, decisions, corrections |
| Written by | The place's team, deliberately — people and agents editing files | The agent, automatically, through `remember`; the owner of a scope may edit |
| Scope | The place | **Person** (global, any agent) · **agent × person** · **agent × place** |
| Lives | On the place's site, in the files | In hq, as records, with a vector each |
| Curated by | The team, in the files | The person, for their scopes; a place's admins, for agent × place; on the memory screen |
| Reaches the lead | A bounded, delivered excerpt | `recall`, in process |
| Reaches a worker | Natively — it is the workspace | Pinned items as files in its home; `recall` for the rest |
| Leaves its home | Never as files; as an excerpt to the lead, who may quote it to the person | Person scopes travel with the person to any place; agent × place stays with its place |

**Agent × place is new.** Today what an agent learns about a project leaks into the project's `knowledge/` folder
by a prompt convention, so the team's knowledge and the agent's learnings mix. With a scope of its own, `knowledge/`
is the team's alone.

*Diagram: [Memory and knowledge — components](../diagrams/memory-components.md).*

## Where memory lives, and why

**In hq, as records, as today.** The lead lives in hq and reads memory on every turn it chooses to; workers in any
place get the same memory from one source; no site holds another's data. Memory on the person's own site would tie
every conversation to that site being awake and make cross-site delivery the common case. What changes is not the
placement but how memory is read: today both layers are injected whole into every run; that stops.

## An item

An item must stand alone — read months later by a different turn, it still makes sense — so `remember` takes a
title and a body and refuses one that does not (“do that” with no referent). The caller names the scope and may
name a key; hq assigns the key from the scope and the title's slug when it does not. Each item carries a key
(writing to an existing key replaces, never appends), a scope, a type (fact · preference · decision · feedback · project), tags, a
body of at most about 1,500 characters — a memory is a fact, not a document; longer material is knowledge — who
wrote it, when, when it was last recalled, how often, whether it is pinned, and what it supersedes. Title, body and
tags are embedded together, once, when written.

**Where a person sees it.** The memory screen is Settings › Memory. When the lead remembers something, the thread
shows an action line, *Remembered … · Show in Memory*, which opens Settings › Memory with the item marked, in the
scope it was written in — with the agent, and the conversation's place for an agent × place item. Not a place's
own Memory tool: the person's own space has none, and a project's holds agent × place items only, for its admins.

## Recall by meaning, ranked by hit rate

Vectors live in hq's own Postgres, one column on the memory table, so there is no second store to keep in step.
At memory scale — thousands of items per person — an exact nearest-neighbour search over the scopes a reader may
see takes milliseconds, so hq searches the column itself; `pgvector` and an index come only if an organisation
outgrows that, behind the same search. **One embedding model per organisation, local by
default**: a small open sentence model bundled with hq (384 dimensions, about 100 MB, tens of milliseconds on a
CPU), so every install embeds the same way with no key and no vendor, and the index never splits by who paid. An
organisation may switch to a provider's embedding model; everything is re-embedded once, in the background, the old
vectors serving until it is done.

**Score = similarity × warmth.** Similarity of the item to the query; a boost by how often the item has been
recalled and used, with a log so one popular item cannot crowd out the rest; a decay by time since last recalled, so
last year's preference does not outrank last week's but stays reachable by a direct question; pinned items always
first; filtered to the scopes the requester may read; cut at the top k (8 by default) and a token budget. The
result carries each item's key and provenance.

*Diagram: [Memory — write and read](../diagrams/memory-pipelines.md).*

**Embeddings also keep memory small.** On `remember`, the nearest existing item is checked: very similar means
supersede or merge rather than add. A scheduled tidy — an agent run, like a routine — merges duplicates and archives
items whose hit rate has stayed at zero for months; archived means kept and recallable by a direct question, not
searched by default. Caps per scope remain as a safety net, not the mechanism.

## What decides a recall

Judgement alone is hit or miss, and searching before every turn spends tokens on items nobody asked for. The trigger
has three tiers, and the decision on the middle one is the lead's.

*Diagram: [What decides a recall](../diagrams/recall-trigger.md).*

- **The probe** embeds a *composed query* — the conversation's running topic line, the last two exchanges and the
  new message, a few hundred tokens — because “yes, do that” has no meaning alone. The vector is used once and
  discarded; no message is ever embedded as stored data.
- **Certain:** similarity above a high bar — the item is included in the turn, at most three, bounded.
- **Probable:** between the bars — a one-line hint with the titles and keys of up to three items; the lead decides, and `recall(key)` is one
  read.
- **Silent:** nothing added. The lead may still recall on its own judgement, guided by rules in its instructions:
  the message asks what the person prefers or usually does; refers to the past (“last time”, “we decided”, “as I
  said”); names a person, project, tool or file not seen in this conversation; asks for something done the way it
  was done before; or corrects the lead — which the lead then also remembers.
- **Pinned** items are present regardless.
- **Measured, then tuned.** Every included or recalled item records whether the lead relied on it — the lead marks
  the keys it used; a correction that memory could have prevented records a miss, as does an item the lead found
  on its own that the probe scored below the bar. The bars start from the embedding model's calibration and are
  tuned per organisation from these numbers, which the memory screen shows.

The probe and the rules cover each other's blind spots: the probe finds what matches by meaning but misses “do it
like before”, where the meaning is in the referent; the rules catch the referents but cannot know of a memory the
lead has never seen.

## Workers and helpers

A worker gets the pinned items of the person its run is for as files in its home, refreshed at run start — in a
task's session, whoever asked for that run — the same cue that memory exists, and the same `recall` tool
through the site's endpoint under its run's capability; its helpers inherit them under the worker's tool allow-list.
A run in a home other people's runs share — a project's own task runs, which share the project's home and
container — is given no person's memory: no person's items in its file, and its `remember`, `forget` and `recall`
reach the place's memory only. A person's own scopes are reached only from a run in that person's own home.
The lead puts into the brief whatever it recalled that the worker needs. A worker's `remember` goes to hq and
becomes a record like any other. Agent × place memory reaches workers in that place only.

## Knowledge delivery

Knowledge is not indexed in hq and never copied there. Its index is the place's own `knowledge/INDEX.md`, kept by
the team — agents included, as team members writing files. A worker reads it natively. The lead reaches it only
through `recall(query)`: hq asks the place's site, which searches its files — grep today, a site-side index with the
same embedding model later — and returns a bounded excerpt with provenance. A delivered excerpt is **not
forwardable**: the lead may quote it to the person, who decides; it cannot be put into a brief for a worker in
another place, and a worker in another place cannot recall it.

| Source | Reachable by | May travel to |
|---|---|---|
| The person's memory — global, and this agent's layer | Any run for that person with this agent: lead, workers, helpers. In a task's thread, the person is the author of the message the turn answers | The person's own work in any place |
| Agent × place memory | The lead, for the conversation's place; workers and helpers in that place | Not out of the place |
| This conversation's earlier operation results | Its lead and its workers | Within the conversation |
| A place's knowledge files | The lead, for the conversation's place; workers and helpers in that place | Not out of the place; quoted to the person only. Another boundary's knowledge reaches the conversation only inside its worker's result summary |
| Another place's anything | — | — |

When a source is unavailable it says so: a sleeping site makes a place's knowledge “unavailable from that site”
while memory in hq still answers; over budget returns what fits and names what was cut; not permitted is the same
refusal the tools give today — nothing is widened, nothing relocated.

## Options considered

Recorded here so the decision records can be cut from this spec when the unit closes.

- **Memory on the person's site**, beside their harness home. Rejected: ties every conversation to that site being
  awake, and makes cross-site delivery the common case rather than the exception.
- **Memory as files in each harness home as the authority.** Rejected: the same item would live in one home per
  boundary, the lead in hq could not read it, and the person could not curate it on a screen. Kept only as a
  read-only projection of pinned items.
- **Injecting both layers whole into every run** (today). Rejected: cost grows with memory and the context carries
  what no one asked for.
- **A title index in every turn, with full-text search behind it.** Rejected as inefficient: eighty titles the
  model must then ask about, and lexical search misses meaning.
- **Automatic retrieval before every turn.** Rejected: spends tokens on every turn and takes the decision from the
  lead. Kept only as the cheap probe that informs the lead.
- **Recall purely on the lead's judgement.** Rejected: hit or miss — the lead cannot look for what it does not know
  exists. Kept as the middle tier, informed by the probe and measured.
- **A provider's embedding model as the default.** Rejected as the default: a key per organisation, a vendor, and
  an index that splits by who paid; kept as an option that re-embeds once.
- **A separate vector database.** Rejected: a second store to keep in step, for a table of thousands of rows that
  Postgres searches in milliseconds.
- **Indexing every place's knowledge centrally in hq.** Rejected: it moves knowledge out of the place.
- **Summarising whole conversations into memory automatically.** Rejected for now: growth with no curation;
  `remember`'s judgement and the tidy are the gate.

## What changes from today

Both memory layers stop being injected whole; a third scope, agent × place, takes the automatic learnings so
`knowledge/` is the team's alone; items gain a title, tags, a pin, a vector, a key, a type, hit counts and a
supersedes link, and the body grows from today's five hundred characters to about fifteen hundred; the memory
table gains an embedding column; a local embedding model becomes a platform
component; the memory screen gains the place scope and the recall measurements; project knowledge gets a read-only
view from the place; and the rule for which runs may use the memory tools becomes one: a run with a person it is for
and an acting agent may read and write, which answers the open questions about project chats and personal task runs.
*The person a run is for* is the author of the message that commissioned it, carried on the operation; a run
nobody commissioned — a pulse run, a routine — is for no person and reaches agent × place memory only, which
replaces today's choice of an arbitrary administrator.

## Acceptance criteria

- [ ] Memory is recalled by meaning from hq: the probe's three tiers behave as specified, `remember` dedupes, the
      memory screen shows the three scopes and the recall measurements, and a place's knowledge reaches the lead
      only as a bounded excerpt that cannot be forwarded.

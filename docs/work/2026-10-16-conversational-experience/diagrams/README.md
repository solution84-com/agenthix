---
name: diagrams
description: The conversational experience's diagrams, one per file, linked from the spec's parts.
created: 2026-10-16
author: leang
---

# Diagrams

One diagram per file, Mermaid, linked from the part of the spec it belongs to ([overview](../spec.md)).

| Diagram | Shows |
|---|---|
| [Logical architecture](logical-architecture.md) | The coordinator, the lead, hq's operations, workers and helpers |
| [Where a conversation's record lives](conversation-record.md) | hq holds the conversation, the site the work |
| [Data model](data-model.md) | The tables in hq and on a site |
| [Lead, worker, helper](workers.md) | The three layers and what crosses between them |
| [How a result comes back](results.md) | From a run completing to the lead's report or continuation turn |
| [Model selection by policy](model-policy.md) | Each layer picks for the one below, within the policy |
| [Where the conversation's tools live](tools.md) | In process for the lead, the site's endpoint for workers |
| [Memory and knowledge — components](memory-components.md) | Records in hq, files in the place, the recall service |
| [Memory — write and read](memory-pipelines.md) | remember and recall |
| [What decides a recall](recall-trigger.md) | The three-tier trigger |
| [How a turn's context is assembled](context-assembly.md) | Four parts ordered by volatility; the cache point; expansions appended |
| [Compaction in segments](compaction.md) | The high mark, one summariser call, a segment written once |
| [A spoken turn](voice-turn.md) | Speech in, an ordinary turn, the reply spoken in step; a shown part; an interruption; a result waiting for the sentence |

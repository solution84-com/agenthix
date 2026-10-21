---
name: Compaction in segments
description: At the high mark, one summariser call folds the oldest messages into a new segment, written once; the block is rebuilt and a marker goes into the record.
created: 2026-10-16
author: leang
---

# Compaction in segments

When and how the lead's context is compacted. Spec: *Long conversations*.

```mermaid
flowchart LR
  S["turn about to start"] --> Q{"context ≥ 70%<br>of the model's window?"}
  Q -->|no| T["run the turn on the existing prefix"]
  Q -->|yes| F["summariser call, talking model<br>reads the cached prefix<br>folds everything older than the last 30%<br>expansions are cited, not summarised again"]
  F --> G["new segment in the record<br>span · brief · full summary<br>written once"]
  G --> H["rebuild the compaction block<br>ledger head · older briefs · this full summary"]
  H --> M["summarised message in the record<br>span · brief · what the ledger kept"]
  M --> N["run the turn on the new prefix<br>cached once, reused for tens of turns"]
  classDef keep stroke:#3fb950,stroke-width:2px
  class G,H keep
```

Compaction happens at the start of a turn and never inside one; *Summarise now* by the person runs the same steps at once. A segment is never summarised again.

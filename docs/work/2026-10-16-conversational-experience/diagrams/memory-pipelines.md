---
name: Memory — write and read
description: remember embeds once and dedupes; recall embeds a query once, ranks by similarity and warmth.
created: 2026-10-16
author: leang
---

# Memory — write and read

The two pipelines and their triggers. Spec: *Memory and knowledge › Recall by meaning*.

```mermaid
flowchart LR
  subgraph W["WRITE — only the agent's judgement, or the person"]
    A["remember(scope, title, body, tags)"] --> B["embed title + body + tags"]
    B --> C{"nearest existing<br>very similar?"}
    C -->|yes| D["supersede or merge<br>same key"]
    C -->|no| E["insert: text · scope · vector"]
  end
  subgraph Rd["READ — recall, writes nothing"]
    Q["a query"] --> F["embed once<br>not stored"]
    F --> G["nearest neighbours<br>in the allowed scopes"]
    G --> H["rank: similarity × warmth<br>pinned first"]
    H --> I["top k bodies, bounded<br>with keys and provenance"]
  end
```

Only the write side stores vectors. The read side embeds a query, uses it once, and writes nothing.

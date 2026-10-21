---
name: Memory and knowledge — components
description: Memory records in hq, knowledge files in the place, and the recall service between them.
created: 2026-10-16
author: leang
---

# Memory and knowledge — components

The pieces, and who reads and writes what. Spec: *Memory and knowledge*.

```mermaid
flowchart LR
  subgraph P["Person"]
    U["The person"]
    MS["Memory screen<br>edit · pin · delete"]
    T["Project team"]
  end
  subgraph HQ["hq"]
    L["Lead"]
    R["Recall service<br>embeddings · ranking · delivery"]
    M[("Memory store<br>person · agent×person · agent×place")]
  end
  subgraph S["A place's site"]
    K["Knowledge<br>the place's files"]
    W["Worker → helpers"]
  end
  U --> L
  MS <--> M
  T -->|edit files| K
  L <-->|remember · recall| R
  R --- M
  W -->|reads natively| K
  W <-->|remember · recall| R
  R -.->|bounded excerpt| L
  K -.->|asked by hq| R
```

Memory is written only through `remember`; knowledge is edited only in the place; hq asks a site for a knowledge excerpt and keeps nothing.

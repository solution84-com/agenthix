---
name: Where a conversation's record lives
description: hq holds the conversation; the site holds the work; the harness's own files are working state.
created: 2026-10-16
author: leang
---

# Where a conversation's record lives

What is stored where once hq answers directly. Spec: *Where a conversation's record lives*.

```mermaid
flowchart LR
  subgraph HQ["hq"]
    C["Conversation<br>messages · operations"]
  end
  subgraph S["a place's site"]
    R["Runs<br>transcript · tool calls"]
  end
  subgraph H["harness home"]
    F["session files<br>working memory, not a record"]
  end
  UI["the screen"] -->|drawn from| C
  C -->|an operation points at| R
  UI -.->|fetched only when opened| R
  R --- F
```

The screen is built from hq. A run's detail is fetched from the site only when the person opens it. The harness's files are never read as a record; losing them restarts a worker, not the conversation.

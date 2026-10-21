---
name: Where the conversation's tools live
description: Direct inference calls hq's operations in process; workers keep the site's endpoint.
created: 2026-10-16
author: leang
---

# Where the conversation's tools live

Two routes to one entry. Spec: *Tool execution contract*.

```mermaid
flowchart LR
  subgraph HQ["hq"]
    L["Inference turn<br>mints a turn capability"] -->|in process| AD["Tool adapter<br>foreground · operation-returning"]
    AD --> CO["callOperation<br>one entry · one permission check"]
    DA["Data API"] --> CO
  end
  subgraph S["site"]
    W["Worker run"] -->|per-run token| MCP["Site MCP endpoint<br>forwards"]
  end
  MCP -->|control channel| DA
  CO -->|"foreground"| RES["result within the wait limit"]
  RES -.->|"still running at the limit"| PR["detached: the same call carries on<br>{operationId, accepted}<br>result as a completion"]
  CO -->|"operation-returning"| OP["Operation created<br>{operationId, accepted}<br>detaches"]
```

No new gateway. A foreground tool answers in the turn; an operation-returning tool creates an operation and detaches, its completion arriving later in the mailbox.

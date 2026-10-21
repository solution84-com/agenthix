---
name: Logical architecture
description: The conversation coordinator in hq, the lead's direct inference, hq's operations, and the workers and helpers on a boundary's site.
created: 2026-10-16
author: leang
---

# Logical architecture

How a conversation's pieces fit, from the person to a boundary's harness. Spec: *Logical architecture*.

```mermaid
flowchart TD
  UI["Person · conversation UI"] --> CC["hq · Conversation Coordinator"]
  CC <--> MB["Durable conversation + event mailbox"]
  CC --> LLM["Direct LLM runtime<br>streaming, model abstraction"]
  LLM --> GW["hq's operations, in process<br>turn capability: the place's"]
  GW --> FT["Foreground tools<br>hq operations · site reads · connected services"]
  GW --> AD{"admission per operation<br>member · assigned · allowed<br>capability for that boundary"}
  AD --> TS["Task service<br>other durable agents"]
  AD --> SW["A boundary's standing worker<br>harness session, same agent<br>any boundary the person and agent share"]
  SW --> SA["The harness's subagents<br>separate contexts, narrowed"]
  TS -- "durable events" --> MB
  SW -- "durable events" --> MB
```

The coordinator owns admission, ordering, turns, the mailbox and recovery; a boundary's worker owns the work it is briefed with, and its helpers are the harness's own subagents.

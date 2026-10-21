---
name: Lead, worker, helper
description: The three layers that carry a conversation's work, and what crosses between them.
created: 2026-10-16
author: leang
---

# Lead, worker, helper

Three layers, each with one job. Spec: *Workers*.

```mermaid
flowchart TD
  P["Person"] <-->|talks| L["Lead<br>direct inference in hq<br>decides which boundary"]
  L -->|"brief (operation)"| W1["Worker in Shop<br>harness session · Shop's authority"]
  L -->|"brief (operation)"| W2["Worker in Media<br>harness session · Media's authority"]
  L -->|"task"| T["Another agent's task<br>its own session"]
  W1 -->|"Task / task tool"| H1["Helpers<br>separate contexts · narrowed"]
  W1 -.->|result summary| L
  W2 -.->|result summary| L
  T -.->|"run's result"| L
  H1 -.->|"to the worker only"| W1
```

Solid arrows are briefs; dotted arrows are results. A helper never reports to the lead. Authority never crosses from inside a harness: only the lead commissions, through one standing worker per boundary, which runs one brief at a time.

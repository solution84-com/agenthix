---
name: How a result comes back
description: From a run completing to the lead's report or continuation turn.
created: 2026-10-16
author: leang
---

# How a result comes back

One operation completing, and what the lead may do. Spec: *Results*.

```mermaid
sequenceDiagram
  participant W as Worker or task run
  participant S as Site
  participant HQ as Coordinator (hq)
  participant L as Lead
  participant P as Person
  W->>S: run ends with a result
  S->>HQ: operation complete + result (+ task state)
  HQ->>HQ: mailbox · Operation completed · completion card
  alt asked for in this conversation
    HQ->>L: report turn (speech only), always
    L->>P: "ready — want to go through it?"<br>notification carries this line
  else part of an authorised sequence
    HQ->>L: continuation turn instead of the report turn
    L->>P: presents the result
    L->>HQ: next authorised operation
  else conversation closed
    HQ->>P: notification with the result's one line; no turn
  end
```

A worker's result is its summary; a task's is the run's result, stated by its agent, also written to the task's latest result. A helper's result reaches only its worker.

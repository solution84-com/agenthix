---
name: Data model
description: The tables in hq and on a site for a conversation, its operations and its workers.
created: 2026-10-16
author: leang
---

# Data model

One conversation, its records in hq, and the work it points at on a site. Spec: the overview's *Data model*.

```mermaid
erDiagram
  CONVERSATION ||--o{ CONVERSATION_MESSAGE : "says"
  CONVERSATION ||--o{ INFERENCE_TURN : "one live at a time"
  CONVERSATION ||--o{ OPERATION : "commissions"
  CONVERSATION ||--o{ CONVERSATION_SEGMENT : "compactions"
  CONVERSATION ||--o{ NOTIFICATION : "about"
  CONVERSATION ||--o{ AGENT_SESSION_HQ : "one standing worker per boundary (not a task home)"
  TASK ||--o| AGENT_SESSION_HQ : "a task's session serves its thread"
  OPERATION }o--o| AGENT_RUN_SITE : "site + run"
  OPERATION }o--o| TASK : "or a task"
  AGENT_SESSION_HQ ||--|| AGENT_SESSION_SITE : "same session, mirrored"
  AGENT_SESSION_SITE ||--o{ AGENT_RUN_SITE : "one per brief"
  AGENT_RUN_SITE ||--o{ TRANSCRIPT_ENTRY : "what the worker did"
  AGENT_RUN_SITE ||--o{ TOOL_CALL_LOG : ""
  CONVERSATION {
    string home "person | project | task"
    string openedBy_agent
    string status_closedReason_archived_keep
    string title_model_runtime_ledger
  }
  CONVERSATION_SEGMENT {
    string span_firstLast
    string brief_fullSummary_ledgerHead
  }
  OPERATION {
    string kind "worker | task | tool"
    string mode "foreground | background"
    string brief_state_resultSummary
    string where "siteId+runId | taskId"
    string boundary_authorisedBy
  }
```

Tables in capitals ending `_HQ` live in hq, `_SITE` on the site; `CONVERSATION`, `CONVERSATION_MESSAGE`, `INFERENCE_TURN`, `OPERATION` and `CONVERSATION_SEGMENT` are new in hq, and `NOTIFICATION` gains its link; the site's shape is unchanged. A sub-run has no row in hq: fan-out is the harness's helpers inside a run.

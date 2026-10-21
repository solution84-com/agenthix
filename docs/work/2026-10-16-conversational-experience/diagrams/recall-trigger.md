---
name: What decides a recall
description: A cheap probe gives certain, probable or silent; the lead decides on probable; outcomes tune the bars.
created: 2026-10-16
author: leang
---

# What decides a recall

Each turn's decision. Spec: *Memory and knowledge › What decides a recall*.

```mermaid
flowchart LR
  A["turn about to start"] --> B["probe: embed the composed query<br>search allowed scopes · ms · not stored"]
  B --> C{"best similarity"}
  C -->|"≥ high bar · certain"| D["include up to 3 bodies"]
  C -->|"between the bars · probable"| E["hint: titles and keys<br>of up to 3, one line"]
  C -->|"< low bar · silent"| F["nothing added"]
  P["pinned items"] --> G["the lead's turn"]
  D --> G
  E --> G
  F --> G
  G -->|"judges it should look"| H["recall(key) · recall(query)"]
  H --> G
  G --> O["outcome recorded<br>used · unused · missed"]
```

The probe is automatic and cheap; the decision on the middle tier is the lead's; used, unused and missed outcomes tune the bars per organisation.

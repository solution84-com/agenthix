---
name: Model selection by policy
description: Each layer picks the model for the one below it, within the boundary's model policy.
created: 2026-10-16
author: leang
---

# Model selection by policy

Who picks which model, and from what. Spec: *Model selection*.

```mermaid
flowchart LR
  subgraph POL["Model policy — org default, project, or person's own space"]
    T["talking"]
    LW["light work"]
    HW["heavy work"]
    AL["allow-list · ceiling"]
  end
  L["Lead<br>talks on the talking model<br>(person's one knob)"] -->|"judges the brief:<br>names the worker's model"| W["Worker<br>runs on light or heavy"]
  W -->|"names each helper's model<br>harness per-agent setting"| H["Helpers"]
  POL -.->|constrains| L
  POL -.->|constrains| W
  ACC["Access<br>ChatGPT plan · API key"] -.->|"what is possible"| L
  CRED["Boundary credentials"] -.->|"what is possible"| W
```

The policy says what is preferred; access says what is possible; each layer takes the preferred model its access reaches. An agent's defaults are the fallback where no policy says.

---
name: How a turn's context is assembled
description: Four parts ordered by how often they change, so the provider's cache keeps the prefix; expansions land behind the cache point.
created: 2026-10-16
author: leang
---

# How a turn's context is assembled

What the lead receives on each turn. Spec: *Long conversations*.

```mermaid
flowchart LR
  A["1 · instructions + policy<br>changes with the agent's version"] --> B
  subgraph B["2 · compaction block · changes at a compaction only"]
    direction TB
    L["ledger head<br>decisions · approvals · open operations<br>obligations · keep-this"]
    S1["segment 1 · brief · span"]
    S2["segment 2 · brief · span"]
    S3["segment 3 · full summary · span<br>the largest piece"]
    L --> S1 --> S2 --> S3
  end
  B --> C["3 · message window<br>since the last compaction, verbatim<br>append-only"]
  A -.- K1(("cache<br>point 1"))
  B -.- K2(("cache<br>point 2"))
  C --> D["4 · this turn's message + turn block<br>memory probe · time-bound facts<br>appended to the message"]
  D --> K(("cache<br>point 3<br>end of the last message"))
  K --> T["the turn and its tool loop<br>every call reuses 1–4"]
  T -.->|"expand(segments)"| E["tool result: full summaries<br>appended to the window"]
  T -.->|"messages(segment, page)"| F["tool result: verbatim messages<br>from the record, paged"]
  classDef stable stroke:#3fb950,stroke-width:2px
  classDef vol stroke:#d29922,stroke-width:2px
  class A,B,C,L,S1,S2,S3 stable
  class D,E,F vol
```

Green never moves between compactions and only grows at the end; orange is new each turn; the third breakpoint sits at the end of it, so the tool loop reuses everything up to and including this turn's message, and next turn it is window history. Three breakpoints where a provider wants them set: a compaction invalidates only what follows point 2, an ordinary turn only what follows point 3. An expansion is appended, never substituted into the block.

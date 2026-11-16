---
created: 2026-11-16
description: An agent is shown a small set of must-have tools in full, a few lines naming the areas of everything else, and two tools to find and call the rest; the rest are found by a search, by meaning and by words, over an index embedded with hq's built-in model. Every tool stays callable by name and hq's MCP server still lists them all.
---

# ADR-0193: An Agent Is Shown Its Must-Have Tools and Finds the Rest by Search

**Date:** 2026-11-16
**Status:** Accepted

## Context

Every tool an agent could call was shown to it in full on every request: 38 in a conversation's reply, about 70 in a
background run, 70–80% of a first request of about 20,000 tokens. On a low-cost model that costs accuracy (it misses
the tool that matters) and context window, and it grows with every tool added. Tools people connect themselves (MCP
endpoints) would make the list unbounded.

## Options considered

- **Show every tool, slimmed.** About a third smaller, and still growing with every tool. Rejected as the end state;
  done first anyway.
- **A catalogue line per hidden tool.** Fine for 40 tools, about 25,000 tokens for a thousand, and the agent guesses
  from names. Rejected.
- **The provider's own tool search** (deferred tools). Claude only: neither the baseline model nor OpenCode has it.
  Rejected.
- **Load found tools into the tool list.** Native calls, but the cached prefix breaks at each load, and on the site it
  depends on the harness refreshing its list mid-run. Rejected.
- **Must-haves shown, areas named, the rest searched and called through one tool (chosen).**

## Decision

1. **An agent is shown its must-have tools in full**, and two more: `find_tools` and `use_tool`. A tool is a
   must-have when most asks start from it, or a rule says it must be called before a search could find it.
2. **The platform's other tools are named, by area, without descriptions**; a tool from outside is named only by its connector, so the lines grow with what we ship, never with what is connected.
3. **`find_tools` searches by meaning and by words** over an index of every tool, embedded with hq's built-in
   embedding model, and answers the best few with their full definitions.
4. **`use_tool` runs a found tool through the same path its native call takes**: validation, Ask and Never on its own
   name, and records under its own name. Searching grants nothing; a tool at Never is never found.
5. **The tool list doesn't change within a conversation**, so the provider's cached prefix stays whole.
6. **Every tool stays callable by name, and hq's MCP server lists every tool in full** for people's own clients.
7. **A tool connected from outside goes into the same index**, and is called through hq, never handed to an agent's
   harness, so its credentials and its permissions stay hq's.

## Consequences

### Positive

- A first request of about 10,000 tokens in a conversation and 8,000 in a run, from about 21,000 and 18,700, and no
  longer growing with the number of tools.
- One way to offer any tool, ours or connected, on every provider and harness.

### Negative

- A folded tool costs the agent one more call (the search) the first time it needs it.
- A `use_tool` input isn't checked by the provider before it is sent; hq checks it and says what is wrong, as for any
  refused call.
- Every new tool needs an area and must decide whether it is a must-have.

## References

- The unit that made it: `docs/work/2026-11-16-model-checks-baseline/` (spec and stock-take).
- [versioning.md](../architecture/versioning.md): the change is an addition.

## Notes

- **2026-11-16 — implemented** by the unit that made it, for the platform's own tools, in a conversation and in a run:
  must-haves (14 in a conversation, `open_board` among them), every folded platform tool named by area under plain
  labels, `find_tools` and `use_tool` through the native call's path. Proved on the baseline model and through a real
  `claude` process. The first request fell to about 7,600 tokens in a conversation and 7,350 in a run. Connected tools
  (point 7) wait for the gateway.

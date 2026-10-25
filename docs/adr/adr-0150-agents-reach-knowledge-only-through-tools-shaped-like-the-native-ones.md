---
created: 2026-10-25
description: Every agent, the lead in hq and workers on a site, reaches every level of knowledge through one set of tools shaped like the native Grep, Read, Write and Edit, built on file tools of Agenthix's own in core; knowledge is never mounted into a run, and each answer says which level it came from.
---

# ADR-0150: Agents Reach Knowledge Only Through Tools Shaped Like the Native Ones

**Date:** 2026-10-25
**Status:** Accepted

## Context

Knowledge exists at four levels: the platform guide, the organisation's, a project's and a person's. The lead runs in
hq and has no files (adr-0121); workers run on a site and had a place's knowledge folder mounted into their run. The two
reached it differently, neither could do what the other did, and a mounted folder can be changed by any command a
worker runs, with no check, no previous version and no record of who. Agents are trained on their harness's own file
tools, and use unfamiliar ones worse.

## Options considered

- **Mount knowledge into runs and let agents use their native tools.** Rejected: nothing can refuse a bad change, a
  shell command bypasses any convention, and the lead has no files to use them on.
- **Tools of new shapes (save a topic, list topics).** Rejected: agents use what they are trained on best, and a
  listing truncates once a place holds more than a few hundred pages.
- **Separate tools per level (one for the platform guide, one for a place).** Rejected: the agent would have to choose
  a tool and a level before it knows where the answer is.
- **Index knowledge in hq and search it there.** Rejected, as adr-0123 found: it copies each place's files out of the
  place that owns them.
- **One set of tools shaped like Grep, Read, Write and Edit, over every level, on file tools of Agenthix's own
  (chosen).**

## Decision

1. **Every agent reaches knowledge only through `search_knowledge`, `read_knowledge`, `write_knowledge`,
   `edit_knowledge` and `delete_knowledge`**, whose parameters and output are those of Claude Code's Grep, Read, Write
   and Edit, with only a page's level added (and a scope to search one level). Search runs ripgrep, the program Grep
   runs. Writing, editing and deleting reach only an agent that may change files in its place.
2. **One search covers every level the agent may see**, and every hit is marked with its level, which is also the
   page's name for reading. The most specific level wins where pages differ.
3. **Knowledge is never mounted into a run.** It lives on the site that holds the place, outside the folder runs mount;
   hq never indexes or copies a place's knowledge, and asks the sites at search time.
4. **The tools are built on file tools of Agenthix's own in `@agenthix/core/file-tools`** — grep, read, write and edit
   over any folder they are given, with the guards against hostile patterns and names inside them — lifted from the
   OpenCode plugin's own file tools (adr-0085), which now run on the same module.

## What this binds

- A new kind of knowledge, or a new level, is reached through these tools and marked in their results; no other path
  into knowledge is added.
- Anything that searches or opens files by a name an agent gave goes through the file tools in core, and their guards.
- A runtime of Agenthix's own would use the same file tools.

Undoing it means a second way into knowledge that the gate (adr-0151) does not cover, or an agent choosing among tools
by level.

## Consequences

### Positive

- The lead and workers work alike, on tools they already know, and an answer always says where it came from.
- One implementation of the safety-critical file code serves the plugin and knowledge.

### Negative

- A search fans out to each site holding a level; a sleeping site makes its level unavailable, and the result says so.
- ripgrep must be in hq's image and the site's server image.

### Risks

- **A pattern is written by a model that may have read untrusted text.** What bounds it: ripgrep's engine never
  backtracks; the program runs without a shell, with arguments built only from allowed parameters, killed after a
  time limit, with size caps and a rate limit; names resolve inside their root only; errors are fixed messages.

## References

- adr-0123 — superseded by this record. Its rule that hq never indexes or copies a place's knowledge stands, restated
  here in decision 3; the bounded, not-forwardable excerpt and knowledge written by editing files are replaced.
- adr-0085 — Agenthix owns a harness's file tools; their code now lives in core.
- adr-0121 — the lead is direct inference in hq.
- adr-0122 — memory in three scopes: what an agent learns on its own is memory, not knowledge.
- adr-0151 — every change to knowledge goes through one gate.

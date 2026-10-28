# 5 · The run and the conversation

Part of the [Skills and the asset layer spec](../spec.md). Boards 6, 7 and 10, drawn with the UI boards.

## Delivery per turn

hq resolves what an agent will see for a run: built-ins not switched off; installed skills that every agent or this agent has,
at their pinned versions; the place's switched-on file skills by fingerprint; the person's switched-on
skills when the run is their own conversation. It applies the clash order ([part 4](04-files.md)) and delivers the
installed and personal sets as content by fingerprint, as the organisation's package is delivered today (adr-0072).
The site stages everything per turn under `<source>-<slug>`, unchanged (adr-0084), and records what the run used.

Installed and personal content in a site's package cache is bounded like file skills, since unsigned uploads and
personal skills now reach it, and the cache stays out of every container's reach (security review L4).

The agent package stops carrying its own `skills/`, since an agent's installed skills now come from the installed
set. The staging sources change accordingly, with the old ones marked deprecated before removal and the site protocol's
version moved (versioning.md).

## Picking a skill (R3)

Typing `/` at the start of the message box opens a picker of the skills this conversation's agent has, with name,
description and where each comes from, narrowed as the person types. It reuses the `@` picker's hook and key
handling. The choice travels as a **structured field** beside the message, never as rewritten text. The site turns
it into the runtime's own form: a skill invocation on Claude, and an instruction to load that skill first on
OpenCode. **The site validates the field** (security review M7): it accepts it only if it equals a name staged for
this turn whose skill doesn't set `user-invocable: false`; otherwise it drops the field and keeps the text. Message
text beginning with `/` is escaped so the runtime never parses it as a command, so a typed `/word`, a staged skill's
name included, is plain text and the runtime's bundled commands are never reached.

## Seeing it used (R4)

The work step reads **Used the skill Code Review**, with the person-facing name, and opens the skill beside the
conversation at the version the run used, found from the run's recorded fingerprint. A `skill` target joins task,
board and file in the work steps. **Opening it checks access at view time** (security review M6): to the place it came
from, and a person's own skill opens only for that person. When a person is removed, their personal skills' kept
content goes, leaving only identity and fingerprint on the runs that used them.

## Proposing a skill (R6)

Agents draft; people publish. A platform tool, `propose_skill` (name, description, files, why, the level it aims at,
and optionally the skill it edits), is the agent's only way to write a skill. Where it lands depends on who asked:

- **The person may edit at that level, and the call comes from their own interactive conversation:** it updates their
  draft, and the conversation's card offers *Open draft* and *Publish* (D24). The person is taken from the run's
  on-behalf-of record, as `propose_workflow` takes its proposer, never from a tool argument.
- **Any other run** (a task, a scheduled or automated run, a run someone else started): always a proposal, never a
  draft (security review H5).
- **They may not:** it is a proposal, aimed at a level the person can change on the card, and reviewed by that
  level's maintainers (D27): the organisation's administrators and Library maintainers; a project's administrators; or the person, for Your space. Review
  accepts, edits then accepts, or rejects with a note; the agent is told the outcome on its next turn.

**An agent's publish always goes through a person's approval** (D31). An agent may ask to publish, roll back, switch
a skill on or install; each such call becomes an approval card for the person it acts for, runs only when that person
approves it and holds the right at that level, and is recorded with the person as publisher, "requested by" the agent.
No agent setting skips this gate, *Bypassed* included (today a bypassed agent runs even tools set to Never). Trust
settings and naming Library maintainers have no agent tool.

Each call is checked as `propose_workflow`'s are: the Agent Skills rules (R8), size, ignored header keys, files named
by `SKILL.md` present, and a limit on proposals per run. A draft or a proposal reaches no agent. The built-in `skill-creator` teaches agents to write a good
skill and to propose it rather than write it into files; a skill an agent writes into files anyway is governed by the
place's default (D13).

## Cost

Agents having only the skills they need, rather than all 18, is the main reduction. The agent's page shows an
estimate of what its listing costs per request, and warns above about 20 skills or 4,000 tokens (R9). The unit
measures each part of a request on both runtimes, before and after; a search tool over skills is built only if that
measurement calls for it.

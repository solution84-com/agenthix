---
created: 2026-10-27
description: A few skills ship built into hq and reach every agent, beside the user guide as platform knowledge. A skill says what to do for one kind of task and points to the guide; the guide says what things are. Instructions always steer, skills instruct, knowledge informs.
---

# ADR-0156: Built-in Skills Sit Beside Platform Knowledge

**Date:** 2026-10-27
**Status:** Accepted

## Context

adr-0149 made the user guide the only source of platform knowledge, and rejected a platform skill as a second
description of the product. Since then, some steps every agent needs to work in Agenthix have no home: how to use git
in a workspace, and how to write a skill and propose it rather than write it into files. They were copied by hand into
several library skills and templates, and drifted. A lookup in the guide tells an agent what something is, but not
reliably what to do: an agent searches knowledge only when it thinks to, while a skill's description is in front of it
on every turn.

## Options considered

- **Agents search platform knowledge for the steps.** Rejected: nothing makes the agent look, and the guide is written
  for people, describing screens rather than steps.
- **Keep the steps in each template's own skills.** Rejected: the copies drift, and agents made without a template
  never get them.
- **Put the steps in every agent's instructions.** Rejected: instructions are paid for on every request, and these
  steps matter only for some tasks.
- **A small set of built-in skills shipped with hq, written for the agent, pointing to the guide (chosen).**

## Decision

1. **A built-in skill ships in hq's image and reaches every agent**, updated with each release. An administrator may
   switch one off. A built-in that only applies to some runs is staged only for them (`working-with-git` only where
   the run works in a repository).
2. **A built-in says what to do; the guide says what things are.** A built-in gives steps and points to guide pages
   rather than describing the product again.
3. **The three are kept distinct:** instructions always steer an agent; a skill instructs it for one kind of task;
   knowledge informs it. An organisation's processes live in knowledge, and its skills enforce them.
4. **Built-ins stay few**: a skill is built in only when every agent needs it to work in Agenthix, whatever its role.
   Trade know-how is offered on the shelf and installed by choice.

## What this binds

- adr-0149 is narrowed: the guide stays the only *description* of the platform; built-in skills are steps, not a second
  description.
- A new built-in must pass the test in 4; anything else goes on the shelf.
- Platform steps are written once, in a built-in, never copied into templates.

Undoing it means the steps go back into templates or instructions, and drift again.

## Consequences

### Positive

- Every agent gets the platform's steps, at the running version, without copies.
- Instructions stay short; the steps cost only a description until used.

### Negative

- Some duplication between a built-in and the guide remains, kept small by pointing rather than restating.

### Risks

- **A built-in and the guide disagree after a change.** Accepted: both ship in the same image, so the release that
  changes one can change the other.

## References

- adr-0149 — narrowed by this record.
- adr-0084 — how skills are staged per turn.
- adr-0150 — how agents reach knowledge.

---
created: 2026-10-27
description: An agent never makes a skill live. It drafts or proposes through one tool; a person with the right publishes. An agent's request to publish, roll back, switch on or install is always an approval card, whatever its approval mode. Skills found in files run only as their place's switches allow, keyed by place, path and fingerprint, and Off by default as shipped.
---

# ADR-0159: Agents Draft Skills, People Publish Them

**Date:** 2026-10-27
**Status:** Accepted

## Context

A skill is standing instruction: once live, it steers every turn of every agent that has it. When this was decided,
an agent could write a `SKILL.md` into a place's files with ordinary file tools, and it ran on the next turn with no
review. A run that read hostile content could plant instructions that persisted. Skills also arrive in places'
files and in workspaces' repositories, which hq does not own and cannot pin.

## Options considered

- **Let agents write skills freely, as before.** Rejected: one injected turn becomes standing instructions.
- **Stop reading skills from files.** Rejected: teams keep skills in their repositories, and people write their own.
- **An approval setting per agent that can skip review.** Rejected: a bypassed agent already runs tools set to Never;
  a skill outlives the run, so it must not ride on that setting.
- **Organisation administrators act inside every project's skills.** Rejected: a project's administrators own its
  files; the organisation governs through its default.
- **Agents draft, people publish; skills in files gated by switches (chosen).**

## Decision

1. **An agent's only way to write a skill is `propose_skill`.** From the asking person's own interactive conversation,
   where that person may edit at that level, it updates their draft; from any other run it is a proposal for review.
   The person comes from the run's record, never from a tool argument.
2. **An agent's request to publish, roll back, switch a skill on or install is always an approval card** for the
   person it acts for, runs only when that person approves and holds the right, and is recorded with the person as
   publisher. No approval mode skips it, Bypassed included. Trust settings and naming maintainers have no agent tool.
3. **Skills in files run only as their place's switches allow.** The organisation's default ships as **Off by
   default** (also On, or Never); a place may only be stricter. Switches are keyed by place, path and fingerprint, so a
   changed skill is a different one, and staging re-fingerprints what it copies before staging it.
4. **Writing a place's files is open; publishing is the control.** Anyone with write access edits a project's skills;
   its administrators publish, switch and roll back. Organisation administrators govern projects only through the
   default.

## What this binds

- No agent tool makes a skill live, now or later; any new one goes through the approval card.
- No approval mode, present or future, skips that card.
- Staging never stages a file skill whose bytes don't match a fingerprint hq named for that place and path.

Undoing it means agent-written or changed skills run unreviewed again.

## Consequences

### Positive

- An injected turn can't become standing instructions without a person.
- Teams keep their skills in their files and repositories, governed by one switch.

### Negative

- A person has to publish or switch on what an agent wrote before it runs.
- Under *Off by default*, every edit made outside the editor turns the skill off until it is published.

### Risks

- **A place chooses On by default.** Then agents' writes run unreviewed there. Accepted: the choice is stated when
  it is made, and only the place's administrator or the person can make it.

## References

- adr-0084 — staging per turn, which this gates.
- adr-0072 — overrides only narrow.
- adr-0152 — a conversation reaches only its own places.
- adr-0157 — draft and publish for Library assets.

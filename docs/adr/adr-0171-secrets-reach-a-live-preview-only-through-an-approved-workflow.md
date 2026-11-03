---
created: 2026-11-02
description: A live preview gets the project's secrets only from a Start or Reload live preview workflow a person approved, which the platform runs and which hands them to the app's own container; the agent never holds them. The risk that the app's changing code leaks one is accepted, and caught only by the person reading the changes.
---

# ADR-0171: Secrets Reach a Live Preview Only Through an Approved Workflow

**Date:** 2026-11-02
**Status:** Accepted

## Context

Many apps can't start without their settings: a database password, a payment provider's test key. A secret is used
only by a workflow a person approved, run by the platform (adr-0147). A branch's copy never holds `.env`, and the
agent writing the app must not hold the secrets either.

## Options considered

- **Copy the workspace's `.env` into the copy.** Rejected: the agent would read it.
- **Give the secrets to the agent's run.** Rejected: against adr-0147, and the agent's output reaches a model.
- **No secrets in live previews.** Rejected: most real apps would not start.
- **A *Start live preview* or *Reload live preview* workflow, approved by a person, hands them to the app's own
  container (chosen).**

## Decision

**Secrets reach a live preview only through an approved workflow.** The platform runs *Start live preview* or *Reload
live preview*, which names the secrets the app needs, and hands them to the live preview's app container. The agent's
container never holds them, and the output the agent sees is masked, as for any workflow run. An app that needs no
secrets starts without a workflow.

## What this binds

- Nothing puts a secret into a branch's copy, an agent's container, or a prompt.
- Every way a live preview gets a secret is a workflow run, recorded as one.

Undoing it means either the agent can read the secrets, or live previews can't run real apps.

## Consequences

### Positive

- Live previews run real apps with the agent never holding a secret.

### Negative

- A person approves the workflow once per change to it, before secrets reach a live preview.

### Risks

- **The approved workflow runs the app's code, which the agent keeps changing,** so code that sends a secret elsewhere
  can only be caught by the person reading the changes. Accepted: the people who start live previews are developers
  who review what they merge. This acceptance expires if live previews are offered to people who cannot read the code;
  the decision is then revisited.

## References

adr-0147 (a secret is used only by an approved workflow), adr-0148 (an agent runs approved workflows and reads masked
output), adr-0168 (code work on branches).

> **Acted on, behind a flag.** *(annotated 2026-11-03)* Carried out by the unit of work [`2026-11-01-live-preview`](../work/2026-11-01-live-preview/plan.md), phase 2, through the *Start* and *Reload live preview* workflows. Like the live preview, it is behind the `livePreview` flag at experimental (adr-0172).

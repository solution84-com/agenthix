---
created: 2026-10-24
description: No secret value ever enters an agent's container. Anything that needs a secret runs as a workflow — a stored, versioned script a person approved word for word — carried out by the platform's own executor, in a fresh container per step that holds only the secrets that step names. hq keeps the secrets. Git and GitHub go through workflows too.
---

# ADR-0147: A Secret Is Used Only by a Workflow a Person Approved, Run by the Platform

**Date:** 2026-10-24
**Status:** Accepted

## Context

An agent reads text it doesn't control — a README, an issue, a web page — and can be steered by instructions hidden in
it. Any value that reaches its container can then be printed and sent out: the agent doesn't need to see a value in
its prompt to run a command that prints it, and its container has ordinary outbound internet. Git already shows the
hole: its credential helper, which any command in the container can call, hands back a GitHub installation token with
every permission the App holds.

adr-0037 kept deployment secrets away from agents by running operations on GitHub Actions, with GitHub holding the
values, and kept a platform-owned runner only as a fallback, because building secret storage, injection and isolation
ourselves was the larger risk. That covers deploys from a GitHub repository. It does not cover what every integration
needs — a database on the site's machine, a server behind a firewall, the GitHub token git itself uses — and GitHub's
runners can't reach the first two at all.

The constraint: no secret value may ever enter an agent's container, for any integration.

## Options considered

- **GitHub Actions as the only place secrets are used (adr-0037).** Rejected: it can't reach what is on or behind the
  site, and it doesn't take the token out of the agent's container for git itself.
- **A self-hosted GitHub runner on the site (adr-0037's option B).** Rejected: still GitHub-only, needs every
  integration expressed as a GitHub workflow in a repository, and leaves git's own token where it is.
- **Keep secrets in the agent's container but out of its prompt** (an environment variable, a file, a helper that
  hands it out). Rejected: a steered command reads it as easily as the agent.
- **A broker that runs single privileged commands for the agent.** Rejected: what a command does depends on files the
  agent controls, and nothing about it is reviewed before it runs.
- **Approved workflows run by the platform (chosen).**

## Decision

1. **A secret is used only by a workflow:** a script kept in a place's library — a project, or a person's own
   storage — whose exact version a person has approved. The agent writes and proposes workflows; it never approves one,
   and it works with secret names only.
2. **The platform runs it.** An executor — not an agent, with no model — carries out the approved version's steps in a
   fresh container per step, separate from the agent's, and each step's container holds only the secrets that step
   names. What runs is exactly what was approved.
3. **hq keeps the secrets**, encrypted, and sends a value only to a run of an approved version that names it.
4. **Git and GitHub go through workflows.** The credential helper that handed git a token leaves the agent's
   container, which then holds no git credential. Every GitHub installation token passes one check in hq, the mint
   gate, and reaches one repository with only the permissions named; a workflow's is minted for one run, with the
   permissions its approved version declares.

GitHub Actions stays available: a workflow can start a GitHub workflow, and can set a secret on GitHub for one, but
only through a workflow a person approved.

The design is in the unit's spec: [`docs/work/2026-10-24-workflows/spec.md`](../work/2026-10-24-workflows/spec.md).

## What this binds

- **Nothing may put a secret value in an agent's container** — not an environment variable, a mounted file, a helper,
  a tool result or an MCP answer. A new integration is secrets plus workflows, never a credential the agent can reach.
- **Every use of a secret goes through an approved version.** No path runs code with a secret that a person did not
  approve, and no agent can approve.
- **No component asks GitHub for an installation token except through the one check** that ties it to a location's
  own repository connection, in a place still allowed to use that GitHub account, with its permissions named.
- **No component starts a GitHub workflow or sets a secret on GitHub** except an approved workflow.
- Undoing it means putting credentials back in reach of the agent, or moving every integration onto an outside runner;
  either reopens the leak this closes.

## Consequences

### Positive

- An agent can use any integration's secrets without being able to leak them through a prompt.
- What can run with a place's secrets is itemised and reviewable in one place.
- Reaches what GitHub Actions can't: the site's own machine, private networks.

### Negative

- The platform builds and maintains what adr-0037 avoided: an executor image, isolation per step, an egress proxy,
  masking and a scan of changed files, and owns their security.
- Every new version waits for a person. Rule-based checks and an advisory reviewer agent make the review practical;
  neither approves.
- The agent can no longer push with git directly; it runs a workflow.

### Risks

- **A person can approve code that misuses a secret.** The design moves the risk from *any prompt can leak a secret* to
  *a person approved code that leaks it, after the checks and a reviewer read it*. Accepted.
- **The isolation is ours to get right.** A security test suite plants dummy secrets and fails if one reaches anywhere
  the agent can read; it runs with every change to the executor.

## Implementation notes

Built by the workflows unit and merged with it (2026-10-25): hq keeps a place's secrets and decrypts one only for a run of an approved version that names it; the site's executor runs each step in a container of its own; one mint gate gives every GitHub installation token; the git credential helper in the agent's container, the site's git credential endpoint and hq's credential operation are removed, and so is the action that dispatched a GitHub workflow from HQ. How it fits together: [`docs/architecture/workflows.md`](../architecture/workflows.md).

## References

- adr-0037 — superseded in part: sections 3, 4 and 8 (see the index). Its operations model — operations are files,
  secrets are referenced by name, the platform doesn't categorise secrets by purpose, author and approve are separate —
  still stands.
- adr-0148 — what an agent may do with an approved workflow.
- adr-0060 — authority comes from the boundary: a workflow, its secrets and its approval belong to one place.
- adr-0117 — the executor image is signed and published like every other image.

---
created: 2026-04-27
description: Binding an agent to exactly one project, and the containerisation and security boundaries that follow.
---

# ADR-0021: Agent-Project Binding, Containerisation, and Security Boundaries

**Status:** Superseded by adr-0023

## Date
2026-03-26

## Context

We are building a multi-agent platform where agents autonomously complete tasks across projects on a site. We needed to decide:

1. Whether agents can be shared across multiple projects, or bound to one.
2. How agents are isolated from each other and from the host.
3. What security boundaries must hold across workspace access, credentials, task routing, and multi-agent coordination.

## Decision

**An agent can only belong to one project. A project can have multiple agents.**

Each primary agent runs in its own isolated container scoped to its workspace. Subagents run within the same container as their parent. Containers use TTL-based lifecycle management (spin up on task arrival, shut down after idle period).

The `cwd` setting is a starting directory only — it is not a security boundary. Filesystem isolation is enforced by the container volume mount.

Task creation requires an authenticated site key or connector token. Task queue visibility is scoped per agent — agents cannot dequeue or inspect tasks belonging to another agent. Inter-agent communication is mediated by the site server; containers have no direct network routes to each other.

> **Current implementation status:** Container isolation is not yet implemented. The `ClaudeSDKRuntime` currently runs on the host with `permissionMode: bypassPermissions`. The interim mitigation is a `PreToolUse` path-prefix hook rejecting tool calls outside `workspaceDir`. Full container isolation is required before multi-tenant production deployment.

See [`docs/concepts/agents/agent-security-model.md`](../concepts/agents/agent-security-model.md) for the full security boundary specification covering workspace isolation, credential scoping, task queue security, and multi-agent coordination.

## Consequences

**Positive**
- Compromise of one agent cannot spread to another project
- Clear ownership and simple provisioning mental model

**Negative**
- Agents cannot be reassigned between projects
- A project must exist before an agent can be provisioned
- Container isolation is target state, not current state

## Alternatives considered

**One agent, multiple projects** — rejected. Adds orchestration complexity with no meaningful benefit over simply binding each agent to one project. Cross-project access makes blast radius containment much harder.

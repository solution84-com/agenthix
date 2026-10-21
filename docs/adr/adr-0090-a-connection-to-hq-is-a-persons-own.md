---
created: 2026-10-03
description: An outside tool reaches hq only through a connection a person created, acting as that person and never as more, with its own narrower permissions, an optional project list and an expiry. There is no org-wide key.
---

# ADR-0090: A Connection to hq Is a Person's Own

**Status:** Accepted

## Context

hq's `/mcp` endpoint lets tools outside the product — a person's own Claude Code, or any MCP client — read and
change work in hq. It accepted one org-wide key, created by an admin, that belonged to no person and could do
anything an org admin can.

Since adr-0089 every task is done on behalf of a person, who answers its approvals. A key that is no one cannot be
that person, so work it created was on behalf of nobody, and nothing it did could be traced to anyone. It also had
to be carved out by hand wherever a rule binds people — a personal project is its person's alone, admins included —
and every new rule of that kind would need the same carve-out.

The control plane behind `/mcp` already enforces the rules for a caller acting as one person: a person's own chat
run reaches only that person's projects, with that person's role.

## Options considered

**Keep the org-wide key.** Rejected: it acts for no one, which adr-0089 cannot allow, and each rule that binds a
person needs a special case for it.

**Bind the org-wide key to the admin who created it.** Rejected: one shared key would act as one specific person for
everyone who holds it, and other people still could not connect their own tools.

**A connection per person, acting as that person with no narrowing of its own.** Rejected: a token pasted into a
tool is easier to leak than a browser session, so what one connection can do should be chosen for what uses it, and
it should not live forever.

**Signing in through the browser (OAuth) only.** Not rejected but deferred: some MCP clients expect it, and it is
several times the work. It would issue the same kind of connection, so this record does not change with it.

## Decision

**An outside tool reaches hq only through a connection that a person created, acting as that person and never as
more.**

- A person may create several connections. Each acts with that person's own reach and role, and everything it
  does is recorded as done by that person through that connection.
- Each connection has its own permissions, which can only narrow its person's: groups of operations, each on or
  off, read-only by default; and optionally a list of the person's projects it is limited to.
- Each connection expires, 90 days after it is created or renewed by default, and can be revoked at once. Only a
  hash of its token is stored.
- There is no org-wide key. An admin connects as themselves.

## What this binds

- **No credential to hq acts for no one.** A future way in — browser sign-in, an integration — issues a person's
  connection, under the same narrowing.
- **What a connection may do is the intersection** of its person's reach and role with its own permissions and
  projects. New control-plane operations are placed in a permission group when they are added.
- **A run a connection starts is a person-started run** (adr-0087), so starting work is a permission a person turns
  on deliberately.

Undoing it means bringing back a credential that is no one, and the special cases for it.

## Consequences

### Positive
- Every outside change to hq traces to a person and a named connection.
- Every person can connect their own tools, not only admins.
- Rules that bind people apply to connections with no special cases.

### Negative
- Tools that used the org-wide key must be reconnected with a person's connection.
- A connection expires and has to be renewed.

### Risks
- **A connection with wide permissions and no project list is as powerful as its person.** The defaults are narrow,
  and the person chooses to widen them; nothing prevents a careless choice.

## References

- adr-0089 — every task runs on behalf of a person
- adr-0087 — work starts on its own only from a boundary's automation
- adr-0060 — authority comes from the boundary, never a union

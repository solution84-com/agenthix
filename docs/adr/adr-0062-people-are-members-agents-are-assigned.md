---
created: 2026-09-16
description: A project's members are people and decide entitlement; its agents are assigned to it and are granted nothing by that assignment.
---

# ADR-0062: People Are Members; Agents Are Assigned

**Status:** Accepted

## Context

A project's membership is a relationship between a project and an **agent**. There is no way for a
person to belong to a project at all: a person holds one org-wide role, and every signed-in person can
reach every project. The access code says so in its own comment — projects have no per-user membership
model, so every authenticated user may use any owner that exists.

That makes the rule in [ADR-0060](adr-0060-authority-comes-from-the-boundary.md) — membership is the
gate — a sentence with no table behind it.

Agent membership also still carries a security role it should not: an agent must be a project member
to be granted that project's repository credentials, which is agent identity acting as authority.

## Options considered

- **One membership table holding both people and agents.** Rejected: they answer different questions,
  and a single table invites a check written for one to be applied to the other.
- **Roles inside a project, as a permission scheme.** Rejected for now: a class that may read but not
  write needs its own container, since write mode is a container property. The option stays open and
  keys on the mode rather than the person, so a project would hold at most two containers.
- **Org role alone, with no project membership.** Rejected: it is today's behaviour, and it means any
  signed-in person can write anyone's work the moment there are two people.

## Decision

**A project's members are people**, and membership decides entitlement: who may start a run in it and
write what it owns. It is binary — every member can do what that project's agent can do.

**A project's agents are assigned to it**, which is availability: which agents it uses, for assignment
and for its overrides. **An assignment grants an agent nothing**, because an agent carries no
authority.

**A project is open or private.** Open means everyone in the org is a member, and is the default.
Private means the member list decides.

> *(Annotated 2026-10-08.)* **Superseded by adr-0099 — this paragraph's meaning of open only.** An open project is
> one anyone in the organisation may join; only its members act in it or read its work, and the member list is
> everyone who can act.
> A project is still open or private, open is still the default, and the rest of this record stands.

> *(Annotated 2026-10-09.)* **Roles replaced by adr-0102:** the organisation's roles are Admin and Member; a project's
> are Admin, Member and Viewer, and a project Viewer only reads.

**Two roles, and they are not the same word.** An **org admin** shapes structure — groupings, sites,
people and their org roles, and published package versions. A **project admin** runs one project — its
members, its access level, its overrides, its agents and its repository attachments — and has exactly
a member's run authority.

**No project is left without a project admin**, and an org admin does not implicitly reach a private
project: they may add themselves, and the member list shows it.

> *(Annotated 2026-10-08.)* An org admin may also assign an agent to any project except a person's own, from
> Organisation › Agents; a project admin still assigns to theirs. That reaches no private project: a private
> project the admin is not a member of is listed only as "a private project" — counted, never named, its
> narrowing and usage not shown apart.

> *(Annotated 2026-10-08.)* An org admin may also add, promote, demote and remove a project's people, in any project
> they can see, as its project admins may. A private project the admin is not a member of is still not reached: it
> is counted on a person's page as "a private project", never named or changed from there.

## What this binds

Every write path checks entitlement to the boundary that owns the resource. The repository credential
gate stops keying on agent membership and keys on the boundary. The agent-keyed membership table
becomes an assignment table, and a new membership table holds people — in that order, since writing
people into the existing table would leave agent rows in it and every check would then fail
permissively.

Undoing it returns the system to org-wide reach for every signed-in person.

## Consequences

### Positive

- The rule that authority comes from a boundary has data behind it.
- A single-person install is unchanged, because a project is open by default.
- A private project has an owner who can admit people to it, without going through the org's admin.

### Negative

- A new role, a new invitation surface, and a check on removing someone from the org so that no
  project is orphaned.

### Risks

- **A departed person's storage is retained but has no one who can act in it** — a boundary with no
  person. Accepted here as a known gap: retention is the safe behaviour, and who may reach that work
  afterwards is a question with a legal dimension as much as a technical one.
  *(Annotated 2026-10-08.)* adr-0100 gives it an end: a person who leaves is deactivated, and Erase deletes their own
  data when the organisation chooses.

## References

- [ADR-0060](adr-0060-authority-comes-from-the-boundary.md) — the rule this supplies the data for
- [ADR-0061](adr-0061-a-product-and-a-programme-group-work-and-own-nothing.md) — why only projects have
  members
- [ADR-0059](adr-0059-an-agent-is-a-versioned-package.md) — why an agent's assignment can grant nothing
- `docs/work/2026-09-15-hq-site-split-close-out/spec.md` §6.4 — the design this is cut from

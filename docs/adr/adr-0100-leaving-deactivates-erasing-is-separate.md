---
created: 2026-10-08
description: A person who leaves the organisation is deactivated, and nothing is deleted; they can be reactivated. Erasing their own data is a separate, deliberate act that keeps shared work with its projects.
---

# ADR-0100: Leaving Deactivates; Erasing Is Separate

**Status:** Accepted

## Context

Removing a person from the organisation deletes their account. Their conversations, the run records of those
conversations on each site, their personal project and files, and their model logins go with it. Two constraints
pull against that:

- **Shared work outlives the person.** Tasks, comments and task runs belong to a project. Other people answer for
  them and read them later. A run record can also be filed under someone other than the person it was for. Deleting
  "everything under this person" therefore reaches other people's work.
- **People come back, and organisations owe both retention and erasure.** Someone who is rehired should get their
  history back. An organisation may need to keep records of work done, and must also erase a person's own data when
  asked, or once it no longer needs it.

## Options considered

**Delete the account, as today.** Rejected: it loses shared work. It cannot be undone, so a rehire starts with
nothing. It also gives no choice between keeping a person's data and erasing it.

**Deactivate only, and never erase.** Rejected: an organisation could not meet a request to erase a person's data,
and a departed person's private data would stay forever with nobody able to reach it.

**Erase automatically a set time after leaving.** Not taken: the owner judged it unnecessary. Erasing stays a
person's deliberate act.

## Decision

**Leaving is three separate acts.**

- **Remove deactivates.** Their sign-in ends on every device and connection, they leave their projects, and their
  model logins stop being used. Nothing is deleted. Their name stays on shared work, marked as having left. Their
  private conversations and personal files stay private: nobody can open them, admins included.
- **Reactivate** brings back the same account with its history.
- **Erase** is separate and deliberate. It deletes the person's own data: private conversations, personal project
  and files, memory, connections, model logins, name and picture. Shared work stays with its projects, and the
  person is shown as a former member.

## What this binds

- No removal or erasure deletes a project's tasks, comments or task runs. Erase finds the person's own data by what
  the person owns, never by a field that names them only for bookkeeping.
- Anything new that holds a person's own data must be included in Erase. Anything new that names a person on
  shared work must still read correctly after the person has left and after they have been erased.
- A person who has left can neither act nor be chosen. Sign-in, the checks for acting in a place, and the pickers
  all refuse them.
- Undoing it returns removal to deleting the account and, with it, shared work.

## Consequences

### Positive
- A person who left can come back with their history.
- An organisation can keep the record of work done and still erase a person's own data.
- adr-0062 leaves a departed person's storage with nobody to act in it. That storage now has an end: Erase.

### Negative
- A person who has left still has data in the system until someone erases it.
- Every list of people has to handle three states: active, left and erased.

### Risks
- An organisation that never erases keeps the data of people who left. Erase is there, but nothing prompts
  anyone to use it.

## References

- adr-0062 — people are members, agents are assigned; its accepted risk of a departed person's storage
- adr-0077 — within a boundary, a running chat is visible but its content is not
- adr-0089 — every task runs on behalf of a person
- adr-0090 — a person's connections to hq

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, plan 3.17–3.18, merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.

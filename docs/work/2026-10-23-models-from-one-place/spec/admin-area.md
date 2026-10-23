---
name: The organisation's admin area
description: Part 3 of models from one place — Manage organisation, a separate, protected area of hq for organisation admins, reached by Manage on the organisation's page.
created: 2026-10-23
author: leang
---

# 3 · The organisation's admin area

Part of the [spec](../spec.md). **Status:** high-level design agreed; no deep dive needed. Its detail is settled in the implementation plan.

## Settled

- **Two places.** *Organisation*, in the main navigation, is the organisation's own page for every member, admins
  included: its identity, vision and mission, and the workplace. *Manage organisation*, at `/admin`, is for
  organisation admins only.
- **The way in** is a *Manage* button on the organisation's page, shown only to organisation admins.
- **A focused frame.** The admin area draws its own menu where the main navigation is, with *Back to* the
  organisation, and no docked conversation. Its menu: Overview; People (people and invitations, teams); Agents;
  Models and billing (Models, Billing profiles, Usage); Settings; Where work runs.
- **Protected twice.** Every `/admin` page checks the role before drawing and shows a member who reaches it who to
  ask; every operation behind it refuses anyone but an organisation admin, as today.
- **Moves.** Today's organisation settings, infrastructure, people management, teams and agents' settings move under
  `/admin`; their old addresses redirect. The admin sections leave the organisation's page.

## Left to the plan

- The second frame in hq's app shell, and what pages under it use.
- The full menu and the address of every page that moves.
- The Overview: what needs an admin, and today's figures.
- On a phone.

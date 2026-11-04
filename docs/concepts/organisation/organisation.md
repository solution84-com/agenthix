# The Organisation page

The Organisation page is where what belongs to everyone is shown: who the organisation is, and the parts of its
workplace. An admin runs the organisation from the [admin area](admin-area.md), which this page opens. The page is `hq/src/org/pages/OrgPage.tsx`, its parts `hq/src/org/components/`.

## What each person sees

| | Everyone | Organisation admins also |
|---|---|---|
| The identity | A hero: cover, a large picture, the organisation's name, @handle and when it began, its vision and mission | **Edit** (name, handle, vision, mission) and **Change cover** and **Change** for the picture |
| The workplace | A card for each part, with its count and what matters in it now | |
| Managing | | **Manage**, which opens the [admin area](admin-area.md) |

Nothing that manages is on this page. An identity — an organisation, a team, an agent, a person — always has a hero. The
organisation's is `getOrgIdentity` and `updateOrgIdentity` (`hq/src/org/identity.ts`); its picture and cover are stored as
an agent's are (`identityImages.ts`).

## For admins: the admin area

An admin's first screen is the [admin area](admin-area.md)'s **Overview**:

- **Needs attention** is one list across the workplace and the infrastructure, each item with its one action. The
  items are the admin's own notifications ([notifications](../notifications/notifications.md#needs-attention)), so
  handling one there or in Notifications clears both. With none it says *Nothing needs you.* A provider that is not working
  is one of them ([providers](../providers/providers.md#a-providers-state)). **Agents with approval Bypassed** are one
  persistent item, a fact rather than an alarm: **Review** opens the agents filtered to them
  (`/admin/agents?approval=bypassed`) and an admin may **Acknowledge** it. Unanswered invitations open People at its
  invitations (`/admin/people?show=invitations`).
- **Today** is running now (of the most at once), runs today, tasks done this week and spend this month,
  estimated (`getTodayNumbers`, `hq/src/dashboard/todayQueries.ts`). The Dashboard page is gone: these are its
  numbers, its run history is the Runs screen, each agent's cost is on the agent, and recent activity is Runs and
  Notifications. What the organisation's AI use actually cost is the [usage report](../billing/billing.md#the-usage-report).
  `/org/dashboard` opens the admin Overview.
- **Where work runs** is each Execution Site with whether it is running and meters for runs, disk and Docker, from the
  health each site reports, and **Infrastructure**. Sites are added by a fleet admin in the Fleet Console, not here
  ([the fleet](../fleet/fleet.md)).
- **Settings** hold each setting of the organisation as a workplace: GitHub accounts, run limits, tool risk rules,
  automation, memory, the web-search key, and the **sign-in page** choice (`Org.signInShows`): how much of the identity a
  visitor who is not signed in sees there — the cover with the picture, name, handle and vision, the name only, or nothing
  (`hq/src/org/publicIdentity.ts`). Model providers, models and voice are under *Models and billing*, not Settings.

## The workplace

A card for each part: **People** (faces, invitations waiting for admins), **Agents** (what needs you, what is
running), **Teams** (each team's mix), **Products** (each with its projects), **Programmes** (the active ones) and
**Library** (counts by kind, made here, the marketplace). Each opens its part:
[Teams](../projects/teams.md), [Products](../projects/product.md), [Programs](../projects/program.md) and the
[Library](../library/library.md). `getWorkplacePeople` gives everyone the people card; People itself is for admins.

# The Organisation page

Organisation is where what belongs to everyone is looked after. A person comes here to reach it; an admin comes to
run it. The page is `hq/src/org/pages/OrgPage.tsx`, its parts `hq/src/org/components/`.

## What each person sees

| | Everyone | Organisation admins also |
|---|---|---|
| The identity | A hero: cover, a large picture, the organisation's name, @handle and when it began, its vision and mission | **Edit** (name, handle, vision, mission) and **Change cover** and **Change** for the picture |
| What needs attention | | **Needs attention**, first |
| How things are going | | **Today**, then **Where it runs** |
| The workplace | A card for each part, with its count and what matters in it now | |
| Settings | | **Settings**, last |

An identity — an organisation, a team, an agent, a person — always has a hero. The organisation's is
`getOrgIdentity` and `updateOrgIdentity` (`hq/src/org/identity.ts`); its picture and cover are stored as an agent's
are (`identityImages.ts`).

## For admins, in the order they act

- **Needs attention** is one list across the workplace and the infrastructure, each item with its one action. The
  items are the admin's own notifications ([notifications](../notifications/notifications.md#needs-attention)), so
  handling one here or in Notifications clears both. With none it says *Nothing needs you.* **Agents with approval
  Bypassed** are one persistent item, a fact rather than an alarm: **Review** opens Organisation › Agents filtered
  to them (`/org/agents?approval=bypassed`) and an admin may **Acknowledge** it. Unanswered invitations open
  Organisation › People at its invitations (`/org/people?show=invitations`).
- **Today** is running now (of the most at once), runs today, tasks done this week and spend this month,
  estimated (`getTodayNumbers`, `hq/src/dashboard/todayQueries.ts`). The Dashboard page is gone: these are its
  numbers, its run history is the Runs screen, each agent's cost is on the agent, and recent activity is Runs and
  Notifications. `/org/dashboard` opens the Organisation page.
- **Where it runs** is a card for each Execution Site with whether it is running and meters for runs, disk and
  Docker, from the health each site reports, and **Infrastructure ›**. Sites are added by a fleet admin in the Fleet
  Console, not here ([the fleet](../fleet/fleet.md)).
- **Settings** shows each setting's state — model access by provider (*Anthropic +1 more*, never a runtime), GitHub
  accounts, run limits, tool risk rules, automation and voice (`getOrgSettingsState`,
  `hq/src/org/workplaceQueries.ts`). Organisation › Settings also holds the **sign-in page** choice
  (`Org.signInShows`): how much of the identity a visitor who is not signed in sees there — the cover with the
  picture, name, handle and vision, the name only, or nothing (`hq/src/org/publicIdentity.ts`).

## The workplace

A card for each part: **People** (faces, invitations waiting for admins), **Agents** (what needs you, what is
running), **Teams** (each team's mix), **Products** (each with its projects), **Programs** (the active ones) and
**Library** (counts by kind, made here, the marketplace). Each opens its part:
[Teams](../projects/teams.md), [Products](../projects/product.md), [Programs](../projects/program.md) and the
[Library](../library/library.md). `getWorkplacePeople` gives everyone the people card; People itself is for admins.

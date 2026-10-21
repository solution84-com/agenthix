# Organisation

Part of the unit's design spec: see [the index](README.md).

## Organisation

Agreed on its own mockups (the page; Teams and Members; Products and Programs; Library and Marketplace). A person
comes here to reach what belongs to everyone; an admin comes to run it.

- **An identity has a hero.** The Organisation page opens with a **cover**, a large **picture**, the **name** and
  @handle, the **vision** and **mission**; admins see **Edit** and **Change cover**. The same rule holds wherever an
  identity is shown — an organisation, a team, an agent, a person.
- **For admins, in the order they act:**
  - **Needs attention** — one list across the workplace and the infrastructure, each item with its one action: a site
    in trouble, a model key failing, a machine asking to connect, approvals waiting, invitations unanswered for a
    week. Items clear themselves when handled; with none, one line says nothing needs them. They are the same items
    as an admin's notifications, so handling one in either place clears both. **Agents with approval Bypassed** are
    one persistent item naming them, written as a fact rather than a warning (Bypassed is expected for automation);
    **Review** opens Organisation › Agents filtered to them, and an admin may **Acknowledge** it until another agent
    is set to Bypassed.
  - **Today** — running now (of the most at once), runs today, tasks done this week, spend this month (estimated).
  - **Where it runs** — each site as a card of its own, with its cover and picture, whether it is running, and meters
    for runs, disk and Docker; ＋ Connect a site; **Infrastructure ›**.
  - Then **the workplace**, and **Settings** last — each setting's state, never a runtime: model access by provider
    (*Anthropic +1 more*), GitHub accounts, run limits, tool risk rules, automation and voice.
  - **The Dashboard page goes:** its numbers are Today; its run history is the Runs screen; each agent's cost is on the
    agent; recent activity is Runs and Notifications.
- **The workplace, for everyone:** a card for each part with its count and what matters in it now — **People**
  (faces, invitations waiting), **Agents** (what needs you, what is running), **Teams** (each team's mix), **Products**
  (each with its projects), **Programs** (the active one, its end and progress), **Library** (counts by kind, made
  here, updates, the marketplace). A member sees the identity and the workplace; only admins change anything.
  Today's cover pattern, chips, and Teams / Members / About tabs go.
- **A team** is a group of **people and agents** with a purpose (Marketing, Support), and an identity: Teams shows a
  card for each with its cover and picture, purpose, members' faces, its mix and how many projects it works in. A
  team's page has its hero, **Add to a project** and ⋯; its **People**, its **Agents** with what each is doing, and
  **Works in**: a card per project with the team's role there and what is happening now.
- **A team joins a project as one member** ([adr-0103](../../../adr/adr-0103-a-team-joins-a-project-as-one-member.md)):
  added with one role, removed as a unit (asking first about open tasks), following the team's changes.
- **A project's Members** view replaces its People and Agents views: its **teams** as cards (role, ⋯ with Remove
  team), then its **people**, then its **agents**, each agent with its state here as the Agents view showed it;
  **All · People · Agents**, search, and **＋ Add ▾** for a person, an agent or a team. Someone there through a team
  carries the team's name and is changed through the team; someone also added in person keeps their own role and ⋯.
- **Products and Programs:** a list beside the one opened, which shows its projects as the Projects screen's cards
  and **File a project** for admins. A programme also shows its goal and end.
- **The Library** holds **Agents, Boards, Skills and Teams** — ready-made things to start from; using one makes the
  organisation's own copy. Each is a row marked **Built in**, **Made here** or **Marketplace · v2.1** with its
  publisher, and its action (Add to agents, Use) and ⋯; search, a source filter, **Import**, and **＋ New ▾**.
  A ready-made team is a **template of agents only**, with their boards; people are added after. Every item is
  one **package** recording its source, version and publisher, with **Export** and **Import**, so a marketplace
  can later deliver the same packages. `/skills` goes to Library › Skills.
- **Marketplace** is the Library's last tab, on every HQ. Until the marketplace opens with Agenthix Cloud it is a
  **Coming soon** page: what the marketplace will be, **Get notified on agenthix.com ↗** (the website's sign-up,
  opened in a new tab; HQ sends nothing) and **About Agenthix Cloud ↗**, and one example card for each kind of
  item (what the kind is, then *For example: …*). An HQ updated to a release with the marketplace shows it there.
- **The built-in agent proposing a team** raises a notification for admins, in place of today's banner.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **An organisation's identity** | An organisation has a cover, picture, handle, vision and mission, shown as the Organisation page's hero. Today it has a name, vision and mission, and a fixed pattern in place of a cover |
| **Teams of people and agents** | A team's members are people and agents, with a cover and picture; a team joins a project as one member, written through to its members and removed as a unit (adr-0103); a project's people, agents and teams are one Members view. Today a team lists agents only and nothing uses it |
| **Needs attention and Today** | The Organisation page shows admins one list of what needs them across the workplace and the infrastructure — the persistent Bypassed item among them, acknowledgeable — and today's numbers; the Dashboard page goes. Today the numbers are on a Dashboard page of their own and nothing gathers what needs an admin |
| **Library items as packages** | Agents, boards, skills and team templates each export and import as one package that records its source, version and publisher; a team template holds agents only. Today agents export alone, built-in items are seeded from files, and nothing records where an item came from |

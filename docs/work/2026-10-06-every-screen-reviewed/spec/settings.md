# Settings

Part of the unit's design spec: see [the index](README.md).

## Settings, the organisation's settings, and Infrastructure

Agreed on its own mockup. Every setting has **one owner**, and lives in that owner's place:

- **Settings** (the navigation's foot) is **only the signed-in person's own**: one page under their name and picture,
  in sections — **Profile** (name, picture, handle, timezone), **Appearance**, **Voice**, **Conversations** (sending
  into a busy one), **Your model logins**, **Your memory**, **Devices and connections** (a phone; tools that act for
  you), **Sign-in** (change your password, sign out). Nothing for admins is in Settings.
- **Organisation › Settings** is the organisation as a **workplace**, for its admins: model access (the
  organisation's keys and subscriptions, listed with Remove and added from one **Add model access** menu, each option
  saying what it gives access to, as in setup — [getting-in](getting-in.md)), voice providers, how work runs (automation limits, run time and turn
  limits, archiving finished tasks, tool risk rules as they are), GitHub on the organisation's accounts, and which
  site new projects use. People and agents keep their own entries (Organisation › People, › Agents).
- **Organisation › Infrastructure** is **what everything runs on**: HQ itself (version, address and environment),
  **every Execution Site** (see [Execution Sites](sites.md)), storage, registering the GitHub
  App, and [logs and diagnostics](diagnostics.md), which replace today's debug page. It is its own entry on the Organisation page, beside Settings,
  never inside it, and for **organisation admins only** — members do not see the entry, and its address tells them
  only admins can see it.
- **The Organisation page** groups its entries as *the workplace* (People, Agents, Products, Programs and Library,
  Settings) and *what it runs on* (Infrastructure); the rest of the page is the Organisation pass's.
- **Later, with host management:** Infrastructure moves whole to a separate portal with its own sign-in and its
  own admins, apart from the organisation's — a future build, not this pass.
- **Model access follows the person a run is for** ([adr-0105](../../../adr/adr-0105-a-run-uses-the-login-of-the-person-it-is-for.md)):
  their own login or key from **Your model logins**, in a project as in Chat — except that a project holding its own
  key or login is used first, because the organisation chose to pay for that project's work; the organisation's comes
  last. A person's login goes only to a run that runs as them; a task's run in a project runs as the project, so it is
  given their API key instead. The rest of who holds model keys — the organisation's fallback key, a project's key, the host — is
  decided with host management; until then the organisation's model and voice providers stay its admins'.

## A project's Settings

Agreed on its own mockup. The last tool in a project's tools panel, holding what is left once people, agents and
their permissions have places of their own.

- **Its parts, and who changes each:**
  - **About:** name, description and lead, changed by the project's admins. The **key** may be changed only until the
    first task exists. After that it is shown as plain text with the reason (*Fixed — its 27 tasks are numbered
    WEB-1 onwards*), never as a field that looks editable, because task numbers, links and agents' notes are made
    from it.
  - **Who can see it:** Open (anyone in the organisation can see it and join) or Private (only the people added).
  - **Agents:** the **default agent**, chosen from the project's own agents. New conversations here start with it.
  - **Where it runs:** the site its files are kept on and its agents run on, read only. Moving a project to another
    site comes later.
  - **Model access:** the project's own key or login; when set, it pays for every run in the project before anyone's own (adr-0105).
  - **How work runs:** the run time limit and archiving finished tasks.
  - **Filed under:** product and programme. Organisation admins change these; others read them.
  - **Delete** is the organisation admins'. A project admin sees one line saying so; Members and Viewers see nothing
    about it.
- **Members and Viewers** see the same facts as text to read, with one line naming the project's admins, who can
  change them. They see no forms.
- **Each part saves on its own:** a choice applies at once, a text field saves on leaving it, and a short "Saved"
  shows beside what changed. There are no Save buttons.
- **A personal project** has no Settings of its own beyond what applies to it (its key, run time limit and archiving),
  as today.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **A run uses its person's own model access** | A run's model access is, in order: the project's own (in a project), then the person it is for — their own login, then their own key — in a project as in Chat, then the organisation's; a person's login only where the run runs as them, so a task's run in a project gets their key. The development switch `AGENTHIX_DEV_SHARED_SUBSCRIPTION` stays, for testing task runs without a key. Today a project run never uses the person's own, so a team with subscriptions only has no model access for project work ([adr-0105](../../../adr/adr-0105-a-run-uses-the-login-of-the-person-it-is-for.md)) |
| **Project lead** | An optional person on the project, shown in its facts and set in its Settings. It carries no rights of its own; project roles stay as they are |
| **A project's Settings by who may change it** | Each part shown as a field only to those who may change it, and as text to everyone else; each part saves on its own; the default agent chosen here; where the project runs shown. Today every member sees one form with one Save, a Delete only organisation admins can use, and no default agent or site |
| **Settings, the organisation's settings and Infrastructure apart** | Settings holds only the person's own things, with a password change; the organisation's admin pages move to Organisation › Settings; HQ, its sites, storage, the GitHub App's registration and diagnostics to Organisation › Infrastructure, for admins. Today one Settings page mixes all three, and a page named after the installation holds the organisation's run limits |

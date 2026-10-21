# People

Part of the unit's design spec: see [the index](README.md).

## People

Agreed on its own mockup, drawn the way Agents was. A project's people, shown in its **Members** view ([Organisation](organisation.md)), say who takes part here and what
waits on them; **Organisation › People** is where admins invite people, set their roles and remove them; a
**profile card** opens from a person's name or picture anywhere. A person's own Profile is part of the Settings pass.

- **A person has a name and a picture**, as an agent does: a display name and a picture (an initial on a colour
  until one is uploaded), set in their own Profile and by organisation admins. Their login name stays as their
  handle (@dana).
- **Words about a person are gender-neutral:** their name (*Needs Dana*, *on Dana's behalf*), or *they* and
  *their* — never *he* or *she*.
- **An open project is open to join** ([adr-0099](../../../adr/adr-0099-an-open-project-is-open-to-join.md)):
  anyone in the organisation may **Join** it in one step. Until they join, opening it shows a **preview** — what it
  is (description, lead, product, site, when it started), its people and agents, how busy it is — with **Join this
  project**. No conversations, no tools, no message box. A private project stays invite-only and unseen. The member
  list is everyone who can act, and the People count with it.
- **People in a project:** a line naming the project open or private (to Settings). Then each member: avatar, name,
  role here as quiet text after the name (*Dana · Member*), not a badge; **what waits on them here** (*Needs Dana ·
  WEB-27 wants to run a command*), what they are doing, or when they were last here. **＋ Add** in the header.
- **A person opened inside the tool** (‹ People): name, role here, handle and their local time; **Waiting on them**;
  **Tasks done on their behalf** (opening Tasks); **Role here**; their organisation role and when they joined;
  **Manage in Organisation ›** for organisation admins; **Remove from this project**.
- **Add, in place:** *Add as* Member, Viewer or Admin at the top, then a search by name or @handle over **everyone in the
  organisation**: full name, then handle, organisation role and how many projects they are in, so two people with
  the same first name are told apart. Those already in the project show a ✓; the rest an **Add** button.
- **Remove from this project** asks what happens to the open tasks done on their behalf here — another person here,
  or leave them waiting (they do not run until someone takes them on) — with **nothing chosen** until the person
  picks. Their conversations here stay theirs; a run in progress finishes first.
- **Who may change a project's people:** the project's admins and the organisation's admins alike — add, promote,
  demote and remove, in every project they can see. A private project an organisation admin is not in stays out of
  reach: on a person's page it is counted as "a private project", never named or changed. The controls show only to
  those who may use them.
- **Organisation › People** (admins only; beside Agents, Products, Programs and Library; replaces Settings ›
  Users): **Invited · waiting** first — who it is for, who invited them, when it expires, the role and projects,
  **Copy link** and **Revoke**; then everyone: avatar, name and handle, organisation role (changeable, never your
  own), how many projects, when they joined; **Left** at the foot. Used and expired invitations under *Earlier
  invitations*. Search and **＋ Invite**.
- **Roles (adr-0102).** The organisation's are **Admin · Member**: an Admin runs the organisation — its people,
  agents, projects and settings. A project's are **Admin · Member · Viewer**: an Admin runs the project (its people,
  agents, permissions and settings); a Member works in it — talks to its agents, starts, stops and changes work,
  comments, approves; a **Viewer only reads** — everything a member reads, and nothing else. Nobody reads another
  person's conversation (adr-0077). **Join** on an open project makes you a Member; a project wanting newcomers
  read-only is private, with people added as Viewers.
- **Invite someone:** *Who it's for* (shown in the list), the organisation role, and, optionally, **projects they
  join on accepting**. It gives a one-time link, good for 7 days, to copy and send — Agenthix sends no email.
- **One person** (Organisation › People › Dana): organisation role; profile (name edited in place, picture, local
  time); **Projects** — each with their role there, changeable, and **Add to a project**; **Remove from the
  organisation** under ⋯.
- **When someone leaves**, three acts ([adr-0100](../../../adr/adr-0100-leaving-deactivates-erasing-is-separate.md)):
  - **Remove** deactivates, and deletes nothing: their sign-in ends on every device and connection, they leave
    their projects, their model logins stop being used, and the admin is asked where their open tasks go, as
    removing from a project does. Their name stays on tasks, comments, messages and runs as *Dana · left*; their
    private conversations and personal files stay private, unread by anyone, admins included. People who left are
    not counted and not offered in pickers.
  - **Reactivate** brings the same account back with all its history; projects are added again by hand.
  - **Erase**, separate and deliberate — for a data-protection request, or when the organisation no longer needs
    it: their private conversations, personal project and files, memory, connections, model logins, name and
    picture are deleted. Tasks, comments and task runs stay with the projects, the name replaced by *Former
    member*. It cannot be undone and asks for their name to be typed. Nothing is erased automatically.
- **Their profile card** opens from a person's name or picture anywhere — a conversation, a task, a run, a tool:
  picture, name, handle, organisation role, their local time beside yours, the projects you share, their role and
  tasks here; **Show their tasks**, and **Manage ›** for organisation admins.
- **Mobile:** the list, and a person, full screen.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **Open projects are open to join** | In an open project only its members act — start runs, change tasks, approve, talk to its agents. Anyone in the organisation may Join in one step; before then they see a preview of the project, not its work. Today everyone in the organisation counts as a member of an open project |
| **A person's name and picture** | A display name and a picture beside the login name, set by the person and by organisation admins, shown wherever a person is |
| **A person's profile card** | Opens from a person's name or picture anywhere, as an agent's does |
| **Organisation admins manage any project's people** | Add, promote, demote and remove in every project they can see; a private project they are not in is counted, never named; today they may only add and promote |
| **Removing from a project asks about their tasks** | Takes what happens to the open tasks done on their behalf there — another person, or leave them waiting — as a required choice with no default |
| **Leaving deactivates; erasing is separate** | Remove ends sign-in and membership and deletes nothing; Reactivate restores the same account; Erase deletes the person's own data and keeps shared work under "Former member". Today removal deletes the account, and with it the run history of project tasks filed under that person |
| **Invitations say who they are for and may add to projects** | The invitation's note shows in the list as who it is for; it may name projects the person joins on accepting |
| **Viewer is a project role** | The organisation's roles become Admin and Member; a project's become Admin, Member and Viewer, a Viewer reading the project and changing nothing in it — no conversations with its agents, no work, comments or approvals. Today Viewer is an organisation role that applies in every project at once |

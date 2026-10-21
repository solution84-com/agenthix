# Agents

Part of the unit's design spec: see [the index](README.md).

## Agents in a project

Agreed on its own mockup. A project's agents, **as they work in this project**, shown in its Members view ([Organisation](organisation.md)). Who an
agent is lives on its own place (*An agent's place, and managing agents*, below); this view is the agent here.

- **The list:** a box at the top names the instructions every agent here follows (`AGENTS.md`, the shared skills),
  opening in Files. Then each agent: avatar, name and role; **what it is doing here** — Running, Needs you or Idle,
  with the task; its tasks here by state; its model, marked "narrowed here" when this project narrows it.
  **The whole row opens the agent** inside the tool; its picture is part of the row. **＋ Assign** in the header.
- **An agent opened inside the tool** (‹ Agents): Start a conversation and Give it a task; **Now** and **Coming up**
  (start times, routine rounds) here; its tasks here (opening Tasks); **In this project** — its model beside the
  agent's own — and **Permissions here** (*An agent's permissions*, below), both shown to **every member**, changed
  by the project's admins; **its instructions
  here** — the organisation's, read only, then this project's for every agent and for it, opening in Files; recent
  runs (opening Runs); a link to its place.
- **In this project, edited in place:** it can only narrow the agent.
- **Assign, in place:** the organisation's agents not here yet, with their role.
- **Remove from this project** asks what happens to its open tasks here — another agent here, or none (they wait
  in their columns) — with **nothing chosen** until the person picks. Its conversations stay readable; a run in
  progress finishes first.
- **Mobile:** the list, and an agent, full screen.

## An agent's place, and managing agents

Agreed on two mockups. Every agent is the **organisation's** — its "employees": organisation admins create and
change them, and a project or a person only narrows them for their own runs. A person either **uses** an agent or,
as an admin, **manages** it, in two different places.

- **Agents** (navigation): the organisation's agents as **cards**, the same card as the Projects screen's: its cover
  with its avatar over it; name, role and handle; **what it is doing now**, led by the state that matters most in its
  colour (*Needs you · WEB-27 wants to run a command*, *Running · …*, *Idle*), then the detail; how many projects it
  is in and when it last worked; its model and **New conversation →**. On a phone, a compact row of three single lines
  (avatar; name; now; facts), cut short, never wrapped. A filter *All · In my projects*. Admins see **Manage
  agents ›**.
- **The Projects screen** uses the same card: the project's avatar, name, description, what is happening now
  (*Needs you · 1 task · 2 running*, *Quiet · last run yesterday*), its boards and tasks done, and **Open →**; the same
  compact row on a phone.
- **An agent's place** (using it), opened like a profile: its **cover** across the top, its avatar over it, its
  name and role. Your conversations with it from everywhere on the left, a composer whose conversation lives in your
  Chat; its tools on the right:
  - *At work:* **Now** (needs you, running, coming up — across every project), **Projects** (the ones you are in,
    each opening that project's Agents view on it), **Runs**, **Usage** — two rows, *Your usage* and *Organisation
    usage*.
  - *About it:* **Your instructions** — the organisation's, read only, then yours: for this agent and for every
    agent in your Chat, from your own Files. A person changes theirs by asking the agent; editing by hand waits for a
    write path to a site. **Memory** (yours). **Your settings** — your model for it and **your permissions in
    Chat** (*An agent's permissions*, below), which can only narrow the organisation's, for your runs in your Chat.
  - Admins see **Manage ›**.
- **Each place has its own instructions.** The organisation's go everywhere; a project's are shown in its Agents
  tool, a person's on the agent's place. A project never gets a person's.
- **Its profile card** opens from the agent's name or picture anywhere — a conversation's header and its messages,
  a task card, a run, a tool — **beside what was tapped**, like a menu (on a phone, a sheet from the bottom): cover,
  avatar, name, role, handle, what it is doing now, how many projects, its model; **New conversation**, which starts
  one with it where you are (the project you are in, or your Chat where there is no project), and **Open its place**.
  Below, a part for **where you are**, each row opening the agent in the panel at that part: in a project,
  *Permissions here* and *Its tasks here*; in Chat, *Your permissions in Chat* and *Your conversations with it*.
  In a list, the whole row opens the agent instead; the card is for a name or picture anywhere else.
- **Organisation › Agents** (managing, admins only): every agent with cover and avatar, where it is assigned, its
  model and the organisation's usage; **＋ New agent** and **Import**. One agent is a settings page, not a place:
  its cover (**Change cover**) and avatar (**Change**), its **name and role edited in place**, its handle;
  **Instructions**, **Skills**, **Settings** (model, harness, voice) and **Permissions** (below), each with Edit; **Projects** —
  every one it is assigned to, with **Assign** to any project; the organisation's usage by project; Export, and
  Stop its runs and Delete under ⋯. The built-in agent cannot be deleted.
- **Where an agent's own files live** (adr-0072, unchanged): its instructions and skills are files held in hq's
  database and delivered to a site by fingerprint, cached there read only. A place's additions are files in its own
  Files.

## An agent's permissions

Agreed on its own mockup. What an agent may do, set at three levels: the **organisation** sets each agent's
permissions (its admins); a **project** may narrow them for runs in it (its admins); a **person** may narrow them for
their own Chat. A narrower level only takes away. Model access is not part of this.

- **One view at every level.** **Approval** first, then **Start from a preset**, then every tool in groups (Files,
  Commands, Web, Platform), each set to **Always · Ask · Never**, with command patterns under Commands. A command
  matching no pattern follows **Any other command** (the Bash tool's own setting): Always runs it, Ask asks, Never
  refuses. Presets set Any other command to Ask.
- **Permissions are what the agent may attempt, not authority.** A platform tool (tasks, projects, agents, the
  organisation) also needs the authority of the person the run is for: hq refuses what that person may not do, and a
  run nobody is behind does nothing administrative, whatever the agent's permissions say.
- **Approval** — when a person is asked about a tool set to Ask, for every run. It replaces "autonomy":
  - **Deferred:** the run carries on, and lists every Ask for a person to approve at the end.
  - **Immediate:** the run stops at the first Ask and asks a person at once.
  - **Bypassed:** every tool runs, platform tools included, including tools set to Never, and no one is asked; in
    Agenthix it can still only do what the person it works for may do. It is the dangerous choice:
    its card is marked as a warning, saving it asks for confirmation, and wherever approval is summarised (the
    agent's page, Organisation › Agents) a bypassed agent carries a warning mark. With Bypassed the tool list is not
    shown.
  - A run nobody can answer (a start time, a routine) treats Ask as Never, as today.
- **Presets** fill in the tools: Safe, Read only, Developer, Project manager, Product manager, and Custom once a
  tool is changed. There is no Unrestricted preset: bypassing is approval's alone. A preset never sets approval.
- **Below the organisation,** each tool and approval shows the organisation's setting under it, and only that choice
  and stricter ones are offered: Always gives Always, Ask, Never; Ask gives Ask, Never; Never gives only Never; the
  same for approval (Bypassed, Deferred, Immediate). A change is marked *narrowed*, with a count at the top. A
  preset applies within the organisation's (each tool takes the stricter of the two); *The organisation's* is also
  a preset, undoing every narrowing. When the organisation bypasses approval and a project or a person sets
  Deferred or Immediate, every tool shows *Organisation: Bypassed* and starts at Always.
- **The strictest level wins** when a run starts: for each tool and for approval, the organisation's, the
  project's (for a run in that project) and the person's (for a run in their Chat).
- **Where:** the organisation's is a **Permissions** section of its own on the agent's page under Organisation ›
  Agents, with a summary and Edit, out of Settings. A project's is **Permissions here** on an agent in its Agents
  tool. A person's is **Your permissions in Chat**, reached from Chat's *Agents* fact (it opens the organisation's
  agents in Chat's panel), from the agent's card in Chat, and from **Your settings** on the agent's place.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **The first agent added becomes the default** | When a project with no default agent gets its first agent, that agent becomes its default |
| **Agents in a project** | A project's Agents view shows each agent's state here (running, needs you, idle, with the task), its tasks here, and its instructions here (the organisation's, then the project's files); "In this project" (the project's narrowing) is readable by every member, changed by its admins |
| **Removing an agent from a project** | Takes what happens to its open tasks there — another agent in the project, or none — as a required choice with no default |
| **An agent's place** | An agent has a place: the person's conversations with it from everywhere, its state across projects, their usage and the organisation's, their instructions for it (read from their own Files), their memory and their narrowing of it |
| **An agent's profile** | An agent's cover shows on its place, the Agents list and a profile card that opens from its name or picture anywhere, beside it, with what can be done with the agent where the person is (its permissions and tasks here, or theirs in Chat); its **New conversation** starts one where the person is, not always in their Chat |
| **One permissions view at every level** | A project's and a person's narrowing hold the same as the organisation's — Always, Ask or Never for each tool, command patterns, and approval — in place of a list of allowed tool names; the strictest level wins for each tool and for approval. Today a narrowing can only switch tools off |
| **Approval** | "Autonomy" becomes **approval** — Bypassed, Deferred, Immediate — in the product and the code; Bypassed is confirmed on saving and marked wherever approval is summarised; the Unrestricted preset goes |
| **Agents and Projects as cards** | The Agents and Projects screens share one card; a project's card says what is happening in it now (needs you, running, or quiet since its last run) |
| **Organisation › Agents** | Organisation admins create, import, change, export and delete agents there, and assign one to any project; name and role are edited in place |

## Not in this pass

- An agent's revenue, expenses and margin; agents
  created inside a project or a team beside the organisation's;
  a record of who changed an agent, and when; an
  organisation-wide record of who did what, and when.

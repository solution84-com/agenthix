---
created: 2026-11-12
description: Memory people can find, and Your space as a project place. The unit's background; the design is in spec.md and the work in plan.md.
---

# Memory people can find, and Your space as a project place

An **initiative**, before 0.1.0. Two problems that meet:
- memory is reached in five places, and none is where a person looks;
- Your space is drawn by its own place code, with no Settings and an Overview that repeats its side menu.

They are one unit because Your space becoming a project place decides where a place's way into memory sits.

- **Design:** [`spec.md`](spec.md): 13 decisions and the design, approved 12 Nov 2026.
- **Screens:** [`boards/design-pass.html`](boards/design-pass.html), the build baseline.
- **Work:** [`plan.md`](plan.md).

The rest of this file is the background the design started from.

## Where it started (11 Nov)

The owner asked Kernel to remember something, then couldn't find where memories are kept. The owner looked in **Your
space** (no Memory, no Settings) and in **My Project › Settings** (a personal project: no Memory either), and found
neither. The memory was under **Settings › Memory › One agent, about you**, with Kernel chosen.

## Today: memory

| # | Where | What it shows | Who sees it | Code |
|---|---|---|---|---|
| 1 | **Settings › Memory** (`/settings/memory`) | Three tabs, one at a time: *About you* (`PERSON`), *One agent, about you* (`AGENT_PERSON`, choose an agent), *One agent, in a place* (`AGENT_PLACE`, choose an agent and a place) | Everyone | `hq/src/memory/screen/pages/MemoryPage.tsx` |
| 2 | **An agent's page › Memory** (`/agents/<handle>`, group *About it*) | That agent's `AGENT_PERSON` items about you; links to *All your memory* | Everyone | `AgentMemoryTool.tsx`, wired in `agents/pages/place/useAgentPlace.tsx` |
| 3 | **A project › Memory** (the last section, after Settings) | `AGENT_PLACE` for the project; choose an agent first | The project's admins; **never in a personal project** | `ProjectMemoryTool.tsx`, wired in `projects/place/useProjectPlace.tsx` |
| 4 | **Admin › Settings › Memory** (`/admin/settings/memory`) | How well recall works, and the model that reads what agents remember. No items | Organisation admins | `MemorySettingsPage.tsx` |
| 5 | **A "Remembered …" line in a conversation** | Opens Settings › Memory on the item's scope | Everyone in the conversation | `conversations/tools/actionLines.ts` (`memoryParams`) |

Gaps a person meets:
- No view lists everything that was remembered. Every view asks for an agent or a scope tab before showing anything.
- **Your space has no Memory.** What an agent learned about Your space is reachable only through Settings › Memory ›
  *One agent, in a place*.
- **A personal project has Settings but no Memory.**
- **The scope names are hard to reason about** (*About you* versus *One agent, about you*).
- A "Remembered …" line opens the scope, not the item.

## Today: Your space against a project

**Your space is already backed by a personal project.** `chat/chatPlace.tsx` calls it "the personal project behind
Chat", which holds the person's own tasks, boards and routines. But it is drawn by its own place code, not the
project place:

| | Your space | A personal project | A shared project |
|---|---|---|---|
| Sections | `SPACE_SECTION_ORDER` (`chat/chatPlace.tsx`): tasks, boards, runs, routines, automation, workflows, skills, files, artefacts, knowledge, workspaces, agents, secrets | `PERSONAL_SECTION_ORDER`: the same, **plus Settings** | `PROJECT_SECTION_ORDER`: plus sprints, timeline, workroom, members, github, settings, **memory** (admins) |
| Settings | **None** | General, Task types, Custom fields, Runs and finished tasks; Delete | The same |
| Memory | **None** | **None** | Admins only |
| Facts on the Overview | Who sees it, Agents, Personal projects, Site, Files | The project's | The project's |

**The Overview.** A shared project has its own, `ProjectOverview` (`hq/src/projects/place/ProjectOverview.tsx`, drawn by
`ui/src/people/ProjectOverviewView.tsx`). It shows its work as Needs you, Running, Up next and Recently finished, then
its lead, people and agents, and it does not repeat the menu. `useProjectPlace` gives it only to a project that isn't
personal (`overview: personal ? undefined : …`). A personal project, Your space and an agent's page fall back to the
generic `PlaceOverview` (`places/components/PlaceOverview.tsx`): the facts, then every section as a row, the same
list as the side menu.

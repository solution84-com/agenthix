# Part 4 · Places and who reaches what

Each level is reached only by those allowed to, and a conversation reaches only its own place and the places its person
added. The person sets how far a conversation reaches, by a deliberate act they can see and undo. Boards: *6 · Who
reaches what*, *C3 · Places in a conversation*.

## Who reaches what

| Level | Read | Change | Enforced by |
|---|---|---|---|
| Platform guide | Every agent; anyone, as the public guide | The maintainers | Nothing to protect: it holds nothing of an organisation |
| Organisation | Every member; every run and conversation in the organisation | Organisation admins; agents when the person they act for is one | UI: an organisation-admin check for changes. Agents: `org:` is open to every run for reading; change tools refuse unless the turn or run acts for an admin |
| A project | Its members; agents working in it | Anyone who may change the project's files (the same people who can change its `AGENTS.md`); agents when asked | UI: `assertLocationAccess` with `read` and `write`, as the Knowledge tool's queries use today. Agents: the tools reach only the run's place or the conversation's places |
| A person | The person; agents in their space | The person; agents in their space when asked | The same checks as the person's own files |

## A conversation's places

A conversation starts with **its own place** (a project, or the person's own space), plus the organisation's knowledge
and the platform guide, which every agent may read. Any other place is **added by the person**, in the conversation's
header, like Claude Code's additional directories. This changes how conversations work and is part of this unit.

| | Mechanism |
|---|---|
| P1 | hq stores each conversation's places: its own, and each added one with who added it and when |
| P2 | `start_work`'s admission (`admitToBoundary`, `hq/src/conversations/work/boundaries.ts`) accepts only a place in the conversation. Today it accepts any place the person can reach |
| P3 | The lead's knowledge tools search and read every place in the conversation, each hit marked with its place. A worker or a task run has one place, as today |
| P4 | Adding checks that the person can access the place, then and on every turn; a place they lose access to drops out of the conversation |
| P5 | `suggest_place(place, why)` is the lead's only way to ask for one: it shows the person a card; only their click adds the place. A place the person can't reach is never suggested |
| P6 | The lead is told its places every turn, in its context after the cached part of the prompt, from the same re-checked list the tools use: the conversation's places by the names the person sees ("Your space" for the person's default personal project; any other personal project by its own name, as a project), that the organisation's knowledge and the platform guide are always in reach, and that anything in another place is out of reach until the person adds it (offered with `suggest_place`), never to be answered as if that place were empty. A search that finds nothing names the places it searched |

Removing a place takes effect from the next turn; work already started there carries on.

## The blast radius

Whatever a conversation moves between places, it moves between places its person chose to put together. Adding a place
says so once: *"Kernel will be able to read Shop's knowledge and start work there. What it finds can reach the other
places in this conversation."*

There is **no check on briefs**. Comparing every brief with the knowledge a conversation was shown would need a record
of every search, read and report, for a check that cannot catch the same idea in other words. Within a conversation's
places, carrying knowledge across is the person's choice. If a conversation ever needs to keep places apart, the simple
form is structural: a worker's report from another place would not come back into the conversation's context.

## How one place's knowledge could reach another

| | Path | After |
|---|---|---|
| B1 | A run reads another place's knowledge | Not possible: no knowledge is mounted; the tools reach only the run's place, the organisation and the guide |
| B2 | A tool call names another place | Not possible: the levels a call may name are those the run or conversation holds |
| B3 | The lead shows knowledge to the person | Allowed: the person may read it |
| B4 | The lead reads another place's knowledge or starts work there | Only a place the person added to the conversation |
| B5 | What a conversation holds goes into a brief for another of its places | Allowed: the person put those places together |
| B6 | The lead widens its own reach | Not possible: `suggest_place` only shows a card |

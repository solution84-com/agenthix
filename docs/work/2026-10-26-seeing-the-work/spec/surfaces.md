# Part 3 · Tasks, links and conversations

Where people meet the work outside the Files tool. Boards: *T1 · A task's files*, *T2 · Links and mentions*,
*T3 · Embedded*.

## A task's files (T1)

A task is where a person asked for the work, so it's where they look for the result.

- **Attachments open beside the task**, in the frame (part 2): beside on a wide screen, covering the task with ‹ back on
  a narrow one; ✕ closes. Today they only download (`TaskAttachments.tsx`).
- **Working files**: the task's own folder on the site (`tasks/<task>/`, adr-0039 §10), the runs' working directory,
  listed under the attachments. A file opens the same way.
- Attachments stay on hq's disk; hq's relay serves them like any file (D18).

## Stable links (T2, R5)

One link per file, the same from every surface, opening the file in place. Files and workspaces already have one: the
place's address with the tool and the file.

| Where the file is | Its link |
|---|---|
| A project's Files | `hq.example.com/projects/ALPHA?tool=files&file=reports/q3.pdf` |
| A workspace | `hq.example.com/projects/ALPHA?tool=workspaces&workspace=<id>&wfile=src/app.ts` |
| A task's working files (new) | `hq.example.com/projects/ALPHA?task=WEB-42&file=notes.md` |
| A person's own space | `hq.example.com/chat?tool=files&file=drafts/plan.md` |

- Never a site, a relay or a ticket: those are decided when it's opened. A link keeps working after a site moves.
- Someone who can't see the place gets the place's usual "not found", never the file's name.
- A file that's gone: "This file isn't here any more", with its folder.

## Chips in conversations (T2)

- A path an agent writes (`files/…`, as Mention inserts, or `artefacts/…`, as today) becomes a **chip**: icon, name,
  kind. Made by extending today's artefact-link interception (`useArtefactLinks.ts`) to files and workspace paths, so old
  messages gain them too.
- **Mention** puts the same chip **inside the message box**, where the cursor is, as a mention does in any chat: one
  piece, deleted with one Backspace, with text typed either side. A path typed or pasted into the box becomes a chip once
  it names a file. The agent receives the path, as today; the box sends the same text it always did.
- **A chip opens the file beside the thread**, where a shown part opens today (`ShownViewer.tsx`: beside on a wide
  screen, a sheet from the bottom on a phone), in the frame.
- **`@` in the message box** opens a picker under the caret: the files of the conversation's own place (its `files/`), narrowed by name
  as the person types after the `@`, with their folder beside each. Arrow keys and Enter (or a click) choose one, which
  replaces the `@…` with its chip, as Mention does; Escape closes it and leaves the text. The picker lists in groups,
  so agents and people can join it later as groups of their own; for now it holds Files. Finding a file by name is a
  site read (`location.findFiles`, site protocol 1.8): a place's storage only, bounded in results and time, symbolic
  links not followed.
- A chip for a file that's gone is struck through, its name kept. A link pasted into Agenthix shows as the same chip.
- **A folder** (`files/reports`, `files/reports/`) is a folder chip: its name and a folder icon; a click opens the
  place's Files tool at that folder.
- **Agents are told the form.** The agent's instructions say that a path written from the place's root (`files/…`,
  `artefacts/…`, `workspaces/<id>/…`) is what a person can click, and that a path relative to a folder is not.

### Tasks and their files

An agent doesn't know HQ's address, so it never writes a link with one. It names a task, or one of a task's files, by a
reference, and the reference becomes a chip in any conversation:

| An agent writes | The chip | A click |
|---|---|---|
| `tasks/MOP-1` | The task: its key, title and status | Opens the task |
| `tasks/MOP-1/notes.md` | A working file of the task (its folder, `tasks/<task>/`, where runs work) | Opens the file beside the thread |
| `attachments/MOP-1/screenshot.png` | One of the task's attachments | Opens the file beside the thread |

- A task is named by its key (`MOP-1`) or its id; the chip reads the same either way.
- **The agent learns them from its tools.** Reading a task lists its attachments, each with its name, size, label and
  reference; attaching a file answers with its reference. The agent's instructions say to write these references, and
  never an address.
- Access is checked when the chip asks for its facts, as for a file: a task the person can't see shows as plain text,
  never its title.
- **Copy link** on a task's file opened from a chip gives the task link form (`?task=…&file=…`).

## Images in agents' replies (D19)

Agents' replies are already Markdown (`ReplyBody.tsx` uses `MarkdownMessage`), so an agent shows an image by writing
it: `![flow](files/diagrams/flow.png)`, a path read from the conversation's place. The Markdown embed (part 2) draws it.
No new reply format. A path it only mentions stays a chip.

A message carries a reference, never bytes. Files keep no history on a site, so a message shows the file as it is now;
if its version changed after the message, a small line says "Changed since this message".

## A person's images in a conversation (stretch; D20, D21)

- **Added** by pasting, dropping or choosing a file.
- **Kept with the conversation's place**, on its site, **outside what runs mount**, as agent knowledge is:
  `{site}/uploads/<place>/<conversation>/`. People reach them through the relay with a ticket; agents only through
  Agenthix's tools scoped to the conversation, never by reading the file system. A run gets one only when the
  conversation hands it over.
- **The room's files.** Only people in the conversation see them: today its owner, as a conversation's content is
  private to its owner (adr-0041, adr-0077); later, when conversations can include several people, whoever is invited.
- **Sharing beyond the room is deliberate**: *Save to Files* (or asking the agent to) copies it into the place's Files,
  where members and runs see it; or attach it to a task, which publishes it to the project.
- Whether an agent can *see* an image is the conversation's work, not this epic's: this epic makes the file exist and
  show.

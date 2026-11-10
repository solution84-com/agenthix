# References, chips and embeds

How a file, a folder, a task or an attachment is named in text, and what a person sees where the text is drawn. For how
a file is opened once it is named, see [opening-files.md](opening-files.md).

## A reference

A **reference** is a path written from the root of a place, which is how an agent in that place sees its storage. It is
what Mention and the `@` picker put in a message, and what an agent writes in a reply. A person's own conversation sees
their own space as one folder; a project's conversation sees the project's.

| Written | Names |
|---|---|
| `files/reports/q3.pdf` | A file in the place's Files |
| `files/reports/` | A folder in the place's Files, written with a slash at the end |
| `artefacts/summary.md` | An artefact, by its file name |
| `workspaces/<id>/src/app.ts` | A file in one of the place's workspaces |
| `tasks/MOP-1` | A task, by its key or its id |
| `tasks/MOP-1/notes.md` | A file in the task's own folder, where its runs work |
| `attachments/MOP-1/screenshot.png` | One of the task's attachments |

A path written relative to a folder (`reports/q3.pdf`) is not a reference: only a path from the root is something a person
can click. An agent never writes a link with hq's address, because it does not know it. It writes a reference, and the
reference becomes a chip. Reading a task lists its attachments with their references, and attaching a file answers with
the new one, so an agent can copy them.

A reference is read in the place the text belongs to, with one exception: a task is found by its key across the
organisation, and what the chip shows follows the person's own access to it. A task a person cannot see shows as plain
text, never its title.

## A chip

A **chip** is a reference drawn as a small piece inline: an icon, the file's name and its kind. It is made wherever
Markdown is drawn, including old messages, from a reference written in a sentence or in backticks, from a Markdown link, and
from a stable link pasted in.

- A **file chip** opens the file in the **file viewer** (see [opening-files.md](opening-files.md#the-file-viewer)): over the page, with the conversation beside it, and the whole screen on a phone. A file whose version changed after
  the message was written carries the line "Changed since this message": a message holds a reference, never the bytes,
  and a file keeps no history, so it shows the file as it is now.
- A **folder chip** shows the folder's name and a folder icon, and opens the place's Files at that folder. Nothing is
  opened or signed to draw it.
- A **task chip** shows the task's key, title and status and opens the task. Its working files and attachments are file
  chips and open in the file viewer.
- A chip for a file that is **gone** is struck through with its name kept and says "Not here any more"; opened, it says
  where the file was looked for, as "There's no file at report/q3.md in Your space", never that it was deleted. A chip for
  a file the person may not read says "Can't be found" and never says whether it exists. A chip for a file with more
  than one hard link is as usual, and opens to say why the file is not shown.

### Chips in the message box

The message box shows each reference it holds as a chip, as a mention does in any chat: one piece, deleted with one
Backspace, with text typed either side. What is sent is the plain text with the paths in it, so the agent receives the
reference as it always has. **Mention** on an open file puts the file's reference in at the cursor. A path pasted or typed
becomes a chip once it names something.

Typing `@` opens a picker under the cursor, listing the files of the conversation's own place whose names contain what is
typed after it (matched on the file's own name, names that start with it first; with nothing typed, the most recently changed files), with each one's folder beside it. The arrow keys and Enter, or a click, choose one and replace the `@…`
with its chip; Escape closes it and leaves the text. The picker lists in groups so that other things, such as people or
agents, can later be groups of their own; today it holds files. Finding the files is a read of the place's storage on its
site: at most 20 results, from the first 20,000 entries or 1.5 seconds of searching, whichever ends first, never
following a symbolic link, and skipping `.git` and `node_modules`. It lists only the conversation's own place, since a
reference is read in its place.

## Embeds

An **embed** is a file drawn inside a page or message instead of beside it. One Markdown embed serves everywhere Markdown is
drawn: a Markdown file, a knowledge page, a task's description and comments, and an agent's reply.

|  | Opened | Embedded |
|---|---|---|
| Where | Files, a task's panel, full screen | Inside Markdown |
| Size | The whole area | The text's width; images up to 480 px tall |
| Kinds | Every kind with a renderer | Images drawn inline; any other file as a card |
| Controls | The frame's | None; a click opens it, hover shows Download |

- An image is written `![alt](path)`, or as `<img src="path" alt="…" width="600">` to size it. That tag is the only HTML
  Markdown accepts: only `src`, `alt`, `width` and `height` are kept, anything else in it is dropped, and any other tag is
  shown as text.
- An image on **another website** is not loaded on its own: it shows "Image from example.org · Load", so opening a page
  never tells another site who is reading.
- A path that leaves the place shows as a broken image with its name.

### The sibling rule

A place's folders are **siblings**: `files/`, `artefacts/`, `workspaces/<id>/`, and a task's attachments. A path that starts
with one of them names that file of the place, wherever the text is written. So a knowledge page or a task's description
can show `files/charts/q3.png`. Any other relative path is read against the folder of the page it is written in, and a path
that steps above the top is outside. A task's text can also name its own task's attachments as
`attachments/<task key>/<file>`, and only its own: another task's attachment is a chip in a conversation, never reached
from here. The organisation's own knowledge belongs to no place with files, so only its own paths resolve there. The
editor's Preview draws what the saved page draws.

An embed never names a site or a relay. Access is checked when it is drawn, as for opening: a file the person may not read
shows as not found, without saying whether it exists.

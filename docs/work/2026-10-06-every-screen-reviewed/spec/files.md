# Files, Artefacts, Knowledge and Workspaces

Part of the unit's design spec: see [the index](README.md).

## The Files tools

Agreed on their own mockups. A person comes to it to read what agents and people wrote, to find what
is known in the place, and to see the codebases agents build in. Writing still happens in the conversation:
"update the roadmap", "put this in specs", "start a docs site".

**Four tools under one heading, Files,** in the tools list: **Files · Artefacts · Knowledge · Workspaces**. Each is
a tool of its own, one step from the list, rather than a tab inside one tool. Together they show what the place
keeps on its site, which is laid out as:

| Folder | What it holds | Shown in |
|---|---|---|
| `files/` | The place's documents: its instructions (`AGENTS.md`), roadmap, specs, notes | Files |
| `files/.agents/` | The place's own skills for its agents, and each agent's own instructions and skills | Not listed |
| `artefacts/` | The throwaway things an agent makes in a conversation, one file each | Artefacts |
| `knowledge/` | What is known in the place, filed by topic and tag | Knowledge |
| `workspaces/<id>/` | One codebase each | Workspaces |
| `tasks/<id>/`, `members/<person>/` | A task run's working folder; each member's agenda | Not shown: they sit beside Files, not in it |

A run mounts the place's whole folder, read and write. **Nothing is stored in a conversation or in an agent.**

- **Files:** the place's documents, newest first, each with its kind, size and when it last changed (not who
  changed it, which nothing records). One line at the top shows the GitHub backup, or offers it. Search above the
  list. A file opens inside the tool (‹ Files), with Markdown and images rendered and **Mention**, which puts the
  file into the message being written; Download and Copy path under ⋯. Wide, the folders sit beside the open
  file, on white. There is no upload and no "Start session here": the conversation beside it already works in
  Files.
- **Artefacts:** what agents made in conversations, newest first, grouped Today · This week · Older, each with its
  kind, size and time. One opens in the same file viewer. A person keeps one by asking an agent to move it into
  Files. The agent's reply links to the artefact it made, and the link opens it in the Artefacts tool's viewer.
  Nothing records which conversation made an artefact, so none is shown.
- **Knowledge:** what is known in the place, broad and filed by topic and tag: how things work, decisions and why,
  research, who does what. Agents look things up there when they need to and add what they learn. It is **not
  the instructions** (`AGENTS.md`, which every run reads) and **not memory**.
  The view lists topics, newest first, each with a one-line summary and its tags, with search and a tag filter. A
  topic opens like a file. To correct one, a person **mentions it in a message** and says what is wrong; **Edit**
  by hand is shown as a placeholder, because hq cannot write to a site yet. How entries and tags are stored, and
  whether agents manage knowledge through a platform tool or by editing the files, is
  left for later; until then the view lists what `INDEX.md`
  gives, and tags show once that convention lands. In Chat, Knowledge is the person's own; it does not show the
  Memory notes, which stay in Settings.
- **Workspaces:** one card per codebase: its name, its repository, whether its preview is running, and its site,
  with **Open preview**, or **Connect GitHub** when it has no repository. **＋ New workspace** in the header. A site
  that does not answer is one quiet line, "1 site isn't answering, so its workspaces aren't shown", with the names
  behind it. **A workspace opens as its file explorer** (‹ Workspaces): a box at the top with its repository,
  whether its preview is running and its site on one row that wraps, and **Start a conversation here** and **Open
  preview** on their own row below; then its folders in a panel with the open file beside them (README first when
  there is one), or, when the tool is narrow, the folders as a list with a file opening in the viewer. **About** in
  its header opens its facts — repository (with Disconnect), preview, site, the tools agents may use (with Change) —
  its GitHub workflow runs with **Run a workflow**, and its secrets. Delete is under ⋯. With no repository the box
  says "No repository" with **Connect GitHub**; the warning that no GitHub App is connected shows only once
  connecting starts.
  **New workspace** is a short form in place: a name, then a GitHub repository or empty. Its site is the place's own, named on the form, not chosen. The cards
  show only what hq knows: no branch, last push or creator. **A workspace has its own address** in its place, which
  opens the place with the workspace open in this tool; a conversation's location line links there, and the old
  `/workspaces/<id>` forwards to it.
- **Mobile:** each tool full screen; a file or a topic full screen.

**First build:** each tool shows today's view inside the panel. Each tool then gets its own design pass ([Not in this pass](README.md#not-in-this-pass)).

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **Artefacts are one file each, opened in the file viewer** | An agent saves a throwaway item into `artefacts/` as one file, with no set folder, and links to it in its reply; the link opens it in the Artefacts tool's viewer. hq lists the folder for the Artefacts tool. The route that served an artefact by its set's id goes |
| **Standard names for a place's instructions** | `AGENTS.md` at the top of Files is the place's instructions for every agent, put into every prompt, taking over from PROJECT.md. The place's skills for every agent move from `files/.agenthix/skills/` to `files/.agents/skills/`, and one agent's own instructions and skills from `files/.agenthix/agents/<agent>/` to `files/.agents/agents/<agent>/`. Agents may still change them when asked |
| **hq reads knowledge** | The site lists and reads a place's `knowledge/` for the Knowledge tool, as it does `files/` |
| **No empty history folder** | A new project's Files no longer gets an empty `history/` folder, which nothing uses |
| **A workspace's own address** | A workspace opens at an address in its place, inside the Workspaces tool; `/workspaces/<id>` forwards there. Today a workspace has no address in its place, and the conversation's location line opens a page of its own |

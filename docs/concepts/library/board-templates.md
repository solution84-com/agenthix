# Board Templates

A board template is a reusable set of **columns** — the named steps of a workflow, applied when creating a new board. Templates are defined once and reused across projects; each board is an independent copy of a template, and a lasting workflow that lives until it is archived ([board.md](../tasks/board.md)).


---

## What a board template contains

```
BoardTemplate
  ├── name          — e.g. "Sprint", "Kanban", "Editorial"
  ├── description
  └── columns[]
        ├── name          — unique identifier within the template (e.g. "in_review")
        ├── label         — display string, user-editable (e.g. "In Review")
        ├── status        — TODO | IN_PROGRESS | DONE  (the task state the column maps to)
        ├── color         — hex, for UI column dot
        ├── order
        ├── description   — semantic meaning for agent reasoning
        ├── hint?         — transition guidance: "move here when X"
        └── autoQueue?    — if true, a task entering the column is queued for its agent
```

`description` and `hint` are the key fields that let agents reason about where a task belongs. Without them agents have no way to determine what a column means — they only know its name.

---

## Validation

A valid template must have at least one column mapping to each of the three task states, and no column named `backlog`:

- At least one `status: 'TODO'` column
- At least one `status: 'IN_PROGRESS'` column
- At least one `status: 'DONE'` column

Saving is blocked until all three are present. Backlog is not a template column: every board has one already, as the place for a task in no column.

---

## Boards are copies

When a board is created from a template, the columns are **copied** — not referenced. The board owns its own columns (`Board.columns`) from creation onwards, and a person can edit them later. Later edits to the template do not affect existing boards.

A template says nothing about **sprints**. Whether a board has sprints is chosen when the board is made (a workflow board or a sprint board, [board.md](../tasks/board.md#sprints)), whatever template its columns came from; the Sprint Board template is only a set of columns suited to one.

---

## Column automation

Each column has one automation flag, `autoQueue`, off by default. Off, a task entering the column waits for
a person to run it; on, it is queued as it enters, so its agent runs it when the boundary's pulse starts it.
It never queues a task in a done column, a task with no agent, or a task whose start time is still to come
([board.md](../tasks/board.md#columns-that-start-work)). Nothing moves a task to the next
column when its run finishes: a person or an agent moves it. An automatic advance was designed and is
**not built** ([task.md](../tasks/task.md#not-built)).

---

## The package

A board template is an asset of kind `board` ([the Library](./library.md)): a package holding `board.json` (its name, description and columns) beside its manifest. Agenthix's six ship in hq's image and are installed as `agenthix/<name>` when hq starts. The organisation's own are made in HQ under its own publisher name, version `1.0.0` and then each next minor version, with history; another publisher's template is edited by making the organisation's own copy ([editing makes your own copy](./library.md#editing-makes-your-own-copy)). Others come from an upload or a link ([installing](./installing.md)).

Board templates are **self-contained**: they reference no other asset, so a package needs nothing carried with it.

A board made from a template copies its columns and keeps a read-only link to the version it was made from. It never follows the template's later versions.

---

## Agenthix's templates

Read-only in the Library, and a copy can be made to change one.

| Identity | Name | Columns |
|---|---|---|
| `agenthix/kanban` | Kanban | To Do → In Progress → Done |
| `agenthix/sprint` | Sprint Board | To Do → In Progress → In Review → Done |
| `agenthix/issues` | Issue Tracker | Open → Triaged → In Progress → Resolved |
| `agenthix/ideation` | Ideation | Ideas → Evaluating → Approved → Executing → Done |
| `agenthix/roadmap` | Product Roadmap | Planned → In Development → In Review → Released |
| `agenthix/workforce-assembly` | Workforce Assembly | Planned → In Progress → In Review → Approved → Done |

Workforce Assembly is the one hq itself relies on: it is where the built-in agent's proposed teams wait for review.

---

## Where board templates appear

- **Library** (`/library`), filtered to boards
- **New Board** — the template picker when creating a board within a project
- **Team templates** — each project of a team template names the board template it starts with, by name (for example `sprint`)

---

## Agent integration

When an agent calls `get_task_details`, the response includes `availableColumns[]` — the columns of the board the task is on, each with its `name`, `status`, `description` and `hint`. The agent reads these to determine the correct column to move the task to (`update_task` with a `column`; null returns it to the board's Backlog). Without this context, agents leave tasks where they were. The same columns are put into the prompt of a task run.

---

## Related

- [library.md](./library.md) — assets, versions and the pin
- [workforce-templates.md](./workforce-templates.md) — team templates name the board template each project starts with
- [board.md](../tasks/board.md) — the three kinds of board, columns, the Backlog, sprints, archiving

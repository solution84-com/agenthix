# Board Templates

A board template is a reusable set of **columns** — the named steps of a workflow, applied when creating a new board. Templates are defined once and reused across projects; each board is an independent copy of a template, and a lasting workflow that lives until it is archived ([board.md](../tasks/board.md)).

Board templates are **self-contained** — they reference no other assets. There is no bundled/installed distinction: what is in the file is the complete record. System templates are always seeded at startup on every instance, so workforce templates that reference them by `templateId` never need to embed them.

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

## Source files and seeding

Board templates are authored as JSON files in `assets/library/boards/` and seeded into the `BoardTemplate` DB table at startup via `ensureSystemTemplates()`. The DB record stores only metadata — `id`, `name`, `description`, `version`, `isSystem`, and an `assetPath` pointer. The columns are read from the JSON file at runtime when a board is created from the template.

```
assets/library/boards/<id>.json  →  BoardTemplate { id, name, description, assetPath: 'library/boards/<id>.json', version }
```

Seeding is version-gated: if the stored `version` matches the file, the record is skipped. Bump `version` in the file to force an update on next startup.

Org-created board templates are stored under `org/boards/<id>.json` in hq's own storage (`<HQ_STORAGE_ROOT>/org/boards/`) with `isSystem = false`.

---

## DB schema

```prisma
model BoardTemplate {
  id          String   @id @default(uuid())  // system templates are seeded with a stable id, e.g. "sys-tpl-0001-kanban"
  name        String
  description String
  assetPath   String                 // relative path — resolve under hq's assets root (system) or hq's storage root (org)
  isSystem    Boolean  @default(false)
  version     Int      @default(1)
  source         LibrarySource @default(MADE_HERE)   // built in, made here or marketplace
  packageVersion String        @default("1")
  publisher      String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

---

## Installed form vs bundled form

Board templates have **no bundled form**. They are self-contained — they reference no other assets by slug, so there is nothing to embed for portability. A board template JSON file is already the complete record.

System templates (`sys-tpl-*`) are seeded at startup on every instance, so workforce templates that reference them by `templateId` can always resolve them without bundling. Custom board templates created by users are org-local and not expected to travel between instances.

---

## System templates

The platform ships 6 board templates, authored in `assets/library/boards/` and seeded at startup. System templates are read-only in the UI — orgs can create custom templates alongside them.

| ID | Name | Columns |
|---|---|---|
| `sys-tpl-0001-kanban` | Kanban | To Do → In Progress → Done |
| `sys-tpl-0002-sprint` | Sprint Board | To Do → In Progress → In Review → Done |
| `sys-tpl-0003-issues` | Issue Tracker | Open → Triaged → In Progress → Resolved |
| `sys-tpl-0004-ideation` | Ideation | Ideas → Evaluating → Approved → Executing → Done |
| `sys-tpl-0005-roadmap` | Product Roadmap | Planned → In Development → In Review → Released |
| `sys-tpl-0006-workforce-assembly` | Workforce Assembly | Planned → In Progress → In Review → Approved → Done |

---

## Where board templates appear

- **Library page** (`/library`) — the **Boards** tab, beside Agents, Skills and Teams
- **New Board modal** — template picker when creating a board within a project
- **Workforce templates** — referenced by `templateId` in `boards[].templateId` (e.g. `"sys-tpl-0002-sprint"`)

---

## Agent integration

When an agent calls `get_task_details`, the response includes `availableColumns[]` — the columns of the board the task is on, each with its `name`, `status`, `description` and `hint`. The agent reads these to determine the correct column to move the task to (`update_task` with a `column`; null returns it to the board's Backlog). Without this context, agents leave tasks where they were. The same columns are put into the prompt of a task run.

---

## Related

- [library.md](./library.md) — three-layer library model
- [workforce-templates.md](./workforce-templates.md) — workforce templates reference board templates by `templateId`
- [board.md](../tasks/board.md) — the three kinds of board, columns, the Backlog, sprints, archiving

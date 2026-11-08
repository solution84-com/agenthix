# Tasks, runs, boards and routines — data model

Part of [`../spec.md`](../spec.md). **New** is added, **gone** is removed. Nothing is converted: until
`0.1.0-rc.1` old rows and old layout are ignored or wiped.

## Hq

**TaskType** — `projectId`, `name`, `icon`, `kind` (TASK · EPIC · CUSTOM), `madeFromVersionId?` (the Library
task template it came from), `archivedAt`. Task and Epic exist in every project and cannot be deleted. A type with open
tasks cannot be archived; only a never-used type is deleted.

**TypeColumn** — `typeId`, `name`, `colour`, `order`, `state` (BACKLOG · TODO · IN_PROGRESS · DONE),
`defaultForState`. Each column sits in one task state, and each state has at least one column (a task set to Done
lands on its default column). Moving a column to another state is done from its menu, with a dialog naming the
tasks affected.

**Task**
- New: `typeId`, `columnId` (a column of its type), `rank` (project-wide), `scheduleAt?` (Run at…).
- `state` replaces `status`, with Backlog first; it is written together with the column.
- `sprintId?`, `epicId?` (a task of type Epic); `runState`, `runId`, `runCount` are system-set.
- Unchanged: `priority`, agent, plan and the rest.
- Gone: `boardId`, `column`, `isEpic`, `routineId`, `roundAt`.

**Sprint** — belongs to the **project** (was a board): `number`, `name`, dates, `finishedAt`. One series per
project.

**Board** (a saved view) — `kind` (TYPE · STATE · EXECUTION · FIELD), `typeId?` or `fieldId?`, `filter` (sprint,
epic, agent …). STATE and EXECUTION are built in. Gone: its columns JSON, its sprints, *Show also*, its workflow kind, its template origin and its archive (saved views are deleted).

**CustomField**, **FieldOption**, **TaskFieldValue** — a field has a `type` (SINGLE_SELECT only now), options
(name, colour, order) and one value per task. Extra views only; never the task state.

**Routine** — `schedule` (cron rule and timezone; next due time stored), `agentId`, `instructions`,
`modelChoice?`, `onBehalfOfUserId` (the last person who changed it), `enabled`. Gone: its task template and rounds.

**RunResult** — unchanged.

## Site

**AgentRun** — `taskId?` (null for a reply or a routine run); new `routineId?`.

## How each board kind reads it

| Board kind | Its columns | Dragging a card |
|---|---|---|
| Type (for example Feature request) | That type's columns | Sets the task's column, so its state, and its rank |
| Task state (built in) | Backlog · To do · In progress · Done, every type | Sets the state: the task lands on its type's default column for it |
| Execution (built in) | Not started · Waiting · Running · Needs you · Failed · Finished | Not dragged: Run, Stop and Run again are in the card's ⋯; a task that needs the person is answered on its page |
| Field | A custom field's options | Sets that field's value only |
| Any, with a filter | As above, only the tasks the filter holds | As above |

A drop on a filtered board goes after the visible card above it.

## Removed with the old starting model

Automation settings, the pulse, the throttle (and the `RUN_THROTTLED` refusal), the queue limit and the column that
starts work. About 17 files name the auto-start columns and 23 the throttle.

## Library

The Library's `board` asset kind becomes `task template` (the same asset layer: identity, signed install, pinned
versions). A task template holds task types with their columns and custom fields with their options. A team template
that carried boards carries the types and fields instead. Installing copies them into the project; a type or field of the
same name is left alone.

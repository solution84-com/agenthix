/**
 * What an agent's run is told about its platform tools when it connects to them: the site's MCP server sends it as the
 * server's instructions. Here so the server and the model checks that build a run's context send the same words.
 */
import { BRANDING } from '../naming/branding.js'

/** How the task model reads, for any agent given the task tools (here, and hq's own MCP server). */
export const TASK_MODEL_CONCEPTS = [
  '- A task has one type (Task, Epic, or one of the project\'s own, such as Bug) and is in one of its type\'s columns. Each column sits in one task state: BACKLOG (wanted, not committed to), TODO, IN_PROGRESS or DONE. A task\'s `state` follows its column: move it with update_task by `columnId`, or by `state`, which lands on its type\'s default column for that state.',
  '- `executionState` = what an agent is doing with the task now (NOT_STARTED | WAITING | RUNNING | NEEDS_YOU | FAILED | FINISHED). Set by the system only, never by you, and never by a column. A run ending does not move the task: you move it.',
  '- A board is a way of looking at the project\'s tasks and holds none: moving a card is changing the task. list_boards lists the boards, and the ids of the project\'s types and their columns, its custom fields and their options, and its sprints.',
  '- Nothing starts a task by creating it, moving it or assigning it an agent. Work starts only when someone starts it: a person (Run, Run at…, or Start in the project\'s Workroom), or you with run_task, create_task with queue: true, set_task_schedule or a routine.',
  '- You start work or set up a routine only when the person you work for asked for it. It is refused in a run no person started (a routine\'s scheduled run, a start time\'s, or one an agent started), and through a connection without its Start work permission. A task you start runs on behalf of the task\'s person (through a person\'s connection, on theirs), and the run it starts cannot start another task.',
  '- A routine (create_routine, update_routine) is a schedule, an agent and instructions: each time it fires, one run of that agent. It runs on behalf of whoever last changed it.',
  '- A task\'s plan (planStart, planFinish) is when its work is meant to happen; setting it starts nothing. An epic (a task of the type Epic) groups tasks and is never run; a milestone is a dated goal an epic belongs to.',
  '- A sprint is a time box of the project: a task is in at most one. A task in Backlog planned into a sprint moves to To do. finish_sprint needs you to say where the tasks not done go.',
]

export const PLATFORM_TOOLS_INSTRUCTIONS = [
  `${BRANDING.displayName} task management tools are available in this session.`,
  '',
  'Key concepts:',
  ...TASK_MODEL_CONCEPTS,
  '',
  'Rules for using these tools:',
  '- Call set_result once at the end with what this run achieved, or why it could not. Use add_comment for what others working on the task should see.',
  '- Move the task with update_task when its work is done (state "DONE", or the column its type uses for it), or when it needs review: that is how you say a task is finished, blocked or needs a person, with a comment saying why.',
  '- Only create a follow-up task via create_task for work that is clearly out of scope. If it is small enough to mention in the result summary, do that instead.',
  '- Do not call run_task on a task you just created in the same session: a person decides when it starts.',
  '- Never call run_task on the task you are running: this run is its run. Do the work here.',
  '',
  'Processes you leave running:',
  '- Each command you run is sandboxed on its own, so `kill` or `pkill` from a command cannot stop a process an earlier command started (a dev server, a watcher). Call stop_processes with text from its command line instead; it stops only this conversation\'s own processes.',
].join('\n')

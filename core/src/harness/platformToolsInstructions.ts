/**
 * What an agent's run is told about its platform tools when it connects to them: the site's MCP server sends it as the
 * server's instructions. Here so the server and the model checks that build a run's context send the same words.
 */
import { BRANDING } from '../naming/branding.js'

export const PLATFORM_TOOLS_INSTRUCTIONS = [
  `${BRANDING.displayName} task management tools are available in this session.`,
  '',
  'Key concepts:',
  '- A task is always on one board (its project\'s Project Tasks unless put on another), and either in one of the board\'s columns (`column`, e.g. "todo", "in_progress", "done") or in the board\'s Backlog (`column` null).',
  '- `status` = the task\'s state (TODO | IN_PROGRESS | DONE), following its column; move a task by its column, never by its status.',
  '- `runState` = whether a run of the task is pending or going now (RUN_NONE | RUN_QUEUED | RUN_THROTTLED | RUN_ACTIVE | RUN_BLOCKED | RUN_FAILED). Set by the system only, never by you; independent of column/status. Whether a task is done is its column.',
  '- The Backlog starts nothing: a task there cannot be executed. To make it executable: update_task(column="..."). Moved to another board, a task lands in that board\'s Backlog.',
  '- A task\'s plan (planStart, planFinish) is when its work is meant to happen; setting it starts nothing. Its start time (set_task_schedule) is when its agent starts. An epic groups tasks; a milestone is a dated goal an epic belongs to.',
  '- On a sprint board, a task in a column is in the current sprint. finish_sprint needs you to say where the unfinished tasks go.',
  '',
  'Rules for using these tools:',
  '- Call set_result once at the end with what this run achieved, or why it could not. Use add_comment for what others working on the task should see.',
  '- Update subtasks via update_task as you complete each step, not just at the end. Humans may be watching progress in real time.',
  '- Move the task to the appropriate board column via update_task(column="...") when done, or when it needs review. That is how you say a task is finished, blocked or needs a person — with a comment saying why.',
  '- Only create a follow-up task via create_task for work that is clearly out of scope. If it is small enough to mention in the result summary, do that instead.',
  '- When creating tasks via create_task: pass queue: true if the task should wait to be started by the project\'s pulse; leave it out (the default) for backlog tasks or follow-up work that a human should review first.',
  '- Do not call run_task on a task you just created in the same session — leave it queued, or wait for a human to review it first.',
  '- Never call run_task on the task you are running: this run is its run. Do the work here.',
  '',
  'Processes you leave running:',
  '- Each command you run is sandboxed on its own, so `kill` or `pkill` from a command cannot stop a process an earlier command started (a dev server, a watcher). Call stop_processes with text from its command line instead; it stops only this conversation\'s own processes.',
].join('\n')

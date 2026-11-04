/**
 * Control-Plane Tool Schemas
 * ===========================
 *
 * The Zod parameter shapes (and, where the original registration carried
 * one, the description string) for every operation in the control-plane
 * registry (operations.ts), every one of them. Transport-shared data,
 * deliberately living beside operations.ts rather than under mcp/ (moved
 * there in plan 5b-2 task 5's review, C1): both transports validate
 * against it, not just the MCP one.
 *
 * `createMcpServer` (mcp/mcpServer.ts) registers CONTROL_PLANE_TOOLS in one
 * loop; workforceTools.ts registers WORKFORCE_TOOLS the same way — both
 * always call `runOp(name, args)`. dataApi.ts (the HTTP path) uses
 * ALL_CONTROL_PLANE_TOOLS to `z.object(schema).safeParse(args)` BEFORE
 * dispatch, which is the actual boundary defence: the MCP SDK enforces these
 * shapes for that transport already, but nothing did for POST /api/v1/data,
 * so a caller there could hand createProductOp/updateProductOp (etc.) an
 * arg object carrying keys no schema declares — and those two ops used to
 * spread `args` straight into a Prisma `data:` object, so an extra key could
 * ride along as a nested relation write. safeParse strips unknown keys on
 * both transports now; the ops that used to spread raw args also destructure
 * explicitly as a second layer (see productOps.ts) — belt and braces, since
 * a future op that spreads args is one boundary-validation bug away from the
 * same class of issue otherwise.
 */
import { z, type ZodRawShape } from 'zod'
import { CODE_WORK_TOOL_SCHEMAS } from './codeWorkToolSchemas'
import { APP_TOOL_SCHEMAS } from './appToolSchemas'
import { PLANNING_TOOLS } from './planningToolSchemas'
import { KNOWLEDGE_DATA_PATH_TOOLS } from './knowledgeToolSchemas'
import { WORKFLOW_TOOL_SCHEMAS } from '../../workflows/agentToolsSchemas'
import { PROPOSE_SKILL_SCHEMA } from '../../assets/proposals/tool'
import { MEMORY_BODY_MAX_CHARS, MEMORY_MAX_TAGS, MEMORY_TITLE_MAX_CHARS } from '../../shared/memory/protocol'

/** A routine's repeat: every N minutes, hours or days (at least 5 minutes), or a time of day on given weekdays. */
const ROUTINE_RULE = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('interval'),
    every: z.number().int().describe('How many units between rounds'),
    unit: z.enum(['minutes', 'hours', 'days']),
  }),
  z.object({
    kind: z.literal('weekly'),
    time: z.string().describe('HH:MM on the 24-hour clock, in `timezone`'),
    weekdays: z.array(z.number().int()).describe('0 = Sunday … 6 = Saturday'),
  }),
]).describe('When rounds come')

export interface ControlPlaneTool {
  name: string
  description?: string
  schema: ZodRawShape
}

export const CONTROL_PLANE_TOOLS: ControlPlaneTool[] = [
  // ── Org ─────────────────────────────────────────────────────────────────
  { name: 'get_org', schema: {} },
  {
    name: 'update_org',
    schema: {
      name: z.string().optional(),
      vision: z.string().optional(),
      mission: z.string().optional(),
    },
  },
  { name: 'list_agents', schema: {} },
  {
    name: 'list_teams',
    schema: { includeDisabled: z.boolean().optional() },
  },
  { name: 'list_projects', schema: {} },
  {
    name: 'list_boards',
    schema: {
      projectId: z.string().optional().describe('Filter by project: its key (e.g. WAL) or its ID; omit to list all boards'),
      includeArchived: z.boolean().optional().describe('Include archived boards (default false)'),
    },
  },
  {
    name: 'get_board',
    schema: { boardId: z.string().describe('The board ID to retrieve') },
  },
  {
    name: 'fetch_my_queued_tasks',
    schema: { agentId: z.string().describe('The agent ID to fetch queued tasks for') },
  },
  {
    name: 'list_tasks',
    schema: {
      projectId:       z.string().optional().describe('Filter by project: its key (e.g. WAL) or its ID'),
      boardId:         z.string().optional().describe('Filter by board ID'),
      backlogOnly:     z.boolean().optional().describe("Only tasks in a board's Backlog (column null): not started, and never started by the board"),
      assignedAgentId: z.string().optional().describe('Filter by assigned agent ID'),
      runState: z.enum(['RUN_NONE', 'RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED']).optional()
        .describe('Filter by run state — whether a run of the task is pending or going: RUN_NONE (none), RUN_QUEUED (in its agent\'s line), RUN_THROTTLED (waiting for the project\'s next round), RUN_ACTIVE (running), RUN_BLOCKED (needs a person), RUN_FAILED (last run failed). Set by the system only'),
      status:          z.string().optional().describe('Filter by workflow status (TODO | IN_PROGRESS | DONE)'),
      priority:        z.enum(['low', 'medium', 'high']).optional().describe('Filter by priority'),
      limit:           z.number().optional().describe('Max tasks to return (default 50)'),
    },
  },
  {
    name: 'get_task_details',
    description:
      "Get a task's details, its comments and its attachments. Each attachment has a reference " +
      '(attachments/WAL-2/notes.md): to show a person the file, write that reference in your reply, as it is.',
    schema: { taskId: z.string().describe('The task to retrieve: its key (e.g. WAL-2) or its ID') },
  },
  {
    name: 'archive_task',
    schema: { taskId: z.string().describe('The task to archive: its key (e.g. WAL-2) or its ID') },
  },
  {
    name: 'delete_task',
    schema: { taskId: z.string().describe('The task to permanently delete: its key (e.g. WAL-2) or its ID') },
  },
  {
    name: 'tick_subtask',
    schema: {
      taskId: z.string().describe('The task containing the subtask: its key (e.g. WAL-2) or its ID'),
      subtaskTitle: z.string().describe('Exact title of the subtask to update'),
      done: z.boolean().describe('Whether the subtask is complete'),
    },
  },
  {
    name: 'update_task',
    schema: {
      taskId: z.string().describe('The task to update: its key (e.g. WAL-2) or its ID'),
      title: z.string().optional().describe('New title'),
      workspaceId: z.string().nullable().optional().describe("One of the project's workspaces for the task to work in, or null for the project's files"),
      description: z.string().optional().describe('New description'),
      subtasks: z.array(z.object({ title: z.string(), done: z.boolean() })).optional()
        .describe('Full replacement subtask list'),
      labels: z.array(z.string()).optional().describe('Full replacement labels list'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Task priority'),
      boardId: z.string().optional().describe("Move the task to this board: it lands in the board's Backlog unless `column` is given too"),
      column: z.string().nullable().optional().describe(
        'Move the task to this column name (e.g. "in_progress", "done"), or null for its board\'s Backlog'
      ),
      planStart: z.string().nullable().optional().describe('Plan: the day the work is meant to start (YYYY-MM-DD), or null to clear. Moves no work: it is not the start time'),
      planFinish: z.string().nullable().optional().describe('Plan: the day the work is meant to finish (YYYY-MM-DD), or null to clear'),
      isEpic: z.boolean().optional().describe('true makes it an epic: a task that groups other tasks. An epic belongs to no epic'),
      epicId: z.string().nullable().optional().describe('The epic it belongs to (at most one), or null to take it out'),
      milestoneId: z.string().nullable().optional().describe("An epic's milestone, or null to clear; only an epic has one"),
    },
  },
  {
    name: 'create_task',
    schema: {
      title: z.string().describe('Task title'),
      projectId: z.string().describe('Project this task belongs to: its key (e.g. WAL) or its ID'),
      orgId: z.string().optional().describe('Not used: there is one organisation. Kept so callers that pass it are not refused'),
      boardId: z.string().optional().describe("Board to place the task on; omit for the project's Project Tasks"),
      column: z.string().optional().describe("Column to place it in, by name or state; omit for the board's Backlog (its first column when queue is true)"),
      assignedAgentId: z.string().optional().describe('Agent ID to assign this task to'),
      workspaceId: z.string().optional().describe("One of the project's workspaces for the task to work in; omit for the project's files. In a code workspace (Git) it works on a branch of its own"),
      description: z.string().optional().describe('Task description'),
      labels: z.array(z.string()).optional().describe('Labels to attach'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Task priority'),
      subtasks: z.array(z.object({ title: z.string(), done: z.boolean() })).optional(),
      planStart: z.string().nullable().optional().describe('Plan: the day the work is meant to start (YYYY-MM-DD), or null to clear. Moves no work: it is not the start time'),
      planFinish: z.string().nullable().optional().describe('Plan: the day the work is meant to finish (YYYY-MM-DD), or null to clear'),
      isEpic: z.boolean().optional().describe('true makes it an epic: a task that groups other tasks. An epic belongs to no epic'),
      epicId: z.string().nullable().optional().describe('The epic it belongs to (at most one), or null to take it out'),
      milestoneId: z.string().nullable().optional().describe("An epic's milestone, or null to clear; only an epic has one"),
      queue: z.boolean().optional().describe(
        'true = queue a run of it: it waits for the project\'s pulse to start it (or a person), subject to the project\'s queue limit and maximum depth. ' +
        'Default false = it waits for a person to review and queue it.'
      ),
    },
  },
  {
    name: 'set_task_schedule',
    description:
      'Set or clear the time a task starts — once: at that time it starts as if a person pressed Run. Only when ' +
      'the person you are working for asked you to — refused in a run the pulse or a schedule started, and unless ' +
      'the project allows agents to set schedules. For work that repeats, create a routine instead. ' +
      'Times and repeats are read in the timezone of the person you are working for unless you name a `timezone`; the result says which was used.',
    schema: {
      taskId: z.string().describe('The task to schedule: its key (e.g. WAL-2) or its ID'),
      at: z.string().optional().describe(
        'ISO 8601 time the task starts. With no offset (2026-10-05T09:00) it is the wall-clock time in `timezone`, which is the person you are working for\'s own timezone unless you name one; with an offset, that offset is used.',
      ),
      timezone: z.string().optional().describe('IANA timezone an offset-less `at` is read in, e.g. Australia/Sydney. Omit it to use the person you are working for\'s (UTC only if they have none).'),
      clear: z.boolean().optional().describe('true removes the task\'s start time'),
    },
  },
  {
    name: 'create_routine',
    description:
      'Set up a routine: work that repeats. It keeps its next round — a task from the template — waiting for its ' +
      'next time. At that time a round with an agent starts, whatever its column, as a task\'s start time does; ' +
      'one with no agent waits for a person. Only when the person you are working for asked you to, on their behalf — refused in a run ' +
      'the pulse or a schedule started, and unless the project allows agents to set schedules. ' +
      'Times and repeats are read in the timezone of the person you are working for unless you name a `timezone`; the result says which was used.',
    schema: {
      projectId: z.string().describe('The project the routine lives in: its key (e.g. WAL) or its ID'),
      title: z.string().describe("Each round's title"),
      description: z.string().optional().describe("Each round's description"),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      labels: z.array(z.string()).optional(),
      assignedAgentId: z.string().optional().describe('Agent each round is assigned to; omit for none'),
      boardId: z.string().optional().describe("Board a round starts on; omit for the project's Project Tasks"),
      column: z.string().nullable().optional().describe("Column it starts in, or null for the board's Backlog (default: a named board's first column; Project Tasks' Backlog)"),
      rule: ROUTINE_RULE,
      at: z.string().optional().describe('ISO 8601 time the repeat is anchored at, or begins from (default: now). With no offset it is read in `timezone`.'),
      timezone: z.string().optional().describe('IANA timezone the times are read in, e.g. Europe/London. Omit it to use the timezone of the person you are working for (UTC only if they have none).'),
    },
  },
  {
    name: 'update_routine',
    description:
      'Change, pause or turn back on a routine; its waiting round follows. Pausing removes the waiting round; ' +
      'turning it on creates a fresh one. Same conditions as create_routine, and only for a routine the person ' +
      'you are working for may change. ' +
      'Times and repeats are read in the timezone of the person you are working for unless you name a `timezone`; the result says which was used.',
    schema: {
      routineId: z.string().describe('The routine to change'),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      labels: z.array(z.string()).optional(),
      assignedAgentId: z.string().nullable().optional().describe('null for no agent'),
      boardId: z.string().nullable().optional().describe("null for the project's Project Tasks"),
      column: z.string().nullable().optional().describe("null for the board's Backlog"),
      rule: ROUTINE_RULE.optional(),
      at: z.string().optional().describe('A time with no offset is read in `timezone`'),
      timezone: z.string().optional().describe('IANA timezone the times are read in, e.g. Europe/London. Omit it to use the timezone of the person you are working for (UTC only if they have none).'),
      enabled: z.boolean().optional().describe('false pauses it; true turns it back on'),
    },
  },
  {
    name: 'attach_file',
    description:
      'Attach a file to a task. Answers with its reference (attachments/WAL-2/notes.md): to show a person the file, ' +
      'write that reference in your reply, as it is.',
    schema: {
      agentId: z.string().optional().describe("Deprecated — no longer used"),
      taskId: z.string().describe('The task to attach the file to: its key (e.g. WAL-2) or its ID'),
      name: z.string().describe('Display name (e.g. "Auth Design Notes")'),
      filename: z.string().describe('Filename to create (e.g. "auth-design.md")'),
      content: z.string().describe('Full file content to write'),
      label: z.string().optional().describe('Optional label for the attachment (e.g. "application", "draft-selections")'),
    },
  },
  {
    name: 'create_agent',
    schema: {
      name: z.string().describe('Display name for the agent'),
      role: z.string().describe('The role this agent fulfills'),
      responsibilities: z.string().describe('Description of agent responsibilities'),
      handle: z.string().optional().describe('Unique handle (auto-generated if omitted)'),
      createdBy: z.string().optional().describe('User or agent ID that created this agent'),
    },
  },
  {
    name: 'list_presets',
    schema: { type: z.enum(['avatars', 'covers']).describe('Preset type to list') },
  },
  {
    name: 'apply_agent_preset',
    schema: {
      agentId: z.string().describe('ID of the agent to update'),
      imageType: z.enum(['avatar', 'cover']).describe('Which image to set'),
      filename: z.string().describe('Preset filename from list_presets'),
    },
  },
  {
    name: 'create_team',
    schema: {
      name: z.string().describe('Team name'),
      purpose: z.string().describe('Purpose or mission of the team'),
      agentIds: z.array(z.string()).describe('List of agent IDs to include in this team'),
      createdBy: z.string().optional().describe('Agent or user ID creating the team'),
    },
  },
  {
    name: 'create_project',
    schema: {
      name: z.string().describe('Project name'),
      description: z.string().optional().describe('Project description'),
      defaultAgentId: z.string().optional().describe('Default agent ID for tasks in this project'),
      createdBy: z.string().optional(),
    },
  },
  {
    name: 'create_board',
    schema: {
      projectId: z.string().describe('The project this board belongs to: its key (e.g. WAL) or its ID'),
      name: z.string().describe('Board name'),
      description: z.string().optional().describe('Board description'),
      templateId: z.string().optional().describe('Board template to use for columns, by name (e.g. workforce-assembly). Ignored if columns are provided.'),
      kind: z.enum(['workflow', 'sprints']).optional().describe('A workflow board (default), or one with sprints: numbered time boxes'),
      sprintDays: z.number().int().optional().describe('A sprint board\'s sprint length in days (default 14)'),
      columns: z.array(z.object({
        name: z.string(),
        label: z.string(),
        status: z.enum(['todo', 'in_progress', 'done']),
      })).optional().describe('Custom columns; defaults to To Do / In Progress / Done. Every board has a Backlog before them already'),
      createdBy: z.string().optional(),
    },
  },
  ...PLANNING_TOOLS,
  {
    name: 'add_comment',
    schema: {
      taskId: z.string().describe('The task to comment on: its key (e.g. WAL-2) or its ID'),
      agentId: z.string().optional().describe('Not used: a comment is posted as the person who made the connection'),
      runId: z.string().optional().describe('The run ID this comment belongs to (optional)'),
      content: z.string().describe('Comment text — progress update or result summary'),
    },
  },
  {
    name: 'run_task',
    description:
      'Start a run of a queued task now. It returns at once — when the run has started, or is waiting for its agent\'s ' +
      'running task in the project to finish — and never waits for the run to end: its outcome is the task\'s, on its board.',
    schema: { taskId: z.string().describe('The key (e.g. WAL-2) or ID of a queued task to start now. Only in a run a person started; the run it starts cannot start another') },
  },

  // ── Run visibility (person-scoped execution spec §3, ADR-0077) ────────────
  {
    name: 'list_active_runs',
    description:
      'See what is running right now in your own boundary — the same project, or your own storage — ' +
      'before starting work that might collide with it. Shows each run\'s agent, who or what started it, ' +
      'where it is working, and since when. Never a run\'s content: no message text, no task/session title.',
    schema: {},
  },

  // ── Product ─────────────────────────────────────────────────────────────
  {
    name: 'list_products',
    description: 'List all products of the organisation, including name, slug, description, vision, and status.',
    schema: {
      agentId: z.string().optional().describe(
        'Not used: every product is listed, whoever calls. Kept so older callers that pass it are not refused.'
      ),
    },
  },
  {
    name: 'get_product',
    description: 'Get full details of a product by ID, including its projects and members.',
    schema: { productId: z.string().describe('ID of the product') },
  },
  {
    name: 'create_product',
    description: 'Create a new product. The slug must be unique and URL-safe (lowercase, hyphens).',
    schema: {
      name:        z.string().describe('Display name'),
      slug:        z.string().describe('Unique URL-safe identifier (lowercase, hyphens)'),
      description: z.string().optional().describe('Short description'),
      vision:      z.string().optional().describe('Product vision statement'),
    },
  },
  {
    name: 'update_product',
    description: 'Update a product\'s name, slug, description, vision, or status.',
    schema: {
      productId:   z.string().describe('ID of the product to update'),
      name:        z.string().optional(),
      slug:        z.string().optional(),
      description: z.string().nullable().optional(),
      vision:      z.string().nullable().optional(),
      status:      z.enum(['active', 'sunset']).optional(),
    },
  },
  {
    name: 'delete_product',
    description: 'Permanently delete a product. Projects are unlinked, not deleted. This cannot be undone.',
    schema: { productId: z.string().describe('ID of the product to delete') },
  },
  {
    name: 'get_github_config',
    description: 'Check whether the site GitHub App is registered. Returns { configured: true, slug } if set up, { configured: false } if not.',
    schema: {},
  },
]

// ── Workforce ─────────────────────────────────────────────────────────────
// Registered by workforceTools.ts, not mcpServer.ts's generic loop — kept as
// a separate array so mcpServer.ts's loop and workforceTools.ts's loop never
// both register the same tool name. ALL_CONTROL_PLANE_TOOLS below is what
// dataApi.ts validates against, so these still get boundary validation on
// the HTTP path exactly like every other registry operation.
export const WORKFORCE_TOOLS: ControlPlaneTool[] = [
  { name: 'list_workforce_templates', schema: {} },
  {
    name: 'propose_workforce_template',
    schema: {
      templateId: z.string().describe('Workforce template to propose: the id list_workforce_templates gives (e.g. "agenthix/dev-team")'),
      reason: z.string().describe('Why you are proposing this template — shown to the user on the review page'),
    },
  },
]

/**
 * Data-path-only operations (plan 5d-2 task 8) — reachable ONLY through
 * `POST /api/v1/data` (site's `callHqData` forwards), never through hq's own
 * MCP surface. Deliberately excluded from `CONTROL_PLANE_TOOLS`/
 * `WORKFORCE_TOOLS` — `mcpServer.ts` and `workforceTools.ts` iterate those two
 * arrays directly to register hq's own MCP tools, so an entry here never
 * becomes an hq-side MCP tool (this task's escalation rule: hq's MCP server
 * files stay untouched). Folded into `ALL_CONTROL_PLANE_TOOLS` below only —
 * that is what `dataApi.ts` validates against.
 */
export const DATA_PATH_ONLY_TOOLS: ControlPlaneTool[] = [
  {
    name: 'set_result',
    description:
      'State the result of this run, at its end: what it achieved, in a few sentences a person can take in at a glance. ' +
      'It is recorded on the run and, in a task, as the task\'s result; a later call replaces it. Comments are for ' +
      'working with others, not for the result.',
    schema: {
      result: z.string().min(1).max(4000).describe('What this run achieved, in plain words'),
      runId: z.string().optional().describe('Filled in by the site with the run this is called from; leave it out'),
    },
  },
  {
    name: 'remember',
    description:
      'Remember one thing you learned, so it can be recalled later by meaning. It must stand alone: a title that ' +
      'names its subject and a body that makes sense months from now without this conversation — a fact, not a ' +
      'document, at most 1500 characters. Scope "person" is what is true of the person you work for, with any ' +
      'agent; "agent_person" what only you need to know about them; "agent_place" what you learned about the ' +
      'project or space you work in, which never leaves it. Writing to an existing key replaces that item; one very ' +
      'like an item already held updates it instead of adding another.',
    schema: {
      scope: z.enum(['person', 'agent_person', 'agent_place']).describe('Whose memory: the person\'s, yours about them, or yours about this place'),
      title: z.string().min(1).max(MEMORY_TITLE_MAX_CHARS).describe('A short title naming the subject'),
      body: z.string().min(1).max(MEMORY_BODY_MAX_CHARS).describe('What you learned, readable on its own'),
      kind: z.enum(['fact', 'preference', 'decision', 'feedback', 'project']).describe('What sort of thing it is'),
      tags: z.array(z.string()).max(MEMORY_MAX_TAGS).optional().describe('A few words to group it by'),
      key: z.string().max(64).optional().describe('The key of an item to replace; made from the title when left out'),
    },
  },
  {
    name: 'forget',
    description: 'Forget one remembered item that is no longer true, by its key and scope as recall shows them.',
    schema: {
      key: z.string().min(1).describe('The item\'s key'),
      scope: z.enum(['person', 'agent_person', 'agent_place']).describe('The item\'s scope'),
    },
  },
  {
    name: 'recall',
    description:
      'Look up what has been remembered: by key, for one item you were told of, or by query — a few words of what ' +
      'you need — for the items nearest in meaning. Each comes with its key and scope; what did not fit is named in cut.',
    schema: {
      key: z.string().min(1).optional().describe('One item\'s key'),
      query: z.string().min(1).max(500).optional().describe('What you are looking for, in a few words'),
    },
  },
]

/** All control-plane registry operations (operations.ts) — what dataApi.ts
 *  validates incoming args against before dispatch. */
export const ALL_CONTROL_PLANE_TOOLS: ControlPlaneTool[] = [
  ...CONTROL_PLANE_TOOLS, ...WORKFORCE_TOOLS, ...DATA_PATH_ONLY_TOOLS,
  // Data-path-only too, built from core's declarations as the site's copy is (workflows/agentToolsSchemas.ts).
  ...WORKFLOW_TOOL_SCHEMAS,
  // Data-path-only too: a run's site forwards them with the calling run's id (knowledgeToolSchemas.ts).
  ...KNOWLEDGE_DATA_PATH_TOOLS,
  // Data-path-only too: a run's site forwards it with the calling run's id (assets/proposals/tool.ts).
  PROPOSE_SKILL_SCHEMA,
  // Data-path-only too: a run's site forwards them with the calling run's id; only a run on a branch has them.
  ...CODE_WORK_TOOL_SCHEMAS,
  // Data-path-only too: only a run on a branch with a live preview has them (appToolSchemas.ts).
  ...APP_TOOL_SCHEMAS,
]

export { COMMIT_TOOL_SCHEMA, MERGE_TOOL_SCHEMA, UPDATE_TOOL_SCHEMA } from './codeWorkToolSchemas'

/** The knowledge tools as an agent sees them, and `suggest_place`, the lead's alone (knowledgeToolSchemas.ts). */
export { KNOWLEDGE_TOOLS, PLACE_TOOLS } from './knowledgeToolSchemas'

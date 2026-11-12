/**
 * Zod schemas for the MCP tools site forwards to hq's `/api/v1/data` (plan
 * 5d-2 task 8). Site holds no control-plane data itself (SC-338) — every one
 * of these tools becomes a thin `callHqData(name, args, capabilityJwt)`
 * forward, dispatched by hq's own registry (`hq/src/server/controlplane/operations.ts`)
 * 1:1 by tool name. hq's `dataApi.ts` re-validates every call against its own
 * canonical schemas (`hq/src/server/controlplane/toolSchemas.ts`) before
 * dispatch, so a mismatch here is a usability gap (Claude sees the wrong
 * argument hints), never a security hole.
 *
 * DELIBERATE DUPLICATION, not a shared module: this is structurally the same
 * table as hq's `toolSchemas.ts`'s `CONTROL_PLANE_TOOLS` + `WORKFORCE_TOOLS`.
 * Moving the canonical table into `@agenthix/core` so both sides import one
 * copy would remove this drift risk, but touches hq's control-plane module
 * beyond the two registry-op edits this task calls for — left as a follow-up,
 * flagged in this task's report rather than done unasked. Keep this table in
 * sync with hq's `toolSchemas.ts` by hand until that consolidation lands.
 */
import { z, type ZodRawShape } from 'zod'
import { FORWARDED_PLANNING_TOOLS } from './forwardedPlanningSchemas'
import { FORWARDED_TASK_TOOLS } from './forwardedTaskSchemas'
import { FORWARDED_WORKFLOW_TOOLS } from './forwardedWorkflowSchemas'
import { FORWARDED_SKILL_TOOLS } from './forwardedSkillSchemas'
import { FORWARDED_KNOWLEDGE_TOOLS } from './forwardedKnowledgeSchemas'
import { FORWARDED_CODE_TOOLS } from './forwardedCodeSchemas'
import { FORWARDED_APP_TOOLS } from './forwardedAppSchemas'

export interface ForwardedTool {
  name: string
  description?: string
  schema: ZodRawShape
  /** The tool's `runId` is the calling run's, filled in by the site: the agent is not shown it and cannot name another. */
  runIdFromCaller?: true
  /** hq answers the tool's text, as the native Grep and Read do: the agent is given it as it is, not as JSON. */
  textResult?: true
}

export const FORWARDED_TOOLS: ForwardedTool[] = [
  // ── Org ─────────────────────────────────────────────────────────────────
  { name: 'get_org', schema: {} },
  {
    name: 'update_org',
    schema: { name: z.string().optional(), vision: z.string().optional(), mission: z.string().optional() },
  },
  { name: 'list_agents', schema: {} },
  { name: 'list_teams', schema: { includeDisabled: z.boolean().optional() } },
  { name: 'list_projects', schema: {} },
  {
    name: 'fetch_my_queued_tasks',
    schema: { agentId: z.string().describe('The agent ID to fetch queued tasks for') },
  },
  {
    name: 'get_task_details',
    description:
      "Get a task's details, its comments and its attachments. Each attachment has a reference " +
      '(attachments/WAL-2/notes.md): to show a person the file, write that reference in your reply, as it is.',
    schema: { taskId: z.string().describe('The task ID to retrieve') },
  },
  { name: 'archive_task', schema: { taskId: z.string().describe('The task ID to archive') } },
  { name: 'delete_task', schema: { taskId: z.string().describe('The task ID to permanently delete') } },
  {
    name: 'tick_subtask',
    schema: {
      taskId: z.string().describe('The task ID containing the subtask'),
      subtaskTitle: z.string().describe('Exact title of the subtask to update'),
      done: z.boolean().describe('Whether the subtask is complete'),
    },
  },
  {
    name: 'set_task_schedule',
    description:
      'Set or clear the time a task starts, once: at that time it starts as if a person pressed Run, joining its ' +
      'agent\'s line. Setting a time starts nothing now. Only when the person you are working for asked you to: ' +
      'refused in a run no person started (a routine\'s scheduled run, a start time\'s, or one an agent started), ' +
      'through a connection without its Start work permission, unless the project lets agents set schedules, and for ' +
      'an epic, which is never run. For work that repeats, create a routine instead. Times are read in the timezone of ' +
      'the person you are working for unless you name a `timezone`; the result says which was used.',
    schema: {
      taskId: z.string().describe('The task to schedule'),
      at: z.string().optional().describe(
        'ISO 8601 time the task starts. With no offset (2026-10-05T09:00) it is the wall-clock time in `timezone`, which is the person you are working for\'s own timezone unless you name one; with an offset, that offset is used.',
      ),
      timezone: z.string().optional().describe('IANA timezone an offset-less `at` is read in, e.g. Australia/Sydney. Omit it to use the person you are working for\'s (UTC only if they have none).'),
      clear: z.boolean().optional().describe('true removes the task\'s start time'),
    },
  },
  {
    name: 'attach_file',
    description:
      'Attach a file to a task. Answers with its reference (attachments/WAL-2/notes.md): to show a person the file, ' +
      'write that reference in your reply, as it is.',
    schema: {
      agentId: z.string().optional().describe('Deprecated — no longer used'),
      taskId: z.string().describe('The task to attach the file to'),
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
    name: 'generate_agent_picture',
    description:
      "Make an agent's avatar or cover. Without a recipe it draws a fresh random one; with one — " +
      '{ v: 1, kind, style, styleVersion, choices }, as an agent\'s picture recipe is stored — it checks it and draws ' +
      'that. Answers with the new picture\'s url and the recipe it was drawn from.',
    schema: {
      agentId: z.string().describe('ID of the agent whose picture to make'),
      imageType: z.enum(['avatar', 'cover']).describe('Which picture to make'),
      recipe: z.record(z.string(), z.unknown()).optional().describe('The picture recipe to draw; leave it out for a random one'),
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
  ...FORWARDED_PLANNING_TOOLS,
  // The task, board and sprint tools: built from core's declarations, as hq's copy is.
  ...FORWARDED_TASK_TOOLS,
  // Workflows (adr-0148): built from core's declarations, as hq's copy is.
  ...FORWARDED_WORKFLOW_TOOLS,
  ...FORWARDED_SKILL_TOOLS,
  ...FORWARDED_KNOWLEDGE_TOOLS,
  ...FORWARDED_CODE_TOOLS,
  ...FORWARDED_APP_TOOLS,
  {
    name: 'add_comment',
    schema: {
      taskId: z.string().describe('The task ID to comment on'),
      agentId: z.string().describe('The agent ID posting this comment'),
      runId: z.string().optional().describe('The run ID this comment belongs to (optional)'),
      content: z.string().describe('Comment text — progress update or result summary'),
    },
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
        'ID of the calling agent. Only honoured for static-key (operator) callers — a claims-bearing ' +
        'caller is always pinned to its own agent identity, regardless of what is passed here.',
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
      name: z.string().describe('Display name'),
      slug: z.string().describe('Unique URL-safe identifier (lowercase, hyphens)'),
      description: z.string().optional().describe('Short description'),
      vision: z.string().optional().describe('Product vision statement'),
    },
  },
  {
    name: 'update_product',
    description: 'Update a product\'s name, slug, description, vision, or status.',
    schema: {
      productId: z.string().describe('ID of the product to update'),
      name: z.string().optional(),
      slug: z.string().optional(),
      description: z.string().nullable().optional(),
      vision: z.string().nullable().optional(),
      status: z.enum(['active', 'sunset']).optional(),
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

  // ── Workforce ───────────────────────────────────────────────────────────
  { name: 'list_workforce_templates', schema: {} },
  {
    name: 'propose_workforce_template',
    schema: {
      templateId: z.string().describe('Workforce template to propose: the id list_workforce_templates gives (e.g. "agenthix/dev-team")'),
      reason: z.string().describe('Why you are proposing this template — shown to the user on the review page'),
    },
  },

  // ── The run's result (workers and results spec, Results) ───────────────
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
    runIdFromCaller: true,
  },
  // ── Memory (memory and knowledge spec) ──────────────────────────────────
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
      title: z.string().min(1).max(120).describe('A short title naming the subject'),
      body: z.string().min(1).max(1500).describe('What you learned, readable on its own'),
      kind: z.enum(['fact', 'preference', 'decision', 'feedback', 'project']).describe('What sort of thing it is'),
      tags: z.array(z.string()).max(8).optional().describe('A few words to group it by'),
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

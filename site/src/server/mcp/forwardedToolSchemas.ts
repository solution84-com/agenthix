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
import type { ToolArea } from '@agenthix/core'
import { FORWARDED_PLANNING_TOOLS } from './forwardedPlanningSchemas'
import { FORWARDED_TASK_TOOLS } from './forwardedTaskSchemas'
import { FORWARDED_WORKFLOW_TOOLS } from './forwardedWorkflowSchemas'
import { FORWARDED_SKILL_TOOLS } from './forwardedSkillSchemas'
import { FORWARDED_KNOWLEDGE_TOOLS } from './forwardedKnowledgeSchemas'
import { FORWARDED_CODE_TOOLS } from './forwardedCodeSchemas'
import { FORWARDED_APP_TOOLS } from './forwardedAppSchemas'

export interface ForwardedTool {
  name: string
  /** What the tool is about, for the tool search; never sent to the model as part of the tool. */
  area: ToolArea
  description?: string
  schema: ZodRawShape
  /** The tool's `runId` is the calling run's, filled in by the site: the agent is not shown it and cannot name another. */
  runIdFromCaller?: true
  /** hq answers the tool's text, as the native Grep and Read do: the agent is given it as it is, not as JSON. */
  textResult?: true
}

const TASK_KEY = 'Its key (e.g. WAL-2) or id'

export const FORWARDED_TOOLS: ForwardedTool[] = [
  // ── Org ─────────────────────────────────────────────────────────────────
  { name: 'get_org', area: 'organisation', schema: {} },
  {
    name: 'update_org',
    area: 'organisation',
    schema: {
      name: z.string().optional(),
      vision: z.string().optional(),
      mission: z.string().optional(),
    },
  },
  { name: 'list_agents', area: 'organisation', description: 'List the organisation\'s agents, with their ids.', schema: {} },
  {
    name: 'list_teams',
    area: 'organisation',
    schema: { includeDisabled: z.boolean().optional() },
  },
  { name: 'list_projects', area: 'organisation', schema: {} },
  {
    name: 'fetch_my_queued_tasks',
    area: 'tasks',
    schema: { agentId: z.string().describe('The agent ID to fetch queued tasks for') },
  },
  {
    name: 'get_task_details',
    area: 'tasks',
    description:
      'A task with its comments and attachments. Each attachment has a reference (attachments/WAL-2/notes.md) that ' +
      'shows the file when written in a reply as it is.',
    schema: { taskId: z.string().describe(TASK_KEY) },
  },
  {
    name: 'archive_task',
    area: 'tasks',
    schema: { taskId: z.string().describe(TASK_KEY) },
  },
  {
    name: 'delete_task',
    area: 'tasks',
    schema: { taskId: z.string().describe(TASK_KEY) },
  },
  {
    name: 'tick_subtask',
    area: 'tasks',
    schema: {
      taskId: z.string().describe(TASK_KEY),
      subtaskTitle: z.string().describe('Exact title of the subtask to update'),
      done: z.boolean().describe('Whether the subtask is complete'),
    },
  },
  {
    name: 'set_task_schedule',
    area: 'tasks',
    description:
      'Set or clear the one time a task starts: then it starts as if a person pressed Run, joining its agent\'s ' +
      'line; nothing starts now. A project can let agents set schedules without being asked. Refused for an epic. ' +
      'For work that repeats, use a routine.',
    schema: {
      taskId: z.string().describe(TASK_KEY),
      at: z.string().optional().describe('ISO 8601 time it starts. Without an offset (2026-10-05T09:00) it is read in timezone'),
      timezone: z.string().optional().describe('IANA timezone, e.g. Australia/Sydney. Default: the person\'s you work for, else UTC; the answer says which'),
      clear: z.boolean().optional().describe('true removes its start time'),
    },
  },
  {
    name: 'attach_file',
    area: 'tasks',
    description:
      'Attach a file to a task. Answers with its reference (attachments/WAL-2/notes.md), which shows the file when ' +
      'written in a reply as it is.',
    schema: {
      taskId: z.string().describe(TASK_KEY),
      name: z.string().describe('Its display name, e.g. "Auth design notes"'),
      filename: z.string().describe('Its file name, e.g. auth-design.md'),
      content: z.string().describe('The file\'s full content'),
      label: z.string().optional().describe('A label, e.g. draft'),
    },
  },
  {
    name: 'create_agent',
    area: 'organisation',
    schema: {
      name: z.string().describe('Its display name'),
      role: z.string().describe('Its role'),
      responsibilities: z.string().describe('What it is responsible for'),
      handle: z.string().optional().describe('A unique handle, made from the name when left out'),
      createdBy: z.string().optional().describe('Who made it, by id'),
    },
  },
  {
    name: 'generate_agent_picture',
    area: 'organisation',
    description:
      "Draw an agent's avatar or cover: a random one, or the recipe given ({ v: 1, kind, style, styleVersion, " +
      'choices }, as a picture recipe is stored). Answers the picture\'s url and its recipe.',
    schema: {
      agentId: z.string().describe('The agent, by id'),
      imageType: z.enum(['avatar', 'cover']).describe('Which picture'),
      recipe: z.record(z.string(), z.unknown()).optional().describe('The recipe to draw; leave it out for a random one'),
    },
  },
  {
    name: 'create_team',
    area: 'organisation',
    schema: {
      name: z.string().describe('Its name'),
      purpose: z.string().describe('Its purpose'),
      agentIds: z.array(z.string()).describe('Its agents, by id'),
      createdBy: z.string().optional().describe('Who made it, by id'),
    },
  },
  {
    name: 'create_project',
    area: 'organisation',
    schema: {
      name: z.string().describe('Its name'),
      description: z.string().optional().describe('What it is'),
      defaultAgentId: z.string().optional().describe('The agent its tasks get by default, by id'),
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
    area: 'tasks',
    description: 'Comment on a task, for the people and agents working on it.',
    schema: {
      taskId: z.string().describe(TASK_KEY),
      runId: z.string().optional().describe('The run it belongs to'),
      content: z.string().describe('The comment'),
    },
  },

  // ── Run visibility (person-scoped execution spec §3, ADR-0077) ────────────
  {
    name: 'list_active_runs',
    area: 'run',
    description:
      'What is running now in your own boundary (this project, or your own storage), to check before starting work ' +
      'that might collide: each run\'s agent, who started it, where and since when. Never what a run says.',
    schema: {},
  },

  // ── Product ─────────────────────────────────────────────────────────────
  {
    name: 'list_products',
    area: 'organisation',
    description: 'The organisation\'s products, with their ids.',
    schema: {},
  },
  {
    name: 'get_product',
    area: 'organisation',
    description: 'A product, with its projects and members.',
    schema: { productId: z.string().describe('The product, by id') },
  },
  {
    name: 'create_product',
    area: 'organisation',
    description: 'Create a product. Its slug is unique: lowercase letters and hyphens.',
    schema: {
      name:        z.string().describe('Its name'),
      slug:        z.string().describe('Its unique slug, e.g. web-shop'),
      description: z.string().optional().describe('What it is'),
      vision:      z.string().optional().describe('Its vision'),
    },
  },
  {
    name: 'update_product',
    area: 'organisation',
    description: 'Change a product\'s name, slug, description, vision or status.',
    schema: {
      productId:   z.string().describe('The product, by id'),
      name:        z.string().optional(),
      slug:        z.string().optional(),
      description: z.string().nullable().optional(),
      vision:      z.string().nullable().optional(),
      status:      z.enum(['active', 'sunset']).optional(),
    },
  },
  {
    name: 'delete_product',
    area: 'organisation',
    description: 'Delete a product for good. Its projects stay, in no product.',
    schema: { productId: z.string().describe('The product, by id') },
  },
  {
    name: 'get_github_config',
    area: 'organisation',
    description: 'Whether the site\'s GitHub App is set up: { configured, slug }.',
    schema: {},
  },

  // ── Workforce ───────────────────────────────────────────────────────────
  { name: 'list_workforce_templates', area: 'organisation', schema: {} },
  {
    name: 'propose_workforce_template',
    area: 'organisation',
    schema: {
      templateId: z.string().describe('The template, by the id list_workforce_templates gives (e.g. "agenthix/dev-team")'),
      reason: z.string().describe('Why, for the person who reviews it'),
    },
  },

  // ── The run's result (workers and results spec, Results) ───────────────
  {
    name: 'set_result',
    area: 'run',
    description:
      'State what this run achieved, at its end, in a few sentences a person takes in at a glance. It is recorded on ' +
      'the run and its task; a later call replaces it.',
    schema: {
      result: z.string().min(1).max(4000).describe('What this run achieved, in plain words'),
      runId: z.string().optional().describe('Filled in by the site with the run this is called from; leave it out'),
    },
    runIdFromCaller: true,
  },
  // ── Memory (memory and knowledge spec) ──────────────────────────────────
  {
    name: 'remember',
    area: 'memory',
    description:
      'Remember one thing about the person you work for, to be recalled later by meaning. It must stand alone: a ' +
      'title naming its subject and a body that makes sense months from now, not a document. A "rule" is how they ' +
      'want things done, and says when it applies; anything else is a "fact". What is true of a place belongs in its ' +
      'Knowledge. Writing to a key, or an item very like one held, updates it.',
    schema: {
      title: z.string().min(1).max(120).describe('A short title naming the subject'),
      body: z.string().min(1).max(1500).describe('What you learned, readable on its own'),
      kind: z.enum(['fact', 'rule']).optional().describe('"rule" or "fact" (the default)'),
      tags: z.array(z.string()).max(8).optional().describe('A few words to group it by'),
      key: z.string().max(64).optional().describe('The key of an item to replace'),
      requested: z.boolean().optional().describe('true only when the person asked you to remember it, or corrected you; not for something said in passing'),
    },
  },
  {
    name: 'forget',
    area: 'memory',
    description: 'Forget one remembered item that is no longer true, by its key as recall shows it.',
    schema: {
      key: z.string().min(1).describe('The item\'s key'),
    },
  },
  {
    name: 'recall',
    area: 'memory',
    description:
      'Look up what is remembered about the person you work for: by key; by query, for the items nearest in meaning; ' +
      'or by kind and tags alone, which also narrow a query. Each item comes with its key and kind; what did not fit ' +
      'is named in cut.',
    schema: {
      key: z.string().min(1).optional().describe('One item\'s key'),
      query: z.string().min(1).max(500).optional().describe('What you are looking for, in a few words'),
      kind: z.enum(['fact', 'rule']).optional().describe('Only items of this kind'),
      tags: z.array(z.string().min(1)).max(8).optional().describe('Only items carrying any of these tags'),
    },
  },
]

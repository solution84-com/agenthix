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
import type { ToolArea } from '@agenthix/core'
import { CODE_WORK_TOOL_SCHEMAS } from './codeWorkToolSchemas'
import { APP_TOOL_SCHEMAS } from './appToolSchemas'
import { PLANNING_TOOLS } from './planningToolSchemas'
import { TASK_TOOLS } from './taskToolSchemas'
import { KNOWLEDGE_DATA_PATH_TOOLS } from './knowledgeToolSchemas'
import { WORKFLOW_TOOL_SCHEMAS } from '../../workflows/agentToolsSchemas'
import { PROPOSE_SKILL_SCHEMA } from '../../assets/proposals/tool'
import { MEMORY_BODY_MAX_CHARS, MEMORY_MAX_TAGS, MEMORY_TITLE_MAX_CHARS } from '../../shared/memory/protocol'

export interface ControlPlaneTool {
  name: string
  /** What the tool is about, for the tool search; never sent to the model as part of the tool. */
  area: ToolArea
  description?: string
  schema: ZodRawShape
}

const TASK_KEY = 'Its key (e.g. WAL-2) or id'

export const CONTROL_PLANE_TOOLS: ControlPlaneTool[] = [
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
  ...PLANNING_TOOLS,
  // The task, board and sprint tools, built from core's declarations as the site's copy is (taskToolSchemas.ts).
  ...TASK_TOOLS,
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
]

// ── Workforce ─────────────────────────────────────────────────────────────
// Registered by workforceTools.ts, not mcpServer.ts's generic loop — kept as
// a separate array so mcpServer.ts's loop and workforceTools.ts's loop never
// both register the same tool name. ALL_CONTROL_PLANE_TOOLS below is what
// dataApi.ts validates against, so these still get boundary validation on
// the HTTP path exactly like every other registry operation.
export const WORKFORCE_TOOLS: ControlPlaneTool[] = [
  { name: 'list_workforce_templates', area: 'organisation', schema: {} },
  {
    name: 'propose_workforce_template',
    area: 'organisation',
    schema: {
      templateId: z.string().describe('The template, by the id list_workforce_templates gives (e.g. "agenthix/dev-team")'),
      reason: z.string().describe('Why, for the person who reviews it'),
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
    area: 'run',
    description:
      'State what this run achieved, at its end, in a few sentences a person takes in at a glance. It is recorded on ' +
      'the run and its task; a later call replaces it.',
    schema: {
      result: z.string().min(1).max(4000).describe('What this run achieved, in plain words'),
      runId: z.string().optional().describe('Filled in by the site with the run this is called from; leave it out'),
    },
  },
  {
    name: 'remember',
    area: 'memory',
    description:
      'Remember one thing about the person you work for, to be recalled later by meaning. It must stand alone: a ' +
      'title naming its subject and a body that makes sense months from now, not a document. A "rule" is how they ' +
      'want things done, and says when it applies; anything else is a "fact". What is true of a place belongs in its ' +
      'Knowledge. Writing to a key, or an item very like one held, updates it.',
    schema: {
      title: z.string().min(1).max(MEMORY_TITLE_MAX_CHARS).describe('A short title naming the subject'),
      body: z.string().min(1).max(MEMORY_BODY_MAX_CHARS).describe('What you learned, readable on its own'),
      kind: z.enum(['fact', 'rule']).optional().describe('"rule" or "fact" (the default)'),
      tags: z.array(z.string()).max(MEMORY_MAX_TAGS).optional().describe('A few words to group it by'),
      key: z.string().max(64).optional().describe('The key of an item to replace'),
      requested: z.boolean().optional().describe('true when the person asked you to remember it, or corrected you'),
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
      tags: z.array(z.string().min(1)).max(MEMORY_MAX_TAGS).optional().describe('Only items carrying any of these tags'),
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

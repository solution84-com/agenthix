/**
 * The lean task editors a conversation is offered in place of the control plane's update_task (lean agent context
 * spec, §2): `update_task` with the fields a conversation changes, and `plan_task` with the planning ones. Both run
 * the control plane's update_task, through the tool adapter's one path, so its permission, its Ask, its operation
 * row and its action line are update_task's. A run and hq's MCP server keep the full editor.
 *
 * Each field is picked from the control plane's own schema, built from core's declarations: its words are said there.
 */
import type { ZodRawShape } from 'zod'
import { CONTROL_PLANE_TOOLS } from '../../server/controlplane/toolSchemas'
import type { ToolArea } from '../contract'

export interface LeanTool {
  name: string
  /** The control-plane tool a call runs, and whose permission it takes. */
  runs: string
  area: ToolArea
  description: string
  schema: ZodRawShape
}

const UPDATE_TASK = 'update_task'

export const LEAN_UPDATE_FIELDS = ['taskId', 'title', 'description', 'state', 'columnId', 'assignedAgentId', 'archived'] as const
export const PLAN_FIELDS = [
  'taskId', 'typeId', 'priority', 'labels', 'planStart', 'planFinish', 'milestoneId', 'fieldValues',
  'epicId', 'sprintId', 'afterTaskId', 'beforeTaskId', 'workspaceId', 'modelChoice',
] as const

/** The fields named, as the control-plane tool declares them; a field it does not declare is left out. */
export function picked(tool: string, fields: readonly string[]): ZodRawShape {
  const schema = CONTROL_PLANE_TOOLS.find(t => t.name === tool)?.schema ?? {}
  return Object.fromEntries(fields.filter(f => f in schema).map(f => [f, schema[f]!]))
}

export const LEAN_TOOLS: readonly LeanTool[] = [
  {
    name: UPDATE_TASK,
    runs: UPDATE_TASK,
    area: 'tasks',
    description: 'Change one task: its title, description, state or column, or agent, or archive it. Moving or assigning starts nothing.',
    schema: picked(UPDATE_TASK, LEAN_UPDATE_FIELDS),
  },
  {
    name: 'plan_task',
    runs: UPDATE_TASK,
    area: 'planning',
    description:
      'Plan one task: its type, priority, labels, plan dates, milestone, custom fields, epic, sprint or place in the ' +
      "project's order; or the workspace it works in, or the model its runs use. Starts nothing.",
    schema: picked(UPDATE_TASK, PLAN_FIELDS),
  },
]

export function leanTool(name: string): LeanTool | null {
  return LEAN_TOOLS.find(t => t.name === name) ?? null
}

/** The lean tools offered in place of a control-plane tool; none when it has none. */
export function leanToolsFor(controlPlaneTool: string): LeanTool[] {
  return LEAN_TOOLS.filter(t => t.runs === controlPlaneTool)
}

/**
 * The agent's code-work tools (`commit`, `merge_into_main`, `update_from_main`), built from core's declarations as the site's copies are
 * to be. Data-path only: a run's site forwards them with the calling run's id, and only a run on a code workspace's
 * branch is answered (`branches/agentTools.ts`).
 */
import { z } from 'zod'
import { COMMIT_TOOL_DECLARATION, MERGE_TOOL_DECLARATION, UPDATE_TOOL_DECLARATION } from '@agenthix/core'
import type { ControlPlaneTool } from './toolSchemas'

const RUN_ID = z.string().optional().describe('Filled in by the site with the run this is called from; leave it out')

export const COMMIT_TOOL_SCHEMA: ControlPlaneTool = {
  name: COMMIT_TOOL_DECLARATION.name,
  area: COMMIT_TOOL_DECLARATION.area,
  description: COMMIT_TOOL_DECLARATION.description,
  schema: {
    message: z.string().trim().min(1).max(COMMIT_TOOL_DECLARATION.args.message.maxLength)
      .describe(COMMIT_TOOL_DECLARATION.args.message.description),
    runId: RUN_ID,
  },
}

export const MERGE_TOOL_SCHEMA: ControlPlaneTool = {
  name: MERGE_TOOL_DECLARATION.name,
  area: MERGE_TOOL_DECLARATION.area,
  description: MERGE_TOOL_DECLARATION.description,
  schema: {
    summary: z.string().trim().max(MERGE_TOOL_DECLARATION.args.summary.maxLength).optional()
      .describe(MERGE_TOOL_DECLARATION.args.summary.description),
    runId: RUN_ID,
  },
}

export const UPDATE_TOOL_SCHEMA: ControlPlaneTool = {
  name: UPDATE_TOOL_DECLARATION.name,
  area: UPDATE_TOOL_DECLARATION.area,
  description: UPDATE_TOOL_DECLARATION.description,
  schema: { runId: RUN_ID },
}

export const CODE_WORK_TOOL_SCHEMAS: ControlPlaneTool[] = [COMMIT_TOOL_SCHEMA, MERGE_TOOL_SCHEMA, UPDATE_TOOL_SCHEMA]

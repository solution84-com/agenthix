/**
 * The tool shapes for a sprint board's sprints and a project's milestones
 * (adr-0097, adr-0098), split from toolSchemas.ts on the file-size rule and
 * spread into its CONTROL_PLANE_TOOLS. The site keeps its copy in
 * forwardedPlanningSchemas.ts, held to this one by its drift test.
 */
import { z } from 'zod'
import type { ControlPlaneTool } from './toolSchemas'

export const PLANNING_TOOLS: ControlPlaneTool[] = [
  {
    name: 'finish_sprint',
    description:
      "Finish a sprint board's current sprint. Its done tasks stay recorded in it and the next sprint starts with " +
      'the same length. You must say where its unfinished tasks go — "next" (the next sprint) or "backlog" (the ' +
      "board's Backlog, where nothing starts them); there is no default. Ask the person you are working for if they have not said.",
    schema: {
      boardId: z.string().describe('The sprint board'),
      unfinished: z.enum(['next', 'backlog']).describe('Where the unfinished tasks go: the next sprint, or the Backlog'),
    },
  },
  {
    name: 'rename_sprint',
    description: 'Rename a sprint. Its number stays: "Sprint 12 · Pricing push".',
    schema: {
      sprintId: z.string().describe('The sprint to rename'),
      name: z.string().nullable().describe('Its new name, or null for none'),
    },
  },
  {
    name: 'list_milestones',
    description: "A project's milestones — dated goals — each with the epics that belong to it.",
    schema: { projectId: z.string().describe('The project') },
  },
  {
    name: 'create_milestone',
    description: 'Add a milestone: a dated goal in a project that epics can belong to (set an epic\'s with update_task).',
    schema: {
      projectId: z.string().describe('The project'),
      name: z.string().describe('What it is, e.g. "Self-serve pricing live"'),
      date: z.string().describe('Its date, YYYY-MM-DD'),
    },
  },
  {
    name: 'update_milestone',
    description: "Rename a milestone or move its date.",
    schema: {
      milestoneId: z.string().describe('The milestone'),
      name: z.string().optional(),
      date: z.string().optional().describe('YYYY-MM-DD'),
    },
  },
  {
    name: 'delete_milestone',
    description: 'Delete a milestone. Its epics stay, belonging to no milestone.',
    schema: { milestoneId: z.string().describe('The milestone') },
  },
]

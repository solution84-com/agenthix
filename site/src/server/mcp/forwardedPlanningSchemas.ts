/**
 * The forwarded tools for a project's milestones (adr-0098), split from
 * forwardedToolSchemas.ts on the file-size rule and spread into its
 * FORWARDED_TOOLS. hq's canonical copy is its `planningToolSchemas.ts`; the
 * drift test holds the two together. The sprint tools are built from core
 * (forwardedTaskSchemas.ts).
 */
import { z } from 'zod'
import type { ForwardedTool } from './forwardedToolSchemas'

export const FORWARDED_PLANNING_TOOLS: ForwardedTool[] = [
  {
    name: 'list_milestones',
    area: 'planning',
    description: "A project's milestones (dated goals), each with its epics.",
    schema: { projectId: z.string().describe("The project's key (e.g. WAL) or id") },
  },
  {
    name: 'create_milestone',
    area: 'planning',
    description: 'Add a milestone: a dated goal of a project that epics belong to (set an epic\'s with update_task).',
    schema: {
      projectId: z.string().describe("The project's key (e.g. WAL) or id"),
      name: z.string().describe('What it is, e.g. "Self-serve pricing live"'),
      date: z.string().describe('Its date, YYYY-MM-DD'),
    },
  },
  {
    name: 'update_milestone',
    area: 'planning',
    description: "Rename a milestone or move its date.",
    schema: {
      milestoneId: z.string().describe('The milestone'),
      name: z.string().optional(),
      date: z.string().optional().describe('YYYY-MM-DD'),
    },
  },
  {
    name: 'delete_milestone',
    area: 'planning',
    description: 'Delete a milestone. Its epics stay, belonging to no milestone.',
    schema: { milestoneId: z.string().describe('The milestone') },
  },
]

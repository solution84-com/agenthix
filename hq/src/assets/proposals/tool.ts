/**
 * `propose_skill`'s schema on hq's data path (spec part 5 *Proposing*), built from core's `PROPOSE_SKILL_DECLARATION`,
 * which the site's forwarded copy is built from too, so the two can't drift. `aim` is text in the declaration and one
 * of the aims here.
 */
import { z, type ZodRawShape } from 'zod'
import { PROPOSE_SKILL_DECLARATION, type ToolArea } from '@agenthix/core'
import { AIMS, PROPOSE_SKILL_TOOL } from './types'

const args = PROPOSE_SKILL_DECLARATION.args

export const PROPOSE_SKILL_SCHEMA: { name: string; area: ToolArea; description: string; schema: ZodRawShape } = {
  name: PROPOSE_SKILL_TOOL,
  area: PROPOSE_SKILL_DECLARATION.area,
  description: PROPOSE_SKILL_DECLARATION.description,
  schema: {
    name: z.string().max(args.name!.maxLength!).describe(args.name!.description),
    description: z.string().max(args.description!.maxLength!).describe(args.description!.description),
    files: z.record(z.string(), z.string()).describe(args.files!.description),
    why: z.string().max(args.why!.maxLength!).describe(args.why!.description),
    aim: z.enum(AIMS).describe(args.aim!.description),
    edits: z.string().max(args.edits!.maxLength!).optional().describe(args.edits!.description),
    runId: z.string().optional().describe('Filled in by the site with the run this is called from; leave it out'),
  },
}

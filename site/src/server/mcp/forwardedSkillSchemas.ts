/**
 * `propose_skill` (skills spec part 5 *Proposing a skill*; adr-0159), built from core's `PROPOSE_SKILL_DECLARATION`,
 * which hq's copy is built from too. Spread into FORWARDED_TOOLS. It acts for the calling run, whose id the site fills
 * in; hq takes the person from that run, makes a draft or a proposal, and never a live skill.
 */
import { PROPOSE_SKILL_DECLARATION } from '@agenthix/core'
import { forwardedFromDeclaration } from './forwardedWorkflowSchemas'
import type { ForwardedTool } from './forwardedToolSchemas'

export const FORWARDED_SKILL_TOOLS: ForwardedTool[] = [forwardedFromDeclaration(PROPOSE_SKILL_DECLARATION)]

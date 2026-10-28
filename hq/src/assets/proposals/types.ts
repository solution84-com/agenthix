/**
 * `propose_skill`, the agent's only way to write a skill (spec part 5 *Proposing a skill*; adr-0159; security review
 * H5): the shapes it takes and answers, and the card it leaves in the conversation. Client-safe: no server imports,
 * so the card component reads the same shapes.
 */
import { MAX_SKILL_PROPOSALS_PER_RUN, PROPOSE_SKILL_AIMS, PROPOSE_SKILL_TOOL } from '@agenthix/core'
import type { ActionBody } from '../../shared/conversations/protocol'

export { PROPOSE_SKILL_TOOL }

/** Proposals and draft changes one run may make; more is an agent proposing in a loop. */
export const MAX_PROPOSALS_PER_RUN = MAX_SKILL_PROPOSALS_PER_RUN
/** A proposal's files together, and how many; it comes as one tool call's arguments. */
export const PROPOSAL_MAX_BYTES = 1024 * 1024
export const PROPOSAL_MAX_FILES = 50
/** Rejected proposals are removed this long after their review (RQ5). */
export const REJECTED_KEPT_DAYS = 90

export const AIMS = PROPOSE_SKILL_AIMS
export type AimArg = (typeof AIMS)[number]

/** The tool's arguments as the agent sends them. Who asked is never among them: it is the run's on-behalf-of person. */
export type ProposeSkillArgs = {
  name: string
  description: string
  /** Path → text, `SKILL.md` among them. */
  files: Record<string, string>
  why: string
  aim: AimArg
  /** The skill it changes: `publisher/name` in the Library, or its folder's name in a place. */
  edits?: string
}

export type ProposeSkillResult =
  | { landed: 'draft'; name: string; revision: number; warnings: string[]; note: string }
  | { landed: 'proposal'; name: string; proposal: string; reviewers: string; warnings: string[]; note: string }

/** The card's ACTION line: the target names a proposal, or the draft (`asset:<id>` or `place:<id>`) it changed. */
export const SKILL_PROPOSAL_TARGET = 'skill_proposal'
export const SKILL_DRAFT_TARGET = 'skill_draft'
/** The line written when a proposal is reviewed: what the agent is told on its next turn. */
export const SKILL_OUTCOME_TARGET = 'skill_proposal_outcome'

export type SkillCardRef =
  | { kind: 'proposal'; proposalId: string; name: string }
  | { kind: 'draft'; draft: { kind: 'asset' | 'place'; id: string }; name: string; revision: number }

export function skillCardOf(body: ActionBody): SkillCardRef | null {
  const t = body.target
  if (body.toolName !== PROPOSE_SKILL_TOOL || !t) return null
  if (t.kind === SKILL_PROPOSAL_TARGET) return { kind: 'proposal', proposalId: t.id, name: t.label }
  if (t.kind !== SKILL_DRAFT_TARGET) return null
  const [kind, id] = t.id.split(':')
  const revision = Number(t.params?.revision)
  if ((kind !== 'asset' && kind !== 'place') || !id || !Number.isSafeInteger(revision)) return null
  return { kind: 'draft', draft: { kind, id }, name: t.label, revision }
}

export function proposalCardBody(proposalId: string, name: string, edits: boolean): ActionBody {
  return {
    text: `${edits ? 'Proposed a change to the skill' : 'Proposed a skill'}: ${name}`,
    toolName: PROPOSE_SKILL_TOOL,
    target: { kind: SKILL_PROPOSAL_TARGET, id: proposalId, label: name },
  }
}

export function draftCardBody(draft: { kind: 'asset' | 'place'; id: string }, name: string, revision: number): ActionBody {
  return {
    text: `Drafted the skill: ${name}`,
    toolName: PROPOSE_SKILL_TOOL,
    target: { kind: SKILL_DRAFT_TARGET, id: `${draft.kind}:${draft.id}`, label: name, params: { revision: String(revision) } },
  }
}

export type OutcomeState = 'ACCEPTED' | 'ACCEPTED_WITH_CHANGES' | 'REJECTED'

export function outcomeBody(proposalId: string, name: string, state: OutcomeState, reviewer: string, note: string | null): ActionBody {
  const said = state === 'REJECTED'
    ? `Your proposed skill ${name} was not accepted by ${reviewer}${note ? `: "${note}"` : '.'}`
    : `Your proposed skill ${name} was accepted${state === 'ACCEPTED_WITH_CHANGES' ? ' with changes' : ''} by ${reviewer}.`
  return {
    text: said,
    toolName: PROPOSE_SKILL_TOOL,
    target: { kind: SKILL_OUTCOME_TARGET, id: proposalId, label: name, params: { state } },
  }
}

/** The outcome as the lead reads it on its next turn, so it doesn't propose the same skill again; null for any other line. */
export function outcomeForLead(body: ActionBody): string | null {
  if (body.toolName !== PROPOSE_SKILL_TOOL || body.target?.kind !== SKILL_OUTCOME_TARGET) return null
  const again = body.target.params?.state === 'REJECTED' ? ' Don\'t propose it again unless the person asks.' : ' Agents now use it there.'
  return `[${body.text}${again}]`
}

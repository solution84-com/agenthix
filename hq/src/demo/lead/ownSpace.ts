/**
 * The visitor's own space in a lead script's tool calls (live demo spec, *Getting in*: a visitor views the sample and
 * works in their own space). A visitor's space and its id exist only once they have entered, so a script names it as
 * `projectId: "personal"`, the word the lead's places use for a person's own space, and the agent speaking as
 * `assignedAgentId: "self"`. Before the turn's calls are made, both become ids; every other input is left as written.
 * A turn that acts for no one keeps the words, so hq's tool refuses the call as it would any unknown project.
 */
import type { DemoLeadToolCall } from '@agenthix/core'
import type { DemoTurn } from './steps'

export const OWN_SPACE = 'personal'
export const THIS_AGENT = 'self'

/** The person's space, ready for the agent to work in, by id. */
export type SpaceFor = (personId: string, agentId: string) => Promise<string>

const names = (call: DemoLeadToolCall, field: string, word: string) => call.input[field] === word

export async function inOwnSpace(
  calls: readonly DemoLeadToolCall[],
  turn: Pick<DemoTurn, 'personId' | 'agentId'>,
  spaceFor: SpaceFor,
): Promise<DemoLeadToolCall[]> {
  const { personId, agentId } = turn
  if (!personId || !agentId) return [...calls]
  let space: string | null = null
  const out: DemoLeadToolCall[] = []
  for (const call of calls) {
    const input = { ...call.input }
    if (names(call, 'projectId', OWN_SPACE)) input.projectId = space ??= await spaceFor(personId, agentId)
    if (names(call, 'assignedAgentId', THIS_AGENT)) input.assignedAgentId = agentId
    out.push({ toolName: call.toolName, input })
  }
  return out
}

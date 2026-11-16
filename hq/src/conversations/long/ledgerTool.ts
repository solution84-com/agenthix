/**
 * The lead's `ledger` tool (long conversations spec, The ledger): what it decides, what it takes on to do later,
 * and what the person asks it to keep go into the conversation's ledger, which survives every compaction. Marking an
 * entry done trims it to one line. It has no operation of its own: its answer is tied to the turn that asked.
 */
import { z } from 'zod'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from '../contract'
import { ENTRY_MAX_CHARS } from './ledgerHead'
import { ledger as defaultLedger, type Ledger } from './ledger'

export const LEDGER_TOOL = 'ledger'

const input = z.object({
  kind: z.enum(['decision', 'obligation', 'keep']).optional()
    .describe('decision: something settled, with its reason. obligation: something you said you would do later. keep: something the person asked you to keep'),
  text: z.string().min(1).max(ENTRY_MAX_CHARS).optional().describe('The entry in one or two sentences, with the names and numbers it needs'),
  done: z.string().min(1).optional().describe('The id of an entry that is now done (an obligation carried out), instead of a new entry'),
})

const DESCRIPTION = "Add an entry to this conversation's ledger, which survives folding; or pass `done` with an entry's id once it is carried out."

function usable(capability: TurnCapability): boolean {
  return capability.trigger !== 'REPORT' && capability.expiresAt > Date.now()
}

const done = (capability: TurnCapability, result: unknown): ToolCallOutcome => ({ status: 'done', operationId: capability.turnId, result })

export function createLedgerTool(ledger: Ledger = defaultLedger): ConversationTool {
  return {
    name: LEDGER_TOOL,
    area: 'conversation',
    input,
    async offered(capability) {
      return usable(capability)
    },
    async describe() {
      return DESCRIPTION
    },
    async run(capability, raw) {
      if (!usable(capability)) return { status: 'refused', reason: 'The ledger is not open to this reply' }
      const parsed = input.safeParse(raw ?? {})
      if (!parsed.success) return { status: 'refused', reason: `The arguments do not fit ledger: ${parsed.error.issues.map(i => i.message).join('; ')}` }
      const { kind, text, done: doneId } = parsed.data
      if (doneId) {
        const marked = await ledger.markDone(capability.conversationId, doneId)
        return marked ? done(capability, { done: doneId }) : { status: 'refused', reason: `There is no open ledger entry ${doneId}` }
      }
      if (!kind || !text) return { status: 'refused', reason: 'Give the entry\'s kind and text, or the id of an entry that is done' }
      const id = await ledger.add(capability.conversationId, { kind, text })
      return id ? done(capability, { kept: id }) : { status: 'refused', reason: 'This conversation is gone' }
    },
  }
}

export const ledgerTool = createLedgerTool()

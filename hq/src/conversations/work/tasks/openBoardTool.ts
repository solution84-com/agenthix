/**
 * open_board as a conversation's tool (spec B6, talking a board through with an agent): the lead shows the person a
 * board as a card in the conversation, which opens it in the project's Boards (toolLink.ts's `board` target; a
 * built-in board by its key, "state" or "execution"). It reads the board through get_board, under the same rules,
 * and changes nothing. Only a turn that answers a person has someone to show it to.
 */
import { z } from 'zod'
import { TASK_TOOL_DECLARATIONS } from '@agenthix/core'
import { callOperation } from '../../../server/controlplane/operations'
import { taskToolSchema } from '../../../server/controlplane/taskToolSchemas'
import { Logger } from '../../../server/utils/logger'
import { appendMessage } from '../../store/messages'
import { conversationEvents } from '../../coordinator/events'
import type { ActionBody } from '../../../shared/conversations/protocol'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from '../../contract'
import { refusedBy, taskToolRefusal } from './gate'

const logger = new Logger('ConversationBoards')

export const OPEN_BOARD = 'open_board'
/** It reads what get_board reads, so it is offered where get_board may be used. */
const READS_AS = 'get_board'

const declaration = TASK_TOOL_DECLARATIONS.find(d => d.name === OPEN_BOARD)!
const input = z.object(taskToolSchema(declaration).schema)

type BoardRead = { board: { boardId: string | null; name: string; kind: string; builtIn: boolean }; columns: Array<{ name: string; count: number }> }

export type OpenBoardDeps = {
  read(capability: TurnCapability, args: unknown): Promise<BoardRead>
  card(capability: TurnCapability, body: ActionBody): Promise<void>
}

function refusal(capability: TurnCapability): string | null {
  if (!capability.actingUserId) return `${OPEN_BOARD} shows a board to the person you talk with, and this turn answers no one`
  // Otherwise as get_board, which it reads through.
  const reason = taskToolRefusal(capability, READS_AS)
  return reason ? reason.split(READS_AS).join(OPEN_BOARD) : null
}

export function createOpenBoardTool(deps: OpenBoardDeps): ConversationTool {
  return {
    name: OPEN_BOARD,
    input,
    describe: async () => declaration.description,
    offered: async capability => refusal(capability) === null,
    async run(capability, raw): Promise<ToolCallOutcome> {
      const refused = refusal(capability)
      if (refused) return { status: 'refused', reason: refused }
      const parsed = input.safeParse(raw ?? {})
      if (!parsed.success) {
        return { status: 'refused', reason: `The arguments do not fit ${OPEN_BOARD}: ${parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}` }
      }
      try {
        const read = await deps.read(capability, parsed.data)
        const { board } = read
        const id = board.boardId ?? board.kind.toLowerCase()
        await deps.card(capability, { text: `The ${board.name} board`, toolName: OPEN_BOARD, target: { kind: 'board', id, label: board.name } })
        return {
          status: 'done', operationId: capability.turnId,
          result: {
            shown: true, board: board.name,
            columns: read.columns.map(c => ({ name: c.name, count: c.count })),
            note: `The person sees a card that opens the ${board.name} board. Do not show it again; talk it through.`,
          },
        }
      } catch (err) {
        return refusedBy(OPEN_BOARD, err, (message, e) => logger.error(message, e))
      }
    },
  }
}

export const openBoardTool = createOpenBoardTool({
  read: async (capability, args) => (await callOperation(READS_AS, { kind: 'turn', turn: capability }, args)) as BoardRead,
  async card(capability, body) {
    const { message } = await appendMessage({
      conversationId: capability.conversationId, role: 'PLATFORM', kind: 'ACTION', body, agentId: capability.agentId, turnId: capability.turnId,
    })
    conversationEvents.message(capability.conversationId, message)
  },
})

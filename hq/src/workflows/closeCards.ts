import { Logger } from '../server/utils/logger'

const logger = new Logger('WorkflowCards')

/**
 * Takes away the conversation cards of versions just decided or superseded. Loaded when needed: the conversation
 * coordinator imports this module's callers, and a static import would make a cycle. The decision is already made
 * when this runs, so a failure here is logged and never answered as an error; a card left behind is closed when
 * it is answered (review/cardAnswer.ts).
 */
export async function closeCardsOf(versionIds: string[]): Promise<void> {
  try {
    const [{ closeWorkflowCards }, { settleOperation }] = await Promise.all([
      import('./review/cardAnswer'),
      import('../conversations/coordinator/mailbox'),
    ])
    await closeWorkflowCards(versionIds, settleOperation)
  } catch (err) {
    logger.error('Could not close the cards of decided workflow versions', err)
  }
}

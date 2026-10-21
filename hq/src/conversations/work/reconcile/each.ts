import { SiteUnreachableError } from '../../../storage/workspaceStore'
import { Logger } from '../../../server/utils/logger'

const logger = new Logger('ConversationReconcile')

/**
 * Reconciles each operation in turn: one that cannot be is logged and the rest go on, except when the site went
 * away, which ends the sweep — it runs again when the site connects.
 */
export async function eachOperation<T extends { id: string }>(ops: T[], reconcile: (op: T) => Promise<unknown>): Promise<void> {
  for (const op of ops) {
    try {
      await reconcile(op)
    } catch (err) {
      if (err instanceof SiteUnreachableError) throw err
      logger.error(`could not reconcile operation ${op.id}`, err)
    }
  }
}

/** Long conversations (phase 4): the ledger and compaction in segments, wired for the coordinator. */
import { createModelAdapter } from '../model'
import { conversationEvents } from '../coordinator/events'
import { Logger } from '../../server/utils/logger'
import { createCompactor } from './compactor'
import { ledger } from './ledger'
import { createCompactAtStart } from './turnStart'
import { contextWindowOf } from './windows'

export { ledger } from './ledger'
export { contextWindowOf } from './windows'

const logger = new Logger('ConversationCompaction')

export const compactor = createCompactor({ model: createModelAdapter(), ledger, events: conversationEvents, contextWindowOf })
export const compactAtStart = createCompactAtStart(compactor, (message, err) => logger.error(message, err))

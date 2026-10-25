/**
 * hq's knowledge service (agent knowledge spec, part 3): one search across every level a caller holds, and a read or
 * change routed to the one level a page's name names, with the authority rules and the change record. Serving (the
 * tools for workers and the lead) calls only these.
 */
import { isOrgAdmin } from '../projects/membership'
import { Logger } from '../server/utils/logger'
import { recordKnowledgeChange } from './changeRecord'
import { guideSource } from './guideSource'
import { createKnowledgeService } from './service'
import { siteKnowledge } from './siteKnowledge'

export type { KnowledgeReach } from './reach'
export type { KnowledgeService, KnowledgeTool } from './service'

/** A search answers within this, whatever a site does; a level not in by then says so (S8). */
export const KNOWLEDGE_SEARCH_TIME_LIMIT_MS = 5_000

const logger = new Logger('Knowledge')

const service = createKnowledgeService({
  sites: siteKnowledge,
  guide: guideSource(),
  isOrgAdmin,
  recordChange: recordKnowledgeChange,
  searchTimeLimitMs: KNOWLEDGE_SEARCH_TIME_LIMIT_MS,
  log: { warn: (message, fields) => logger.warn(message, fields ?? {}) },
})

export const { searchKnowledge, readKnowledge, writeKnowledge, editKnowledge, deleteKnowledge } = service

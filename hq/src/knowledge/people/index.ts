/** hq's knowledge operations for people, over the real sites, access rules, change record and authors. */
import { Logger } from '../../server/utils/logger'
import { recordKnowledgeChange } from '../changeRecord'
import { siteKnowledge } from '../siteKnowledge'
import { openKnowledge } from './access'
import { changeAuthors } from './authors'
import type { PeopleKnowledgeDeps } from './deps'

const logger = new Logger('KnowledgeForPeople')

/** As long as an agent's search across levels waits (`KNOWLEDGE_SEARCH_TIME_LIMIT_MS`): a screen waits no longer. */
export const PEOPLE_SITE_TIME_LIMIT_MS = 5_000

export const peopleKnowledgeDeps: PeopleKnowledgeDeps = {
  sites: siteKnowledge,
  open: openKnowledge,
  recordChange: recordKnowledgeChange,
  authors: changeAuthors,
  siteTimeLimitMs: PEOPLE_SITE_TIME_LIMIT_MS,
  log: { warn: (message, fields) => logger.warn(message, fields ?? {}) },
}

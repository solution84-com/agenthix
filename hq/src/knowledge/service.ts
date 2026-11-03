/** The knowledge service over the deps it is given: the five tools, each taking the tool's raw input (S8: never throws). */
import type { KnowledgeDeps } from './deps'
import { KnowledgePages } from './pages'
import type { KnowledgeReach } from './reach'
import { ReadRecord } from './readRecord'
import { searchKnowledgeIn } from './search'
import { reachNow } from './standing'

export type KnowledgeTool = (reach: KnowledgeReach, params: unknown) => Promise<string>

export interface KnowledgeService {
  searchKnowledge: KnowledgeTool
  readKnowledge: KnowledgeTool
  writeKnowledge: KnowledgeTool
  editKnowledge: KnowledgeTool
  deleteKnowledge: KnowledgeTool
}

const FAILED = 'The knowledge tool could not finish. Try again; if it keeps failing, whoever runs this installation can find why in HQ\'s log. Nothing was changed.'

export function createKnowledgeService(deps: KnowledgeDeps, reads = new ReadRecord()): KnowledgeService {
  const pages = new KnowledgePages(deps, reads)
  const safe = (tool: string, call: KnowledgeTool): KnowledgeTool => async (reach, params) => {
    try {
      return await call(await reachNow(deps, reach), params)
    } catch (err) {
      deps.log.warn('knowledge tool failed', { tool, error: err instanceof Error ? err.name : 'unknown' })
      return FAILED
    }
  }
  return {
    searchKnowledge: safe('search_knowledge', (r, p) => searchKnowledgeIn(deps, r, p)),
    readKnowledge: safe('read_knowledge', (r, p) => pages.read(r, p)),
    writeKnowledge: safe('write_knowledge', (r, p) => pages.write(r, p)),
    editKnowledge: safe('edit_knowledge', (r, p) => pages.edit(r, p)),
    deleteKnowledge: safe('delete_knowledge', (r, p) => pages.delete(r, p)),
  }
}

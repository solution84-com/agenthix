/**
 * `SearchKnowledge`: a bounded excerpt of a place's `knowledge/` files, asked of the site that holds them.
 * Knowledge is never indexed or copied in hq (the site searches its own files), so a sleeping site makes the
 * place's knowledge unavailable while memory in hq still answers.
 *
 * **Nothing here checks who is asking** — like `readKnowledgeOnSite`, the caller has already decided that this
 * principal may reach this place's knowledge. An excerpt is not forwardable: the caller may quote it to the
 * person, never put it in a brief for a worker in another place.
 */
import { prisma } from 'wasp/server'
import { LOCATION_FILE_METHODS, type LocationSearchKnowledgeParams, type LocationSearchKnowledgeResult } from '@agenthix/core'
import { siteChannelRegistry } from '../../sites/channel'
import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'
import { resolveStorageSite } from '../../storage/storageSite'
import { translateFailure } from '../../storage/locationFileStore'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import type { SearchKnowledge } from '../contract'

async function placeName(place: Parameters<SearchKnowledge>[0]): Promise<string> {
  if (place.type === 'user') return 'Your space'
  const project = await prisma.project.findUnique({ where: { id: place.id }, select: { name: true } })
  return project?.name ?? 'This project'
}

export const searchKnowledge: SearchKnowledge = async (place, query, maxChars) => {
  const owner = { ownerType: place.type, ownerId: place.id }
  const unavailable = async () => ({
    excerpts: [],
    cut: [],
    unavailable: `${await placeName(place)}'s knowledge is unavailable from its site`,
  })
  const params: LocationSearchKnowledgeParams = { ...owner, query, maxChars }
  const method = LOCATION_FILE_METHODS.searchKnowledge
  try {
    const siteId = await resolveStorageSite(owner)
    let result: LocationSearchKnowledgeResult
    try {
      result = await siteChannelRegistry.request(siteId, method, params)
    } catch (err) {
      // A site that does not know the method yet: the place's knowledge is unavailable, not an error.
      if (err instanceof ChannelRequestFailed && err.code === 'unknown_method') return await unavailable()
      return await translateFailure(siteId, method, err)
    }
    return { excerpts: result.excerpts, cut: result.cut, unavailable: null }
  } catch (err) {
    if (err instanceof SiteUnreachableError) return unavailable()
    throw err
  }
}

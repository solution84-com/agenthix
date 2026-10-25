/**
 * What `location.readKnowledge` streams: a page out of an owner's `pages/`, or with `versionId` one of its kept
 * versions (a deleted page's included). The name is resolved inside its root by the file tools, which refuse `..`,
 * absolute names and links, and the file is then opened once, not following a link, and the descriptor confirmed to
 * be the entry that was resolved (`openResolved`). Reading is never refused for a page's problems.
 */
import { constants as fsConstants } from 'node:fs'
import { LocationFileError, type KnowledgeOwnerRef } from '@agenthix/core'
import { knowledgePagesDir, knowledgeVersionsDir } from '../storage/paths'
import { openResolved, type FileHandle } from '../../agents/runtime/containedFile'
import { guarded } from './changeMethods'
import { inside, rootExists } from './fileAccess'
import { nameForRefusal } from './owner'
import { VERSION_ID } from './versionStore'

export async function openKnowledgeForRead(
  method: string, owner: KnowledgeOwnerRef, relPath: string, versionId?: string,
): Promise<FileHandle> {
  const notFound = () => new LocationFileError('not_found', `${method} "${nameForRefusal(relPath)}"`)
  if (versionId !== undefined && !VERSION_ID.test(versionId)) throw notFound()
  const root = versionId === undefined ? knowledgePagesDir(owner) : knowledgeVersionsDir(owner)
  const name = versionId === undefined ? relPath : `${relPath}/${versionId}.md`
  return guarded(method, owner, relPath, async () => {
    if (!rootExists(root)) throw notFound()
    const realRoot = inside(root, '')
    const realTarget = inside(root, name)
    try {
      return await openResolved({ realRoot, realTarget }, fsConstants.O_RDONLY, 'outside the knowledge pages')
    } catch (err) {
      const errno = (err as NodeJS.ErrnoException).code
      if (errno === 'ENOENT') throw notFound()
      if (errno === 'ENOTDIR') throw new LocationFileError('not_a_file', `${method} "${nameForRefusal(relPath)}"`)
      if (errno === undefined) throw new LocationFileError('outside', `${method} "${nameForRefusal(relPath)}"`)
      throw err
    }
  })
}

/**
 * Opening every file embedded on a screen in one request (spec part 2, *Embedded files*): each file goes through the
 * one open (`openFile`), so each is checked, recorded and signed exactly as a file opened on its own. One file that
 * can't be opened answers its own state and never fails the others.
 */
import { HttpError } from 'wasp/server'
import { KNOWLEDGE_ORG_OWNER_ID, isSiteFileRef, readFileRef, type FileOpenAnswer, type SiteFileRef } from '@agenthix/core'

/** As many embeds as a long page shows at once; a screen with more asks again as they scroll into view. */
export const MAX_FILES_PER_OPEN = 50
/** Each open asks a site about its file; a few at a time keeps one page from crowding a site's channel. */
const AT_ONCE = 6

const NOT_A_FILE = "That isn't a file HQ can open: it names no file in a place, an artefact or a knowledge page. Nothing was changed."

/** The organisation's knowledge has one owner, which a screen may name without an id. */
export function withOrgOwner(file: unknown): unknown {
  if (typeof file !== 'object' || file === null) return file
  const f = file as { space?: unknown; owner?: { ownerType?: unknown } }
  if (f.space !== 'knowledge' || f.owner?.ownerType !== 'org') return file
  return { ...f, owner: { ownerType: 'org', ownerId: KNOWLEDGE_ORG_OWNER_ID } }
}

export function readFileRefs(files: unknown): SiteFileRef[] {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES_PER_OPEN) {
    throw new HttpError(400, `Embedded files are opened 1 to ${MAX_FILES_PER_OPEN} at a time. Nothing was changed.`)
  }
  return files.map(f => {
    const ref = readFileRef(withOrgOwner(f))
    if (!ref || !isSiteFileRef(ref)) throw new HttpError(400, NOT_A_FILE)
    return ref
  })
}

type Open = (ref: SiteFileRef, userId: string) => Promise<FileOpenAnswer>

/** A file refused with an error, rather than a state: a refusal reads as not found, anything else as away. */
export function stateOfError(err: unknown): { state: 'not-found' | 'site-unavailable' } {
  if (err instanceof HttpError) {
    if (err.statusCode === 401) throw err
    if (err.statusCode < 500) return { state: 'not-found' }
  }
  return { state: 'site-unavailable' }
}

/** `each` for every item, a few at a time. */
export async function atFewAtOnce<T>(items: readonly T[], each: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      await each(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, worker))
}

export async function openFiles(refs: SiteFileRef[], userId: string, open: Open): Promise<FileOpenAnswer[]> {
  const answers: FileOpenAnswer[] = new Array(refs.length)
  await atFewAtOnce(refs, async (ref, i) => {
    try {
      answers[i] = await open(ref, userId)
    } catch (err) {
      answers[i] = stateOfError(err)
    }
  })
  return answers
}

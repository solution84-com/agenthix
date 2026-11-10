/**
 * What a chip shows of the files it names (spec part 3, *Chips in conversations*): each file's facts, or that it is
 * gone, a folder, not to be read, or on a site that isn't answering. Access is the open's own (`locateFile`), checked before
 * anything is asked of a site; then the site is asked `file.about`. Nothing is signed and nothing is recorded: a chip
 * on screen is not a file opened (T11), so no ticket exists to record. A click on the chip opens through `openFile`.
 */
import type { SiteFileRef } from '@agenthix/core'
import type { FileFactsAnswer } from './fileFactsAnswer'
import { factsOfAbout, locateFile, OpenRefused, type OpenFileDeps } from './openFile'
import { atFewAtOnce, stateOfError } from './openFiles'

export type { FileFactsAnswer }

export type FileFactsDeps = Pick<OpenFileDeps, 'checkAccess' | 'siteFor' | 'siteAndRelay' | 'about'>

type Located = { i: number; ref: SiteFileRef }

// Read as a string, so this compiles against a core from before site protocol 1.17 named the refusal.
const isLinked = (refusal: string) => refusal === 'linked'

function refusalOf(err: unknown): FileFactsAnswer {
  return err instanceof OpenRefused ? { state: err.state } : stateOfError(err)
}

/** One site's files, a few at a time; once the site fails to answer, the rest of its files are not asked about. */
async function askSite(siteId: string, files: Located[], deps: FileFactsDeps, answers: FileFactsAnswer[]) {
  const held = await deps.siteAndRelay(siteId)
  if (!held) {
    for (const f of files) answers[f.i] = { state: 'not-found' }
    return
  }
  let away = false
  await atFewAtOnce(files, async ({ i, ref }) => {
    if (away) { answers[i] = { state: 'site-unavailable' }; return }
    try {
      const about = await deps.about(siteId, ref)
      if (about.ok) answers[i] = { state: 'ready', facts: factsOfAbout(about) }
      // A folder is no file the site serves; where a place's folder may be named, a chip for it opens the Files tool.
      else if (about.refusal === 'not-a-file' && ref.space === 'place') answers[i] = { state: 'folder' }
      // A hard-linked file is there; opened, the frame says why it isn't shown (site protocol 1.17's `linked`).
      else answers[i] = isLinked(about.refusal) ? { state: 'linked' } : { state: 'gone' }
    } catch (err) {
      if (err instanceof OpenRefused && err.state === 'not-found') { answers[i] = { state: 'gone' }; return }
      // Too old for a file at a commit is no sign the site is away: its other files are still asked about.
      if (err instanceof OpenRefused && err.reason === 'upgrade') { answers[i] = { state: 'site-unavailable' }; return }
      const answer = refusalOf(err)
      if (answer.state === 'site-unavailable') away = true
      answers[i] = answer
    }
  })
}

export async function fileFacts(refs: SiteFileRef[], userId: string, deps: FileFactsDeps): Promise<FileFactsAnswer[]> {
  const answers: FileFactsAnswer[] = new Array(refs.length)
  const bySite = new Map<string, Located[]>()
  await atFewAtOnce(refs, async (requested, i) => {
    try {
      const { ref, siteId } = await locateFile(requested, userId, deps)
      const files = bySite.get(siteId) ?? []
      files.push({ i, ref })
      bySite.set(siteId, files)
    } catch (err) {
      answers[i] = refusalOf(err)
    }
  })
  await Promise.all([...bySite].map(async ([siteId, files]) => {
    try {
      await askSite(siteId, files, deps, answers)
    } catch (err) {
      const answer = refusalOf(err)
      for (const f of files) answers[f.i] ??= answer
    }
  }))
  return answers
}

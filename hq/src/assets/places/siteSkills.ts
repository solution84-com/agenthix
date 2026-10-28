/**
 * What hq asks a place's site about the skills in its files (spec part 4 *Defaults and switches*): a scan, one skill
 * folder's files read back, and writing or removing a skill folder. Reads go through the location methods every Files
 * read uses, so the site's containment applies; a folder is read under staging's bounds with hidden entries left out,
 * the same files a scan fingerprints and staging stages (security review H3, L1, L3). A folder is written whole, or
 * removed, by the site's own methods for a place's skill folders, never a workspace's.
 */
import {
  LOCATION_FILE_METHODS, LocationFileError, PACKAGE_FORMAT_VERSION, SKILL_TREE_MAX_BYTES, SKILL_TREE_MAX_DEPTH,
  SKILL_TREE_MAX_ENTRIES, placeSkillFolder,
  type LocationRef, type LocationScanSkillsResult, type LocationWriteSkillParams, type ProtocolVersion, type ScanWorkspace,
  type SkillFolderTransfer,
} from '@agenthix/core'
import { siteChannelRegistry } from '../../sites/channel'
import { openContentStream, ContentStreamFailed, type ContentStream } from '../../sites/content'
import { sha256Hex } from '../../packages/packageStore'
import { fingerprintOf } from '../content'
import { Logger } from '../../server/utils/logger'
import { listFilesOnSite, readFileOnSite, translateFailure } from '../../storage/locationFileStore'
import { resolveStorageSite } from '../../storage/storageSite'
import type { PackageFile } from '../../library/packages/packageZip'
import { LifecycleError } from '../lifecycle/errors'

const NOTHING = 'Nothing was changed.'
const logger = new Logger('PlaceSkillFiles')

export async function scanOnSite(loc: LocationRef, agentId: string, workspaces: ScanWorkspace[] = []): Promise<LocationScanSkillsResult> {
  const siteId = await resolveStorageSite(loc)
  const method = LOCATION_FILE_METHODS.scanSkills
  try {
    return await siteChannelRegistry.request(siteId, method, { loc: { ...loc, workspaceId: null, taskId: null }, agentId, workspaces })
  } catch (err) {
    return translateFailure(siteId, method, err)
  }
}

export class SkillFolderTooLargeError extends LifecycleError {}

/** Every file of one skill folder, hidden entries left out, refused past staging's bounds. */
export async function readSkillFolder(loc: LocationRef, dir: string): Promise<PackageFile[]> {
  const files: PackageFile[] = []
  let entries = 0
  let bytes = 0
  const walk = async (rel: string, depth: number): Promise<void> => {
    if (depth > SKILL_TREE_MAX_DEPTH) throw new SkillFolderTooLargeError(`The skill's folders nest deeper than ${SKILL_TREE_MAX_DEPTH}. ${NOTHING}`)
    const { entries: listed } = await listFilesOnSite(loc, rel ? `${dir}/${rel}` : dir)
    for (const entry of listed) {
      if (entry.name.startsWith('.')) continue
      if (++entries > SKILL_TREE_MAX_ENTRIES) throw new SkillFolderTooLargeError(`The skill holds more than ${SKILL_TREE_MAX_ENTRIES} entries. ${NOTHING}`)
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.kind === 'directory') { await walk(path, depth + 1); continue }
      bytes += entry.size
      if (bytes > SKILL_TREE_MAX_BYTES) throw new SkillFolderTooLargeError(`The skill is larger than ${SKILL_TREE_MAX_BYTES} bytes. ${NOTHING}`)
      files.push({ path, content: await readFileOnSite(loc, `${dir}/${path}`) })
    }
  }
  await walk('', 1)
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** The first site protocol with `location.writeSkill` and `location.removeSkill`. */
const FIRST_WITH_SKILL_WRITES = { major: 1, minor: 11 }
export const SKILL_WRITE_TIMEOUT_MS = 60_000

export function speaksSkillWrites(v: ProtocolVersion): boolean {
  return v.major > FIRST_WITH_SKILL_WRITES.major || (v.major === FIRST_WITH_SKILL_WRITES.major && v.minor >= FIRST_WITH_SKILL_WRITES.minor)
}

export class SkillFolderWriteUnavailableError extends LifecycleError {}

const OLD_SITE = `The place's Execution Site is too old to write a skill's files: update it, then try again. ${NOTHING}`

/** What a site's refusal means for the person, by its code; the site's own words stay in hq's log. */
function refusedBySite(err: LocationFileError): SkillFolderWriteUnavailableError {
  const what = {
    refused: "Something in the place's files stands where the skill's folder goes, such as a link, so HQ left it alone. Look at the place's files.",
    outside: "The place's files changed while the skill was being written, so it wasn't written. Try again.",
    not_a_directory: "A file stands where the skill's folder goes. Look at the place's files.",
    not_found: "The place's files can't be found on its Execution Site.",
    too_large: 'The skill is too large to write.',
    too_many: 'The skill holds too many files or folders.',
  }[err.code as string] ?? "The place's Execution Site couldn't write the skill's files."
  return new SkillFolderWriteUnavailableError(`${what} ${NOTHING}`, 409)
}

async function siteForWrite(loc: LocationRef, dir: string): Promise<string> {
  if (!placeSkillFolder(dir) || loc.workspaceId) {
    throw new SkillFolderWriteUnavailableError(`HQ writes only a place's own skills and an agent's, never a repository's. ${NOTHING}`, 409)
  }
  const siteId = await resolveStorageSite(loc)
  const conn = siteChannelRegistry.get(siteId)
  if (conn && !speaksSkillWrites(conn.protocol)) throw new SkillFolderWriteUnavailableError(OLD_SITE, 409)
  return siteId
}

function sendAndAwaitEnd(stream: ContentStream, body: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (stream.errored) return reject(stream.errored)
    if (stream.destroyed) return reject(new ContentStreamFailed('The stream closed before the site answered', 'disconnected'))
    let settled = false
    const settle = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn() } }
    const timer = setTimeout(() => {
      stream.destroy()
      settle(() => reject(new ContentStreamFailed(`No answer within ${SKILL_WRITE_TIMEOUT_MS} ms`, 'timeout')))
    }, SKILL_WRITE_TIMEOUT_MS)
    timer.unref?.()
    stream.on('error', err => settle(() => reject(err)))
    stream.on('end', () => settle(() => resolve()))
    stream.on('close', () => settle(() => reject(stream.errored ?? new ContentStreamFailed('The stream closed before the site answered', 'disconnected'))))
    stream.resume()
    stream.end(body)
  })
}

async function onSite<T>(siteId: string, method: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    try {
      return await translateFailure(siteId, method, err)
    } catch (translated) {
      if (translated instanceof LocationFileError) {
        logger.warn(`${method} refused by site ${siteId}: ${translated.message}`)
        throw refusedBySite(translated)
      }
      throw translated
    }
  }
}

/**
 * Makes the folder hold exactly these files, removing any other (site protocol 1.11). The site checks them against
 * the fingerprint named here and writes them beside the old folder before putting them in its place.
 */
export async function writeSkillFolder(loc: LocationRef, dir: string, files: PackageFile[]): Promise<void> {
  const siteId = await siteForWrite(loc, dir)
  const method = LOCATION_FILE_METHODS.writeSkill
  const transfer: SkillFolderTransfer = {
    contents: { formatVersion: PACKAGE_FORMAT_VERSION, files: files.map(f => ({ path: f.path, sha256: sha256Hex(f.content) })) },
    data: Object.fromEntries(files.map(f => [f.path, f.content.toString('base64')])),
  }
  const params: LocationWriteSkillParams = { loc: { ...loc, workspaceId: null, taskId: null }, dir, digest: fingerprintOf(files) }
  await onSite(siteId, method, async () => {
    const stream = await openContentStream(siteId, method, params)
    await sendAndAwaitEnd(stream, Buffer.from(JSON.stringify(transfer), 'utf-8'))
  })
}

export async function removeSkillFolder(loc: LocationRef, dir: string): Promise<void> {
  const siteId = await siteForWrite(loc, dir)
  const method = LOCATION_FILE_METHODS.removeSkill
  await onSite(siteId, method, () => siteChannelRegistry.request(siteId, method, { loc: { ...loc, workspaceId: null, taskId: null }, dir }))
}

/**
 * `location.writeSkill` and `location.removeSkill` (site protocol 1.11, skills spec part 4 *Versions by publishing*):
 * one of a place's skill folders, `.agents/skills/<slug>` or `.agents/agents/<agent id>/skills/<slug>` in its files,
 * made to hold exactly the files hq sent, or removed. Never a workspace's repository.
 *
 * Every folder on the way must be a real directory where the layout puts it: a run can plant a link anywhere in a
 * place's files, so a link on the way, or standing in for the skill folder, is refused. The new folder is written
 * beside the old one under a hidden name (which a scan and staging leave out), and then renamed into place, so a run
 * never reads half of a skill. Writes to one folder are taken one at a time.
 *
 * hq checks who may write before it asks; the params carry no person (adr-0042).
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import {
  LOCATION_FILE_METHODS, LocationFileError, PACKAGE_DIGEST_PATTERN, SKILL_WRITE_MAX_BYTES, placeSkillFolder,
  type LocationRef, type LocationRemoveSkillResult, type LocationFileErrorCode,
} from '@agenthix/core'
import { LOC_REF_SCHEMA } from './locationFileMethods'
import { describeLocation, parseParams } from './locationContainment'
import { placeFilesHome } from '../../packages/placeSkillHomes'
import { getFilesDir } from './paths'
import { isInsideHome, realpathOrNull } from '../../packages/boundaryOverrides'
import { readSkillTransfer, SkillTransferError, type TransferredFile } from './skillFolderTransfer'
import type { ContentHandler } from '../hq/content/contentMethods'

const WRITE = LOCATION_FILE_METHODS.writeSkill
const REMOVE = LOCATION_FILE_METHODS.removeSkill

const WRITE_PARAMS = z.object({ loc: LOC_REF_SCHEMA, dir: z.string().max(512), digest: z.string().regex(PACKAGE_DIGEST_PATTERN) })
const REMOVE_PARAMS = z.object({ loc: LOC_REF_SCHEMA, dir: z.string().max(512) })

type Folder = { loc: LocationRef; dir: string; home: string; root: string; target: string; slug: string }

function refusal(code: LocationFileErrorCode, method: string, loc: LocationRef, dir: string, why: string): LocationFileError {
  return new LocationFileError(code, `${method} "${dir}" in ${describeLocation(loc)}: ${why}`)
}

/**
 * The place's files folder, as its real path. Where nothing stands there yet (a person or project nobody has written
 * a file for) a write makes it, as the site's other writes do for a first file, and a removal finds nothing. A link or
 * a file standing there is refused either way, and the make is followed by the same check as an existing home.
 */
export async function homeOf(method: string, loc: LocationRef, dir: string, create: boolean): Promise<string | null> {
  const home = await placeFilesHome(loc)
  if (home) return home
  let files: string
  try {
    files = getFilesDir(loc.ownerType, loc.ownerId)
  } catch {
    throw refusal('invalid', method, loc, dir, 'the place is not one')
  }
  if (await fs.lstat(files).catch(() => null)) throw refusal('not_found', method, loc, dir, "the place's files are not where they should be")
  if (!create) return null
  await fs.mkdir(files, { recursive: true })
  const made = await placeFilesHome(loc)
  if (!made) throw refusal('not_found', method, loc, dir, "the place's files are not where they should be")
  return made
}

/** The folder's place on disk, its root made where missing; refused for a workspace, any other path, or a link. */
async function folderOf(method: string, loc: LocationRef, dir: string, create: boolean): Promise<Folder | null> {
  const folder = placeSkillFolder(dir)
  if (!folder || loc.workspaceId || loc.taskId) {
    throw refusal('invalid', method, loc, dir, "it is not a place's skill folder")
  }
  const home = await homeOf(method, loc, dir, create)
  if (!home) return null
  let at = home
  for (const part of dir.split('/').slice(0, -1)) {
    at = path.join(at, part)
    let stat = await fs.lstat(at).catch(() => null)
    if (!stat) {
      if (!create) return null
      await fs.mkdir(at).catch(err => { if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err })
      stat = await fs.lstat(at)
    }
    if (stat.isSymbolicLink()) throw refusal('refused', method, loc, dir, 'a link stands on the way to it')
    if (!stat.isDirectory()) throw refusal('not_a_directory', method, loc, dir, 'a file stands on the way to it')
  }
  if ((await realpathOrNull(at)) !== at || !isInsideHome(home, at)) throw refusal('outside', method, loc, dir, 'it is outside the place')
  return { loc, dir, home, root: at, target: path.join(at, folder.slug), slug: folder.slug }
}

/** What stands at the folder now: nothing, or a real directory. A link or a file there is refused. */
async function existing(method: string, f: Folder): Promise<boolean> {
  const stat = await fs.lstat(f.target).catch(() => null)
  if (!stat) return false
  if (stat.isSymbolicLink()) throw refusal('refused', method, f.loc, f.dir, 'a link stands in for the skill folder')
  if (!stat.isDirectory()) throw refusal('not_a_directory', method, f.loc, f.dir, 'a file stands in for the skill folder')
  return true
}

async function assertRootUnmoved(method: string, f: Folder): Promise<void> {
  if ((await realpathOrNull(f.root)) !== f.root) throw refusal('outside', method, f.loc, f.dir, 'its folder was moved while it was written')
}

const aside = (f: Folder, what: string) => path.join(f.root, `.${f.slug}.${what}-${randomBytes(6).toString('hex')}`)

class MovedError extends Error {}

/** Each folder is checked to be where it was made before a file goes in, so a link swapped in above it is caught. */
async function assertAt(dir: string): Promise<void> {
  if ((await realpathOrNull(dir)) !== dir) throw new MovedError()
}

async function writeFiles(dir: string, files: TransferredFile[]): Promise<void> {
  const made = new Set<string>()
  for (const file of files) {
    const parts = file.path.split('/')
    for (let i = 1; i < parts.length; i++) {
      const sub = parts.slice(0, i).join('/')
      if (made.has(sub)) continue
      await fs.mkdir(path.join(dir, ...sub.split('/')))
      made.add(sub)
    }
    await assertAt(path.join(dir, ...parts.slice(0, -1)))
    const handle = await fs.open(path.join(dir, ...parts), fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o644)
    try {
      await handle.writeFile(file.content)
    } finally {
      await handle.close()
    }
  }
}

const queues = new Map<string, Promise<unknown>>()

const keyOf = (loc: LocationRef, dir: string) => `${loc.ownerType}/${loc.ownerId}/${dir}`

/** One write or removal at a time per folder, in the order they arrived; the next waits for the one before, whatever its outcome. */
function oneAtATime<T>(key: string, work: () => Promise<T>): Promise<T> {
  const before = queues.get(key) ?? Promise.resolve()
  const next = before.catch(() => {}).then(work)
  queues.set(key, next)
  void next.catch(() => {}).finally(() => { if (queues.get(key) === next) queues.delete(key) })
  return next
}

export async function writeSkillFolder(params: unknown, body: Buffer): Promise<void> {
  const { loc, dir, digest } = parseParams(WRITE_PARAMS, params, WRITE)
  let files: TransferredFile[]
  try {
    files = readSkillTransfer(body, digest)
  } catch (err) {
    if (err instanceof SkillTransferError) throw refusal(err.code, WRITE, loc, dir, err.message)
    throw err
  }
  await oneAtATime(keyOf(loc, dir), () => coded(WRITE, loc, dir, async () => {
    const folder = await folderOf(WRITE, loc, dir, true)
    if (!folder) throw refusal('not_found', WRITE, loc, dir, "its folder can't be made")
    await replaceFolder(folder, files)
  }))
}

async function replaceFolder(folder: Folder, files: TransferredFile[]): Promise<void> {
  const { loc, dir } = folder
  const had = await existing(WRITE, folder)
  const fresh = aside(folder, 'writing')
  await fs.mkdir(fresh)
  try {
    await writeFiles(fresh, files)
    await assertRootUnmoved(WRITE, folder)
    if (!had) {
      await fs.rename(fresh, folder.target)
      return
    }
    const old = aside(folder, 'old')
    await fs.rename(folder.target, old)
    try {
      await fs.rename(fresh, folder.target)
    } catch (err) {
      await fs.rename(old, folder.target).catch(() => {})
      throw err
    }
    await fs.rm(old, { recursive: true, force: true })
  } catch (err) {
    if (!(err instanceof MovedError)) await fs.rm(fresh, { recursive: true, force: true }).catch(() => {})
    if (err instanceof LocationFileError) throw err
    if (err instanceof MovedError) throw refusal('outside', WRITE, loc, dir, 'its folder was moved while it was written')
    throw refusal('failed', WRITE, loc, dir, 'it could not be written')
  }
}

export async function removeSkillFolder(params: unknown): Promise<LocationRemoveSkillResult> {
  const { loc, dir } = parseParams(REMOVE_PARAMS, params, REMOVE)
  return oneAtATime(keyOf(loc, dir), () => coded(REMOVE, loc, dir, async () => {
    const folder = await folderOf(REMOVE, loc, dir, false)
    if (!folder || !(await existing(REMOVE, folder))) return { removed: false }
    const gone = aside(folder, 'removing')
    await fs.rename(folder.target, gone)
    await fs.rm(gone, { recursive: true, force: true })
    return { removed: true }
  }))
}

/** A refusal of ours as it is; anything else, a filesystem error included, as `failed`, never naming a path on disk. */
async function coded<T>(method: string, loc: LocationRef, dir: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof LocationFileError) throw err
    throw refusal('failed', method, loc, dir, 'the site could not do it')
  }
}

/**
 * The content handler: reads the whole transfer (bounded), then writes. Reads with 'data'/'end' and ends its own
 * half, as every content handler must (contentMethods.ts).
 */
export const handleWriteSkill: ContentHandler = (stream, params) =>
  new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const onData = (chunk: Buffer) => {
      size += chunk.length
      // Base64 and the contents list make the transfer larger than its files; twice the bound leaves room for both.
      if (size > SKILL_WRITE_MAX_BYTES * 2) {
        stream.removeListener('data', onData)
        stream.pause()
        reject(new LocationFileError('too_large', `${WRITE}: the transfer is larger than a skill may be`))
        setImmediate(() => stream.destroy())
        return
      }
      chunks.push(chunk)
    }
    stream.on('data', onData)
    stream.on('error', reject)
    stream.on('end', () => {
      writeSkillFolder(params, Buffer.concat(chunks))
        .then(() => new Promise<void>(done => stream.end(() => done())))
        .then(resolve, reject)
    })
  })

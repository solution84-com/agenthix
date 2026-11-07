/**
 * `location.shareFile` (site protocol 1.14): a photo or file a person added to a conversation, written into the
 * shared folder of the conversation's place, `files/Shared in conversations/`. hq decided what the file is from its
 * content and who may write there before it asks; the params carry no person (adr-0042).
 *
 * Only that one folder is ever written, and only a new file: a run can plant a link anywhere in a place's files, so the
 * folder must be a real directory inside the place, and the file is created exclusively, never following a link, so
 * nothing already there is replaced. A name already taken gets the first free number (`shot (2).png`). Writes to one
 * place are taken one at a time.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  LOCATION_FILE_METHODS, LocationFileError, SHARED_FILE_MAX_BYTES, SHARED_FOLDER, numberedSharedName, sharedNameProblem,
  type LocationFileErrorCode, type LocationRef, type LocationShareFileResult,
} from '@agenthix/core'
import { LOC_REF_SCHEMA } from './locationFileMethods'
import { describeLocation, parseParams } from './locationContainment'
import { homeOf } from './skillFolderWrite'
import { isInsideHome, realpathOrNull } from '../../packages/boundaryOverrides'
import type { ContentHandler } from '../hq/content/contentMethods'

const METHOD = LOCATION_FILE_METHODS.shareFile
const PARAMS = z.object({ loc: LOC_REF_SCHEMA, name: z.string().max(1024), size: z.number().int().min(1).max(SHARED_FILE_MAX_BYTES) })
/** How many numbered names are tried before the folder is taken to be full of one name. */
const MAX_NUMBER = 1000

function refusal(code: LocationFileErrorCode, loc: LocationRef, name: string, why: string): LocationFileError {
  return new LocationFileError(code, `${METHOD} "${name}" in ${describeLocation(loc)}: ${why}`)
}

/** The shared folder's real path, made where missing; a link or a file standing for it is refused. */
async function folderOf(loc: LocationRef, name: string): Promise<string> {
  const home = await homeOf(METHOD, loc, name, true)
  if (!home) throw refusal('not_found', loc, name, "the place's files can't be made")
  const folder = path.join(home, SHARED_FOLDER)
  let stat = await fs.lstat(folder).catch(() => null)
  if (!stat) {
    await fs.mkdir(folder).catch(err => { if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err })
    stat = await fs.lstat(folder)
  }
  if (stat.isSymbolicLink()) throw refusal('refused', loc, name, 'a link stands in for the shared folder')
  if (!stat.isDirectory()) throw refusal('not_a_directory', loc, name, 'a file stands in for the shared folder')
  if ((await realpathOrNull(folder)) !== folder || !isInsideHome(home, folder)) throw refusal('outside', loc, name, 'the shared folder is outside the place')
  return folder
}

async function createFree(folder: string, name: string, body: Buffer): Promise<string> {
  for (let n = 1; n <= MAX_NUMBER; n++) {
    const candidate = n === 1 ? name : numberedSharedName(name, n)
    // The folder is checked again just before each file goes in, so a link swapped in for it is caught.
    if ((await realpathOrNull(folder)) !== folder) throw new LocationFileError('outside', `${METHOD}: the shared folder was moved`)
    let handle: fs.FileHandle
    try {
      handle = await fs.open(path.join(folder, candidate), fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o644)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST' || (err as NodeJS.ErrnoException).code === 'ELOOP') continue
      throw err
    }
    try {
      await handle.writeFile(body)
    } catch (err) {
      await handle.close().catch(() => {})
      await fs.rm(path.join(folder, candidate), { force: true }).catch(() => {})
      throw err
    }
    await handle.close()
    return candidate
  }
  throw new LocationFileError('too_many', `${METHOD}: too many files share the name "${name}"`)
}

const queues = new Map<string, Promise<unknown>>()

function oneAtATime<T>(key: string, work: () => Promise<T>): Promise<T> {
  const before = queues.get(key) ?? Promise.resolve()
  const next = before.catch(() => {}).then(work)
  queues.set(key, next)
  void next.catch(() => {}).finally(() => { if (queues.get(key) === next) queues.delete(key) })
  return next
}

export async function shareFile(params: unknown, body: Buffer): Promise<LocationShareFileResult> {
  const { loc, name, size } = parseParams(PARAMS, params, METHOD)
  if (loc.workspaceId || loc.taskId) throw refusal('invalid', loc, name, "it is not a place's own files")
  const problem = sharedNameProblem(name)
  if (problem) throw refusal('invalid', loc, name, problem)
  if (body.length !== size) throw refusal('invalid', loc, name, `the stream carried ${body.length} bytes, not ${size}`)
  return oneAtATime(`${loc.ownerType}/${loc.ownerId}`, async () => {
    try {
      const folder = await folderOf(loc, name)
      return { name: await createFree(folder, name, body) }
    } catch (err) {
      if (err instanceof LocationFileError) throw err
      throw refusal('failed', loc, name, 'the site could not write it')
    }
  })
}

/**
 * The content handler: reads the file (bounded), writes it, and answers the name it was written under. Reads with
 * 'data'/'end' and ends its own half, as every content handler must (contentMethods.ts).
 */
export const handleShareFile: ContentHandler = (stream, params) =>
  new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const onData = (chunk: Buffer) => {
      size += chunk.length
      if (size > SHARED_FILE_MAX_BYTES) {
        stream.removeListener('data', onData)
        stream.pause()
        reject(new LocationFileError('too_large', `${METHOD}: the file is larger than a shared file may be`))
        setImmediate(() => stream.destroy())
        return
      }
      chunks.push(chunk)
    }
    stream.on('data', onData)
    stream.on('error', reject)
    stream.on('end', () => {
      shareFile(params, Buffer.concat(chunks))
        .then(result => new Promise<void>(done => stream.end(Buffer.from(JSON.stringify(result), 'utf-8'), () => done())))
        .then(resolve, reject)
    })
  })

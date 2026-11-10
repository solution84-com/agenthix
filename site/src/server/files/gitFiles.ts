/**
 * A file of a workspace with Git at one commit (site protocol 1.18): what the workspace view opens for `main`, one of
 * its versions or a branch. It is read from the workspace's own repository in the code space, by the commit helper
 * (`../branches/helperContainer.ts`), never by this process: the helper reads only a plain file of that commit's tree,
 * by its exact path, with none of the repository's own settings (`../branches/program/fileOps.ts`).
 *
 * `file.about` asks the helper for the file's facts and first bytes. `files.serve` has it write the bytes into a
 * folder of this site's own data, which no container mounts, and serves them from there. A commit's file never
 * changes, so that copy is kept a little longer than a ticket lives, for the ranges a PDF viewer reads and the
 * download beside them; every open still checks the site holds the workspace as a code workspace, so a removed one
 * is not served from a kept copy. Its version is its blob id.
 */
import { randomUUID } from 'node:crypto'
import { constants as fsConstants, type Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  FILE_TICKET_TTL_SECONDS, LocationFileError, TEXT_SNIFF_BYTES, contentTypeForName, fileRefName, looksLikeText,
  type FileAboutResult, type PlaceFileRef, type SiteFileRef, type WorkspaceRepoRef,
} from '@agenthix/core'
import type { FileHandle } from '../../agents/runtime/containedFile'
import { getSiteRoot } from '../../agents/agentDiskPaths'
import { placeWorkspace } from '../branches/branchCalls'
import { runHelper, type HelperAnswer, type HelperSpec } from '../branches/helperContainer'

export type GitPlaceFile = PlaceFileRef & { commit: string; loc: PlaceFileRef['loc'] & { workspaceId: string } }

export const isAtCommit = (ref: SiteFileRef): ref is GitPlaceFile =>
  ref.space === 'place' && typeof ref.commit === 'string' && !!ref.loc.workspaceId && !ref.loc.taskId

/** Short of hq's wait for `file.about` (ten seconds), so a slow helper is answered as a failure, not abandoned. */
export const GIT_FILE_ABOUT_BUDGET_MS = 8_000
export const GIT_FILE_OUT_BUDGET_MS = 60_000
/** A ticket's life and a minute more after the copy was last opened. */
export const GIT_FILE_KEEP_MS = (FILE_TICKET_TTL_SECONDS + 60) * 1000
/** Past this, the copies opened longest ago go first; a larger file is not copied out at all. */
export const GIT_FILE_KEEP_MAX_BYTES = 1024 ** 3

export type GitFileDeps = {
  /** The workspace's `main` in the code space, when this site holds it as a workspace with Git; null otherwise. */
  codeDir(ref: WorkspaceRepoRef): Promise<string | null>
  helper(spec: HelperSpec, request: Record<string, unknown>): Promise<HelperAnswer>
  /** This site's own folder for the copies. */
  root(): string
  now(): number
}

export const gitFileDeps: GitFileDeps = {
  async codeDir(ref) {
    const placed = await placeWorkspace(ref, 'file').catch(() => null)
    if (!placed) return null
    const git = await fs.lstat(path.join(placed.ws, '.git')).catch(() => null)
    return git?.isDirectory() ? placed.ws : null
  },
  helper: (spec, request) => runHelper(spec, request),
  root: () => path.join(getSiteRoot(), 'git-file-reads'),
  now: () => Date.now(),
}

export type OpenedGitFile =
  | { ok: true; handle: FileHandle; stat: Stats; name: string; version: string; modifiedAt: Date }
  | { ok: false; refusal: 'not-found' }

const NOT_FOUND = { ok: false, refusal: 'not-found' } as const
/** What the helper answers for a commit, path or repository that is not there, or a request it does not accept. */
const NOT_THERE = new Set(['not_found', 'invalid', 'not_repository'])

const repoOf = (ref: GitPlaceFile): WorkspaceRepoRef =>
  ({ ownerType: ref.loc.ownerType, ownerId: ref.loc.ownerId, workspaceId: ref.loc.workspaceId })

/** The helper's answer: a file, nothing there (null), or a failure that names no path on this disk. */
function answered(answer: HelperAnswer, ref: GitPlaceFile, method: string): HelperAnswer | null {
  if (answer.refused) {
    if (NOT_THERE.has(answer.refused)) return null
    throw new LocationFileError('failed', `${method} could not read "${fileRefName(ref)}" from the workspace's repository`)
  }
  return answer.exists === true && typeof answer.oid === 'string' && typeof answer.size === 'number' ? answer : null
}

export async function aboutGitFile(ref: GitPlaceFile, method: string, deps: GitFileDeps = gitFileDeps): Promise<FileAboutResult> {
  const ws = await deps.codeDir(repoOf(ref))
  if (!ws) return NOT_FOUND
  const answer = answered(await deps.helper(
    { workspaceId: ref.loc.workspaceId, ws: { dir: ws, readOnly: true }, network: false, timeoutMs: GIT_FILE_ABOUT_BUDGET_MS },
    { op: 'fileFacts', commit: ref.commit, path: ref.path, sniff: TEXT_SNIFF_BYTES },
  ), ref, method)
  if (!answer) return NOT_FOUND
  const name = fileRefName(ref)
  return {
    ok: true, name, size: answer.size as number, modifiedAt: new Date(String(answer.at)).toISOString(),
    version: answer.oid as string, contentType: contentTypeForName(name),
    looksLikeText: looksLikeText(Buffer.from(String(answer.head ?? ''), 'base64')),
  }
}

type Kept = { dir: string; oid: string; size: number; at: string; usedAt: number }
const kept = new Map<string, Kept>()
const making = new Map<string, Promise<Kept | null>>()
/** Each root is emptied once per process before its first copy: what an earlier run left belongs to no ticket. */
const emptied = new Map<string, Promise<void>>()

const keyOf = (ref: GitPlaceFile) => JSON.stringify([ref.loc.ownerType, ref.loc.ownerId, ref.loc.workspaceId, ref.commit, ref.path])

async function drop(key: string): Promise<void> {
  const entry = kept.get(key)
  kept.delete(key)
  if (entry) await fs.rm(entry.dir, { recursive: true, force: true }).catch(() => {})
}

async function sweep(now: number): Promise<void> {
  const old = [...kept].filter(([, e]) => now - e.usedAt > GIT_FILE_KEEP_MS).map(([k]) => k)
  await Promise.all(old.map(drop))
  let total = [...kept.values()].reduce((sum, e) => sum + e.size, 0)
  for (const [key, entry] of [...kept].sort((a, b) => a[1].usedAt - b[1].usedAt)) {
    if (total <= GIT_FILE_KEEP_MAX_BYTES) break
    total -= entry.size
    await drop(key)
  }
}

async function makeCopy(ref: GitPlaceFile, key: string, ws: string, method: string, deps: GitFileDeps): Promise<Kept | null> {
  const root = deps.root()
  if (!emptied.has(root)) emptied.set(root, fs.rm(root, { recursive: true, force: true }))
  await emptied.get(root)
  await fs.mkdir(root, { recursive: true, mode: 0o750 })
  const dir = path.join(root, randomUUID())
  await fs.mkdir(dir, { mode: 0o750 })
  try {
    const answer = answered(await deps.helper(
      { workspaceId: ref.loc.workspaceId, ws: { dir: ws, readOnly: true }, out: { dir }, network: false, timeoutMs: GIT_FILE_OUT_BUDGET_MS },
      { op: 'fileOut', commit: ref.commit, path: ref.path, max: GIT_FILE_KEEP_MAX_BYTES },
    ), ref, method)
    if (!answer) {
      await fs.rm(dir, { recursive: true, force: true })
      return null
    }
    const entry = { dir, oid: answer.oid as string, size: answer.size as number, at: String(answer.at), usedAt: deps.now() }
    kept.set(key, entry)
    return entry
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    throw err
  }
}

async function copyOf(ref: GitPlaceFile, ws: string, method: string, deps: GitFileDeps): Promise<Kept | null> {
  const key = keyOf(ref)
  const now = deps.now()
  await sweep(now)
  const have = kept.get(key)
  if (have) {
    have.usedAt = now
    return have
  }
  const pending = making.get(key)
  if (pending) return pending
  const made = makeCopy(ref, key, ws, method, deps).finally(() => making.delete(key))
  making.set(key, made)
  return made
}

/** The file's bytes, open, from this site's own copy; the caller closes the handle. */
export async function openGitFile(ref: GitPlaceFile, method: string, deps: GitFileDeps = gitFileDeps): Promise<OpenedGitFile> {
  const ws = await deps.codeDir(repoOf(ref))
  if (!ws) return NOT_FOUND
  for (let attempt = 0; attempt < 2; attempt++) {
    const copy = await copyOf(ref, ws, method, deps)
    if (!copy) return NOT_FOUND
    let handle: FileHandle
    try {
      handle = await fs.open(path.join(copy.dir, 'blob'), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    } catch {
      // Let go of between the lookup and the open: made again once.
      await drop(keyOf(ref))
      continue
    }
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size !== copy.size) {
      await handle.close().catch(() => {})
      await drop(keyOf(ref))
      throw new LocationFileError('failed', `${method} could not read "${fileRefName(ref)}" from the workspace's repository`)
    }
    return { ok: true, handle, stat, name: fileRefName(ref), version: copy.oid, modifiedAt: new Date(copy.at) }
  }
  throw new LocationFileError('failed', `${method} could not read "${fileRefName(ref)}" from the workspace's repository`)
}

export async function forgetGitFileCopiesForTests(): Promise<void> {
  await Promise.all([...kept.keys()].map(drop))
  making.clear()
  emptied.clear()
}

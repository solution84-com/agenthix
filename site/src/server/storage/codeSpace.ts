/**
 * The code space (adr-0173; the layout is `paths.ts`, `getCodeDir`): where a repository workspace's `main` lives, a
 * folder no container can write. A workspace is a repository workspace when its folder in the code space holds a
 * `.git` folder: the site decides from its own folder, never from anything in the boundary, where an agent can make
 * a `.git` of its own.
 *
 * ## Becoming a repository
 *
 * Turning Git on, or connecting a workspace to GitHub, builds the repository in a folder of the site's own
 * (`getCodeWorkDir`) — the workspace's files copied out of the boundary without following a symlink, or nothing for
 * a pull — and does all its git work there. Only a finished repository is renamed into the code space, so a failure
 * changes nothing. Then the switch-over:
 *
 * 1. **New runs in the workspace are held** while the repository is built and put in place (`untilSwitched`), so
 *    none starts on a folder that is about to go.
 * 2. **The old folder in the boundary is removed**, through open folders, once `main` is in place. Its files are now
 *    `main`'s. A container started before the switch still has the old mount set; it finishes its current runs and is
 *    made again before its next one, since the read-only mount of `main` changes its mounts (`mountSignature.ts`).
 *    The folder stays as the mount point of `main` in every container started after.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { WorkspaceRepoRef } from '@agenthix/core'
import { closeDir, openDirPath, openRoot } from '../../agents/runtime/safeTree'
import { removeEntryIn } from '../../agents/runtime/homeFolder'
import { copyOutOfBoundary } from './boundaryTreeCopy'
import { getCodeDir, getCodeOwnerDir, getCodeWorkDir, ownerDir } from './paths'

/** Whether the workspace's `main` is in the code space: its folder there holds a real `.git` folder. */
export async function isCodeWorkspace(ws: WorkspaceRepoRef): Promise<boolean> {
  const dir = getCodeDir(ws)
  const [top, git] = await Promise.all([fs.lstat(dir).catch(() => null), fs.lstat(path.join(dir, '.git')).catch(() => null)])
  return !!top?.isDirectory() && !!git?.isDirectory()
}

const switching = new Map<string, Promise<unknown>>()

/** Waits while the workspace is becoming a repository. A run in it starts only after. */
export async function untilSwitched(workspaceId: string | null | undefined): Promise<void> {
  const pending = workspaceId ? switching.get(workspaceId) : undefined
  if (pending) await pending.catch(() => {})
}

/** A site-only folder to build in, removed after `work` whatever happens. */
export async function withCodeWorkFolder<T>(work: (dir: string) => Promise<T>): Promise<T> {
  await fs.mkdir(getCodeWorkDir(), { recursive: true })
  const dir = await fs.mkdtemp(path.join(getCodeWorkDir(), 'w-'))
  try {
    return await work(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export class AlreadyRepository extends Error {}

/**
 * Builds the workspace's repository and switches it into the code space (see the header). `from` says what the
 * build starts from: the workspace's files (`'files'`), or an empty folder (`'empty'`, a pull). `build` does the git
 * work in the folder it is given; what it returns is returned. A workspace whose `main` is already in the code space
 * refuses with `AlreadyRepository`, and nothing is changed.
 */
export async function becomeRepository<T>(
  ws: WorkspaceRepoRef, from: 'files' | 'empty', build: (dir: string) => Promise<T>,
): Promise<T> {
  const previous = switching.get(ws.workspaceId)
  const run = (async () => {
    if (previous) await previous.catch(() => {})
    if (await isCodeWorkspace(ws)) throw new AlreadyRepository(`workspace ${ws.workspaceId} is already a repository`)
    return withCodeWorkFolder(async work => {
      const repo = path.join(work, 'repo')
      const boundary = ownerDir(ws.ownerType, ws.ownerId)
      if (from === 'files') await copyOutOfBoundary(boundary, `workspaces/${ws.workspaceId}`, repo)
      else await fs.mkdir(repo)
      const result = await build(repo)
      await fs.mkdir(getCodeOwnerDir(ws.ownerType, ws.ownerId), { recursive: true })
      const target = getCodeDir(ws)
      // A leftover folder with no `.git` (an earlier switch cut short) is not a repository, and gives way.
      await fs.rm(target, { recursive: true, force: true })
      await fs.rename(repo, target)
      await removeOldFolder(boundary, ws.workspaceId)
      return result
    })
  })()
  switching.set(ws.workspaceId, run)
  try {
    return await run
  } finally {
    if (switching.get(ws.workspaceId) === run) switching.delete(ws.workspaceId)
  }
}

/** The workspace's old folder in the boundary, removed through open folders; a missing one is nothing to do. */
async function removeOldFolder(boundary: string, workspaceId: string): Promise<void> {
  const top = await openRoot(boundary).catch(() => null)
  if (!top) return
  try {
    const workspaces = await openDirPath(top, 'workspaces').catch(() => null)
    if (!workspaces) return
    try {
      await removeEntryIn(workspaces, workspaceId)
    } finally {
      await closeDir(workspaces, top)
    }
  } finally {
    await closeDir(top)
  }
}

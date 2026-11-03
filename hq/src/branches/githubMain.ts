/**
 * A code workspace connected to GitHub (live preview spec, *Merge into main*, GitHub): `main` takes in versions
 * someone else pushed before a merge or a restore, and is pushed after one. The token is minted through the mint gate
 * for the workspace's own connection, for this one call, and ended at once (as `repo.connect` does).
 */
import { MAIN_WORK_METHODS, type WorkspaceRepoRef } from '@agenthix/core'
import { getAttachment } from '../storage/repoAttachmentService'
import { mintForLocation, revokeGateToken } from '../github/mintGate'
import { siteCall } from './siteCalls'
import { emitMainChange } from './workspaceEvents'
import { Logger } from '../server/utils/logger'

const logger = new Logger('BranchGitHub')

export type GitHubOutcome = 'pushed' | 'remote_ahead' | 'not_pushed'

async function connected(logicalSiteId: string, ref: WorkspaceRepoRef): Promise<boolean> {
  return (await getAttachment(logicalSiteId, ref)) !== null
}

async function withToken<T>(logicalSiteId: string, ref: WorkspaceRepoRef, personId: string, write: boolean, use: (token: string) => Promise<T>): Promise<T> {
  const t = await mintForLocation({
    place: { type: ref.ownerType, id: ref.ownerId }, siteId: logicalSiteId, workspaceId: ref.workspaceId,
    person: personId, needs: 'work', permissions: { contents: write ? 'write' : 'read' },
  })
  try {
    return await use(t.token)
  } finally {
    await revokeGateToken(t.token).catch(() => false)
  }
}

/**
 * Before a merge or a restore: versions on GitHub that `main` lacks arrive as new versions. Best effort: GitHub out
 * of reach, or a `main` that has gone its own way, leaves `main` as it is.
 */
export async function pullMainFirst(logicalSiteId: string, ref: WorkspaceRepoRef, personId: string): Promise<void> {
  try {
    if (!(await connected(logicalSiteId, ref))) return
    const pulled = await withToken(logicalSiteId, ref, personId, false, token => siteCall(logicalSiteId, MAIN_WORK_METHODS.pullMain, { workspace: ref, token }))
    if (pulled.pulled && pulled.versions.length > 0) {
      emitMainChange(ref.workspaceId, 'pulled', pulled.versions[pulled.versions.length - 1]!.number)
    }
  } catch (err) {
    logger.warn(`main not brought up to date from GitHub: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** After a merge or a restore: `main` pushed to GitHub. Null when the workspace is not connected. */
export async function pushMainAfter(logicalSiteId: string, ref: WorkspaceRepoRef, personId: string): Promise<GitHubOutcome | null> {
  try {
    if (!(await connected(logicalSiteId, ref))) return null
    const pushed = await withToken(logicalSiteId, ref, personId, true, token => siteCall(logicalSiteId, MAIN_WORK_METHODS.pushMain, { workspace: ref, token }))
    return pushed.pushed ? 'pushed' : 'remote_ahead'
  } catch (err) {
    logger.warn(`main not pushed to GitHub: ${err instanceof Error ? err.message : String(err)}`)
    return 'not_pushed'
  }
}

/**
 * What a live preview binds, its copy (core's `LivePreviewCopyKind`), and where it is on this disk and in the app's
 * container. The site never trusts what a copy says about itself: a `branch` copy is the one its own `BranchCopy`
 * record holds for that workspace and branch; a `main` copy and a `bundle` copy are made here, for the live preview
 * alone, by the commit helper, and removed with it.
 *
 * - `branch`: `clones/<copyId>/` in the owner's storage, the folder the branch's agent works in.
 * - `main`: in the site's own data, outside every storage (no agent works on `main`).
 * - `bundle`: `clones/<copyId>/` in the owner's storage on this site, so the branch's runs here work in it.
 *
 * In the app's container the copy is where an agent's container has it (`/<owners>/<id>/clones/<copyId>`), so paths a
 * tool wrote into it while the agent worked still hold; `main`'s copy is at `/main/<copyId>`. A copy in the owner's
 * storage is reached through the boundary's whole folder, mounted there, and acted on by the site only through open
 * folders from it, never by its own path, which runs through folders a container writes (adr-0173).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  BRANCH_WORK_SITE_BUDGET_MS, BUNDLE_WORK_SITE_BUDGET_MS, type LivePreviewOpenParams,
} from '@agenthix/core'
import { prisma } from '#db'
import { getSiteRoot } from '../../agents/agentDiskPaths'
import { PLURAL_OWNER } from '../../agents/runtime/locationResolver'
import { ownerDir } from '../storage/paths'
import { copyDirOf, copyState, inTurn, placeWorkspace, withClones, type Placed } from '../branches/branchCalls'
import { boundaryCopyOf } from '../storage/paths'
import { inDir } from '../../agents/runtime/safeTree'
import { runHelper, type HelperAnswer, type HelperSpec } from '../branches/helperContainer'
import { Logger } from '../utils/logger'
import { bundleFile, bundleSize } from './bundles/bundleStore'
import type { LivePreviewRow } from './livePreviewRows'
import { refuse, type Refused } from './livePreviewWords'

const logger = new Logger('livePreviews')

export type CopyPlace = { hostDir: string; containerDir: string }

type Of = Pick<LivePreviewRow, 'ownerType' | 'ownerId' | 'workspaceId' | 'copyKind' | 'copyId'>

export const mainCopiesRoot = (): string => path.join(getSiteRoot(), 'live-preview-copies')

export function copyPlaceOf(lp: Of): CopyPlace {
  if (lp.copyKind === 'main') return { hostDir: path.join(mainCopiesRoot(), lp.copyId), containerDir: `/main/${lp.copyId}` }
  return {
    hostDir: path.join(ownerDir(lp.ownerType, lp.ownerId), 'clones', lp.copyId),
    containerDir: `/${PLURAL_OWNER[lp.ownerType]}/${lp.ownerId}/clones/${lp.copyId}`,
  }
}

const NO_COPY = (what: string) => refuse('noCopy', `${what} Start the live preview again from HQ, which names the copy afresh. Nothing was changed.`)

/** Runs one helper operation for a live preview; a refusal is logged with what Git said, and answered as null. */
export async function previewHelper(spec: HelperSpec, request: Record<string, unknown>, what: string): Promise<HelperAnswer | null> {
  const answer = await runHelper(spec, request)
  if (!answer.refused) return answer
  logger.error(`${what}: ${answer.refused} ${String(answer.detail ?? '').slice(0, 500)}`)
  return null
}

/** A copy folder made empty for the helper to fill; one already there is refused. One in a boundary through open folders. */
async function emptyCopyDir(dir: string): Promise<boolean> {
  const inBoundary = boundaryCopyOf(dir)
  if (inBoundary) {
    return withClones(inBoundary.boundary, true, async clones => {
      if (!clones) return false
      return fs.mkdir(inDir(clones, inBoundary.copyId)).then(() => true, () => false)
    }).catch(() => false)
  }
  await fs.mkdir(path.dirname(dir), { recursive: true })
  return fs.mkdir(dir).then(() => true, () => false)
}

/** Whether a copy's folder is there, and holds a `.git` folder; one in a boundary looked at through open folders. */
export async function copyFolderState(dir: string): Promise<{ present: boolean; git: boolean }> {
  const inBoundary = boundaryCopyOf(dir)
  if (inBoundary) return copyState(inBoundary.boundary, inBoundary.copyId)
  const top = await fs.lstat(dir).catch(() => null)
  const git = top?.isDirectory() ? await fs.lstat(path.join(dir, '.git')).catch(() => null) : null
  return { present: !!top, git: !!git?.isDirectory() }
}

/**
 * The copy for a live preview about to start: checked (`branch`) or made (`main`, `bundle`). Answers its head, or the
 * refusal the person reads.
 */
export async function prepareCopy(p: LivePreviewOpenParams, lp: Of): Promise<{ head: string | null; main?: string } | Refused> {
  const place = copyPlaceOf(lp)
  if (p.copy.kind === 'branch') {
    const placed = await placeWorkspace(p.workspace, 'livePreview.open').catch(() => null)
    if (!placed) return NO_COPY('This site does not hold that workspace.')
    const copy = await prisma.branchCopy.findUnique({ where: { id: p.copy.copyId } })
    if (!copy || copy.workspaceId !== p.workspace.workspaceId || copy.ownerType !== p.workspace.ownerType
      || copy.ownerId !== p.workspace.ownerId || copy.branch !== p.branch) {
      return NO_COPY(`This site has no copy ${p.copy.copyId} of branch ${p.branch} for that workspace.`)
    }
    if (copyDirOf(placed, copy.id) !== place.hostDir) return NO_COPY('The copy is not where this site keeps it.')
    if (!(await copyFolderState(place.hostDir)).git) return NO_COPY('The copy\'s folder is not on this site any more.')
    return { head: null }
  }
  if (p.copy.kind === 'main') {
    const placed = await placeWorkspace(p.workspace, 'livePreview.open').catch(() => null)
    if (!placed) return NO_COPY('This site does not hold that workspace.')
    if (!(await emptyCopyDir(place.hostDir))) return NO_COPY('A copy with that id is already on this site.')
    const answer = await inTurn(placed.ref.workspaceId, () => previewHelper(
      { workspaceId: placed.ref.workspaceId, ws: { dir: placed.ws, readOnly: true }, copy: { dir: place.hostDir, readOnly: false }, network: false, timeoutMs: BRANCH_WORK_SITE_BUDGET_MS },
      { op: 'mainCopy' }, `livePreview.open: main's copy of workspace ${placed.ref.workspaceId}`,
    ))
    if (!answer) {
      await removeOwnCopy(lp).catch(() => {})
      return refuse('noCopy', 'This site could not make a copy of main for the live preview; the reason is in its log. Nothing was changed.')
    }
    return { head: String(answer.head), main: String(answer.main) }
  }
  if ((await bundleSize(p.copy.bundleId)) === null) {
    return refuse('noBundle', 'This site does not hold the branch the live preview needs; HQ sends it again. Nothing was changed.')
  }
  if (await prisma.branchCopy.findUnique({ where: { id: p.copy.copyId }, select: { id: true } })) return NO_COPY('A copy with that id is already on this site.')
  if (!(await emptyCopyDir(place.hostDir))) return NO_COPY('A copy with that id is already on this site.')
  const answer = await previewHelper(
    { workspaceId: p.workspace.workspaceId, copy: { dir: place.hostDir, readOnly: false }, bundle: { file: bundleFile(p.copy.bundleId) }, network: false, timeoutMs: BUNDLE_WORK_SITE_BUDGET_MS },
    { op: 'bundleCopy', branch: p.branch, main: null }, `livePreview.open: the copy of branch ${p.branch} from bundle ${p.copy.bundleId}`,
  )
  if (!answer) {
    await removeOwnCopy(lp).catch(() => {})
    return refuse('noBundle', 'The branch that came for the live preview could not be read on this site; HQ sends it again. Nothing was changed.')
  }
  return { head: String(answer.head) }
}

/** Removes a copy made for a live preview (`main`, `bundle`); a branch's own copy is never touched. */
export async function removeOwnCopy(lp: Of): Promise<void> {
  if (lp.copyKind === 'branch') return
  const dir = copyPlaceOf(lp).hostDir
  if (!(await copyFolderState(dir)).present) return
  await runHelper({ workspaceId: lp.workspaceId, copy: { dir, readOnly: false }, network: false, timeoutMs: BRANCH_WORK_SITE_BUDGET_MS }, { op: 'removeCopy' })
  const inBoundary = boundaryCopyOf(dir)
  const removed = inBoundary
    ? withClones(inBoundary.boundary, false, async clones => { if (clones) await fs.rmdir(inDir(clones, inBoundary.copyId)) })
    : fs.rmdir(dir)
  await removed.catch(err => logger.warn(`Could not remove the copy of a live preview at ${lp.copyId}: ${String(err)}`))
}

/** The branch's head in a live preview's own copy, read by the helper; null when it cannot be read. */
export async function ownCopyHead(lp: Of & { branch: string }): Promise<string | null> {
  const answer = await previewHelper(
    { workspaceId: lp.workspaceId, copy: { dir: copyPlaceOf(lp).hostDir, readOnly: true }, network: false, timeoutMs: BRANCH_WORK_SITE_BUDGET_MS },
    { op: 'copyHead', branch: lp.branch }, `the head of live preview copy ${lp.copyId}`,
  )
  return answer && typeof answer.head === 'string' ? answer.head : null
}

export type { Placed }

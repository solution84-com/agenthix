/**
 * What *Live preview* shows before one starts (live preview spec section 5): the branch's live preview when it has one,
 * HQ's pick of site with how full it is, the other allowed sites, and, when the workspace's own site is full, the live
 * previews open there (whose, which branch, when last used) with *Stop* on the person's own, or on any in the project
 * for a project Admin. Reads only.
 *
 * It answers from hq's own records wherever hq holds them: a branch's row says Git is on, and the branch's live preview
 * and copy are hq's rows. The site is asked only whether Git is on for a workspace hq has no branch or live preview
 * of, and that answer is shared between reads (`gitOnShared`), so a screen reading it again and again starts nothing.
 */
import { HttpError, prisma } from 'wasp/server'
import { reachWorkspace } from '../branches/workspaceAccess'
import { peopleByIds } from '../server/identity/people'
import { projectStanding } from '../projects/membership'
import { branchListOf, liveAppsHaveAddress, NO_ADDRESS } from './opening'
import { openBranchById } from '../branches/branchRows'
import { NOTHING } from './words'
import type { ReachedWorkspace } from '../branches/workspaceAccess'
import { hasRoom, pickSite, siteChoices, type SiteChoice } from './sites'
import { lastStoppedOn, livePreviewOn, livePreviewsOnSite, type Slot } from './store'
import { stopperOf, viewOf } from './views'
import type { LivePreviewPlaces, LivePreviewSiteView, OpenLivePreviewLine } from './types'

const siteView = (c: SiteChoice): LivePreviewSiteView => ({ executionSiteId: c.executionSiteId, name: c.name, open: c.open, limit: c.limit })

export async function getLivePreviewPlaces(userId: string, workspaceId: unknown, branchId: unknown): Promise<LivePreviewPlaces> {
  const ws = await reachWorkspace(workspaceId, userId, 'read')
  const target = await slotOf(ws, branchId ?? null)
  const needsGit = target.branchId === null && !(await gitOn(ws))
  let empty: LivePreviewPlaces = { current: null, mayStart: ws.canAct, blocked: null, needsGit, picked: null, others: [], full: null, lastStopped: null }
  if (needsGit) return empty
  const current = await livePreviewOn(prisma, target)
  if (current) return { ...empty, current: await viewOf(current, userId, ws.canAct) }
  empty = { ...empty, lastStopped: stoppedLine(await lastStoppedOn(prisma, target)) }
  if (!liveAppsHaveAddress()) return { ...empty, blocked: NO_ADDRESS }
  const choices = await siteChoices(ws.executionSiteId)
  const picked = pickSite(choices)
  const others = choices.filter(c => c !== picked).map(c => ({ ...siteView(c), blocked: c.blocked, full: !hasRoom(c) }))
  const own = choices.find(c => c.isWorkspaceSite)
  let full: LivePreviewPlaces['full'] = null
  if (own && !own.blocked && !hasRoom(own)) full = { site: siteView(own), open: await openOn(own.executionSiteId, userId) }
  const blocked = picked ? null : choices.length === 0
    ? 'No site runs live previews now. A fleet admin turns them on for a site in the Fleet Console.'
    : full ? null : 'No site that runs live previews can take one now.'
  return { ...empty, picked: picked ? siteView(picked) : null, others, full, blocked }
}

/** The branch (or `main`) by hq's own rows: a branch that is not open is refused, as starting one would be. */
async function slotOf(ws: ReachedWorkspace, branchId: unknown): Promise<Slot> {
  if (branchId === null || branchId === undefined) return { workspaceId: ws.ref.workspaceId, branchId: null }
  const branch = await openBranchById(ws.ref.workspaceId, branchId)
  if (!branch) throw new HttpError(404, `That branch is not open any more. Reload to see where it stands. ${NOTHING}`)
  return { workspaceId: ws.ref.workspaceId, branchId: branch.id }
}

/** Whether Git is on: known from any branch or live preview hq holds of the workspace, otherwise asked of its site. */
async function gitOn(ws: ReachedWorkspace): Promise<boolean> {
  const workspaceId = ws.ref.workspaceId
  const [branches, previews] = await Promise.all([
    prisma.workspaceBranch.count({ where: { workspaceId } }),
    prisma.livePreview.count({ where: { workspaceId } }),
  ])
  if (branches > 0 || previews > 0) return true
  return gitOnShared(workspaceId, async () => {
    try {
      await branchListOf(ws)
      return true
    } catch (err) {
      if (err instanceof HttpError && (err.data as { code?: string } | undefined)?.code === 'notRepository') return false
      throw err
    }
  })
}

/** How long a site's answer that Git is on is kept; Git is never turned off, so only a "no" is asked again soon. */
const GIT_ON_KEPT_MS = 60_000
const gitAsked = new Map<string, { at: number; answer: Promise<boolean> }>()

/** One question to the site at a time per workspace, and its yes kept a minute. A failure is not kept. */
export function gitOnShared(workspaceId: string, ask: () => Promise<boolean>, now = Date.now()): Promise<boolean> {
  const hit = gitAsked.get(workspaceId)
  if (hit && now - hit.at < GIT_ON_KEPT_MS) return hit.answer
  const answer = ask().then(
    yes => { if (!yes && gitAsked.get(workspaceId)?.answer === answer) gitAsked.delete(workspaceId); return yes },
    err => { if (gitAsked.get(workspaceId)?.answer === answer) gitAsked.delete(workspaceId); throw err },
  )
  gitAsked.set(workspaceId, { at: now, answer })
  if (gitAsked.size > 5_000) gitAsked.delete(gitAsked.keys().next().value as string)
  return answer
}

export function __resetGitOnForTests(): void {
  gitAsked.clear()
}

type StoppedRow = { reason: string | null; detail: string | null; stoppedAt: Date | null; since: Date } | null

/** Only a stop with HQ's sentence kept is shown: the row holds no site's words. */
export function stoppedLine(row: StoppedRow): LivePreviewPlaces['lastStopped'] {
  if (!row?.reason || !row.detail) return null
  return { reason: row.reason, detail: row.detail, at: (row.stoppedAt ?? row.since).toISOString() }
}

async function openOn(executionSiteId: string, userId: string): Promise<OpenLivePreviewLine[]> {
  const rows = await livePreviewsOnSite(executionSiteId)
  const people = await peopleByIds([...new Set(rows.map(r => r.userId))])
  return Promise.all(rows.map(async r => {
    // A live preview of a place the person cannot read says only that it is someone else's.
    const sees = r.ownerType === 'user' ? r.ownerId === userId : (await projectStanding(r.ownerId, userId)) !== 'none'
    return {
      livePreviewId: r.id,
      workspaceName: sees ? r.workspaceName ?? 'A workspace' : 'Another place',
      branch: sees ? r.branch : '',
      person: { id: r.userId, name: people.get(r.userId)?.name ?? 'Someone' },
      lastUsedAt: r.lastUsedAt.toISOString(),
      mayStop: (await stopperOf(r, userId)) !== null,
    }
  }))
}

/**
 * Code work when a run starts (live preview spec, *Which work is code work*, *Branch names*): a run whose work names a
 * workspace that is a Git repository works on that work's own branch, in its own copy. The first run makes the branch
 * (named from the work) and its copy through the site; a later run uses the same copy, or makes a fresh one in the
 * same folder when it was removed. The site decides "is a Git repository" from the folder (`not_repository`), never an agent.
 *
 * Making a branch and its copy is serialised per piece of work and per workspace's names (`branchRows.ts`'s locks):
 * the rows are written under the locks, the site is asked outside them. A dispatch marks its branch as starting until
 * the caller releases it, so a merge or a delete in that moment leaves the copy alone (`working.ts`).
 */
import { randomUUID } from 'node:crypto'
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import {
  BRANCH_READ_METHODS, BRANCH_WORK_METHODS, BRANCH_WORK_TIMEOUT_MS, BranchWorkError, branchNameFromWork,
  type BranchListResult, type RunCodeWork, type RunOtherBranch,
} from '@agenthix/core'
import { siteCall } from './siteCalls'
import { locateWorkspace } from './workspaceLocation'
import {
  liveCopyOf, lockWork, lockWorkspaceNames, mergeBaseOf, openBranchOfWork, openBranches, type WorkOf,
} from './branchRows'
import { agentsWorking, doneStarting, markStarting } from './working'
import { emitBranchChange } from './workspaceEvents'
import { whoseLines } from './whose'
import { gitPersonForAgent, gitPersonForUser } from './gitPeople'
import { Logger } from '../server/utils/logger'

const logger = new Logger('CodeWork')

export type CodeWorkAsk = {
  work: WorkOf
  workspaceId: string
  /** The storage the run works in: a workspace of another owner is not this run's to work on. */
  owner: { type: 'project' | 'user'; id: string }
  /** The person the work is for. */
  personId: string
  /** The run's agent: the author of the commit the site makes at the run's end. */
  agentId: string
  /** What the branch is named from: the task's title, or what the person first asked. */
  nameFrom: string
  /** The site the run is dispatched to: the copy must be on it. */
  runSiteId: string
}

export type PreparedCodeWork = { codeWork: RunCodeWork; branchId: string; release: () => void }

/** How many times a new branch's name is tried again when the repository took it first. */
const NAME_TRIES = 3

export async function prepareCodeWork(ask: CodeWorkAsk): Promise<PreparedCodeWork | null> {
  const ws = await locateWorkspace(ask.workspaceId)
  if (!ws || ws.ref.ownerType !== ask.owner.type || ws.ref.ownerId !== ask.owner.id) return null
  const list = await branchList(ws.logicalSiteId, ws.ref)
  if (!list) return null
  if (ws.logicalSiteId !== ask.runSiteId) {
    throw new HttpError(409, `This work's workspace ${ws.name} is on another site than the one its run goes to, so it cannot work on its branch there. Nothing was changed.`)
  }

  const taken = new Set(list.branches.map(b => b.name).concat(list.main.name))
  let made: Made
  for (let attempt = 0; ; attempt++) {
    made = await rowsFor(ask, ws.executionSiteId, taken)
    markStarting(made.branchId)
    try {
      await askSite(ws.logicalSiteId, ws.ref, made)
      break
    } catch (err) {
      doneStarting(made.branchId)
      await undo(made)
      if (err instanceof BranchWorkError && err.code === 'branch_exists' && made.isNew && attempt + 1 < NAME_TRIES) {
        taken.add(made.name)
        continue
      }
      throw err
    }
  }
  if (made.isNew) emitBranchChange({ workspaceId: ask.workspaceId, id: made.branchId, name: made.name }, 'created')
  const release = once(() => doneStarting(made.branchId))
  try {
    return { codeWork: await codeWorkFacts(ws.logicalSiteId, ws.ref, list, made, ask), branchId: made.branchId, release }
  } catch (err) {
    release()
    throw err
  }
}

async function branchList(logicalSiteId: string, ref: RunCodeWork['workspace']): Promise<BranchListResult | null> {
  const rows = await openBranches(ref.workspaceId)
  const merged = rows.flatMap(r => { const base = mergeBaseOf(r); return base ? [{ branch: r.name, base }] : [] })
  try {
    return await siteCall(logicalSiteId, BRANCH_READ_METHODS.list, { workspace: ref, merged })
  } catch (err) {
    if (err instanceof BranchWorkError && err.code === 'not_repository') return null
    throw err
  }
}

type Made = { branchId: string; name: string; copyRowId: string; copyId: string; isNew: boolean; branchExisted: boolean }

/** The branch's and the copy's rows, under the locks: the open branch of this work, or a new one with a free name. */
async function rowsFor(ask: CodeWorkAsk, executionSiteId: string, takenInRepo: ReadonlySet<string>): Promise<Made> {
  return prisma.$transaction(async (tx) => {
    await lockWork(tx, ask.work)
    await lockWorkspaceNames(tx, ask.workspaceId)
    const open = await openBranchOfWork(tx, ask.workspaceId, ask.work)
    if (open) {
      const live = liveCopyOf(open)
      if (live?.state === 'READY') return { branchId: open.id, name: open.name, copyRowId: live.id, copyId: live.folderId, isNew: false, branchExisted: true }
      if (live?.state === 'MAKING') {
        if (Date.now() - live.createdAt.getTime() < BRANCH_WORK_TIMEOUT_MS) {
          throw new HttpError(409, "This work's branch is still being made on its site. Try again in a moment. Nothing was changed.")
        }
        // A copy asked for long ago and never confirmed: asked to go, and a fresh one made.
        await tx.branchCopy.update({ where: { id: live.id }, data: { state: 'REMOVING' } })
      }
      const copy = await freshCopyOf(tx, open.id, executionSiteId)
      return { branchId: open.id, name: open.name, copyRowId: copy.id, copyId: copy.folderId, isNew: false, branchExisted: true }
    }
    const inHq = await tx.workspaceBranch.findMany({ where: { workspaceId: ask.workspaceId, state: 'OPEN' }, select: { name: true } })
    const takenHere = new Set(inHq.map(b => b.name))
    const name = branchNameFromWork(ask.nameFrom, n => takenInRepo.has(n) || takenHere.has(n))
    const branch = await tx.workspaceBranch.create({
      data: {
        workspaceId: ask.workspaceId, ownerType: ask.owner.type, ownerId: ask.owner.id, name, userId: ask.personId,
        ...('taskId' in ask.work ? { taskId: ask.work.taskId } : { conversationId: ask.work.conversationId }),
      },
    })
    const copy = await tx.branchCopy.create({ data: { branchId: branch.id, siteId: executionSiteId, folderId: randomUUID() } })
    return { branchId: branch.id, name, copyRowId: copy.id, copyId: copy.folderId, isNew: true, branchExisted: false }
  })
}

/**
 * A fresh copy for an open branch whose copy was removed. It takes the folder of the branch's last copy on this site
 * when that one is gone, because the run's working folder is fixed for the work's life: the agent's harness keeps the
 * folder its conversation started in, and resumes only there. A last copy still being removed leaves its folder to
 * that removal, and the fresh copy gets a folder of its own.
 */
async function freshCopyOf(tx: Prisma.TransactionClient, branchId: string, siteId: string) {
  const last = await tx.branchCopy.findFirst({ where: { branchId, siteId }, orderBy: { createdAt: 'desc' } })
  if (last?.state === 'REMOVED') {
    return tx.branchCopy.update({ where: { id: last.id }, data: { state: 'MAKING', removedAt: null, createdAt: new Date() } })
  }
  return tx.branchCopy.create({ data: { branchId, siteId, folderId: randomUUID() } })
}

async function askSite(logicalSiteId: string, ref: RunCodeWork['workspace'], made: Made): Promise<void> {
  const live = await prisma.branchCopy.findUnique({ where: { id: made.copyRowId }, select: { state: true } })
  if (live?.state === 'READY') return
  if (made.isNew) await siteCall(logicalSiteId, BRANCH_WORK_METHODS.create, { workspace: ref, copyId: made.copyId, branch: made.name })
  else await siteCall(logicalSiteId, BRANCH_WORK_METHODS.copy, { workspace: ref, copyId: made.copyId, branch: made.name })
  await prisma.branchCopy.update({ where: { id: made.copyRowId }, data: { state: 'READY' } })
}

/** The site made nothing: the copy's row goes, and a branch made for this attempt with it. */
async function undo(made: Made): Promise<void> {
  try {
    const copy = await prisma.branchCopy.findUnique({ where: { id: made.copyRowId }, select: { state: true } })
    if (copy?.state !== 'MAKING') return
    await prisma.branchCopy.update({ where: { id: made.copyRowId }, data: { state: 'REMOVED', removedAt: new Date() } })
    if (made.isNew) await prisma.workspaceBranch.delete({ where: { id: made.branchId } })
  } catch (err) {
    logger.warn(`could not undo the rows of a branch the site did not make: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** What the run's prompt says of its branch and the others (`codeWorkPromptText`), and whom its last commit names. */
async function codeWorkFacts(
  logicalSiteId: string, ref: RunCodeWork['workspace'], list: BranchListResult, made: Made, ask: Pick<CodeWorkAsk, 'agentId' | 'personId'>,
): Promise<RunCodeWork> {
  const line = list.branches.find(b => b.name === made.name)
  const others = (await openBranches(ref.workspaceId)).filter(b => b.id !== made.branchId)
  const [whose, working, author, onBehalfOf] = await Promise.all([
    whoseLines(others),
    agentsWorking(logicalSiteId, ref, others).catch(() => new Map<string, string>()),
    gitPersonForAgent(ask.agentId),
    ask.personId ? gitPersonForUser(ask.personId) : Promise.resolve(null),
  ])
  const otherBranches: RunOtherBranch[] = others.map(b => ({
    name: b.name,
    whose: whose.get(b.id) ?? 'Someone',
    ahead: list.branches.find(l => l.name === b.name)?.ahead ?? 0,
    agentWorking: working.get(b.id) ?? null,
  }))
  return {
    workspace: ref,
    copyId: made.copyId,
    branch: made.name,
    main: list.main.name,
    // A branch just made from main's tip lacks nothing.
    behindMain: made.branchExisted ? line?.behind ?? 0 : 0,
    otherBranches,
    // The same names as hq's own `branch.commit`, so every commit of the agent's reads alike.
    author,
    onBehalfOf,
  }
}

function once(fn: () => void): () => void {
  let done = false
  return () => { if (!done) { done = true; fn() } }
}

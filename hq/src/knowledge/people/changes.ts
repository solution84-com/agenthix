/**
 * A person's changes to a place's knowledge (agent knowledge spec, part 2, *The gate*; ADR-0151): Save, Move, Delete,
 * Delete permanently and Restore. Each is checked here first — the person may change the place (part 4, *Who reaches
 * what*) — then made through the site's gate, and every change the gate accepts is recorded in hq with the person
 * (G5). A refusal of the gate is an answer the screen shows on its fields, not a failure; a conflict also says who made
 * the change the person's text would have gone over.
 */
import { KNOWLEDGE_LIMITS, knowledgeProblem, type KnowledgeChangeKind, type KnowledgeChangeResult } from '@agenthix/core'
import { versionOf } from '@agenthix/core/file-tools'
import type { KnowledgeChangeEntry } from '../deps'
import { KnowledgeRefusal, type OwnerAccess, type PeopleKnowledgeDeps } from './deps'
import { requireVersionId } from './reads'
import { fromSite, requirePageName } from './site'
import type { KnowledgeChangeAnswer, KnowledgeOwner } from './types'

const UNCHANGED = 'Nothing was changed.'

async function changeAccess(deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, userId: string): Promise<OwnerAccess> {
  const access = await deps.open(owner, userId)
  if (access.canChange) return access
  const who = access.ref.ownerType === 'org'
    ? "Only an organisation admin can change the organisation's knowledge; ask one of them."
    : "Changing this project's knowledge needs the Member or Admin role in it; ask one of its admins."
  throw new KnowledgeRefusal(403, `${who} ${UNCHANGED}`)
}

async function record(deps: PeopleKnowledgeDeps, access: OwnerAccess, userId: string, entry: { page: string; kind: KnowledgeChangeKind; version: string }): Promise<void> {
  const full: KnowledgeChangeEntry = { owner: access.ref, ...entry, reach: { userId } }
  try {
    await deps.recordChange(full)
  } catch (err) {
    // The change stands on the site; only its record is missing, which the log says.
    deps.log.warn('a knowledge change was made but not recorded', { kind: entry.kind, error: err instanceof Error ? err.name : 'unknown' })
  }
}

/** A conflict's answer, with who made the version that is there now. */
async function withLastChange(deps: PeopleKnowledgeDeps, access: OwnerAccess, page: string, result: KnowledgeChangeResult): Promise<KnowledgeChangeAnswer> {
  if (result.outcome !== 'refused' || result.reason !== 'conflict' || !result.current) return result
  const last = (await deps.authors.lastChanges(access.ref, [{ page, version: result.current.version }])).get(page)
  return last ? { ...result, lastChange: last } : result
}

function tooLarge(page: string, content: string): KnowledgeChangeResult | null {
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes <= KNOWLEDGE_LIMITS.maxPageBytes) return null
  const problem = knowledgeProblem.tooLarge(bytes)
  return { outcome: 'refused', reason: 'problems', problems: [problem], message: `${page} was not saved: ${problem.message}. ${UNCHANGED}` }
}

export async function savePage(
  deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, input: { page: unknown; content: string; baseVersion: string | null }, userId: string,
): Promise<KnowledgeChangeAnswer> {
  const page = requirePageName(input.page, true)
  const access = await changeAccess(deps, owner, userId)
  const large = tooLarge(page, input.content)
  if (large) return large
  const result = await fromSite(deps, 'write', true, () => deps.sites.write(access.ref, { page, content: input.content, baseVersion: input.baseVersion }))
  if (result.outcome === 'refused') return withLastChange(deps, access, page, result)
  await record(deps, access, userId, { page, kind: result.change, version: result.version ?? versionOf(Buffer.from(input.content, 'utf8')) })
  return result
}

/**
 * A move is a write under the new name and a delete of the old one, each through the gate and each recorded. The
 * page must still be the version the person opened. If the old one cannot then be deleted, the new one is removed
 * again, so a page is never left under both names.
 */
export async function movePage(
  deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, input: { from: unknown; to: unknown; baseVersion: string }, userId: string,
): Promise<KnowledgeChangeAnswer> {
  const from = requirePageName(input.from, true)
  const to = requirePageName(input.to, true)
  if (from === to) throw new KnowledgeRefusal(400, `A page moves to a new name; ${to} is the name it has. ${UNCHANGED}`)
  const access = await changeAccess(deps, owner, userId)
  const bytes = await fromSite(deps, 'read', true, () => deps.sites.read(access.ref, from))
  const content = Buffer.from(bytes).toString('utf8')
  const version = versionOf(bytes)
  if (version !== input.baseVersion) {
    const conflict: KnowledgeChangeResult = {
      outcome: 'refused', reason: 'conflict', current: { content, version },
      message: `${from} changed since you opened it. Its current text is attached: look at it, then move it again. ${UNCHANGED}`,
    }
    return withLastChange(deps, access, from, conflict)
  }
  const written = await fromSite(deps, 'write', true, () => deps.sites.write(access.ref, { page: to, content, baseVersion: null, movedFrom: from }))
  if (written.outcome === 'refused') return withLastChange(deps, access, to, written)

  let removed: KnowledgeChangeResult | null = null
  try {
    removed = await fromSite(deps, 'delete', true, () => deps.sites.delete(access.ref, { page: from, movedTo: to }))
  } catch (err) {
    await undoWrite(deps, access, to)
    throw err
  }
  if (removed.outcome === 'refused') {
    await undoWrite(deps, access, to)
    return removed
  }
  await record(deps, access, userId, { page: to, kind: 'moved', version: written.version ?? version })
  await record(deps, access, userId, { page: from, kind: 'moved', version })
  return written
}

async function undoWrite(deps: PeopleKnowledgeDeps, access: OwnerAccess, page: string): Promise<void> {
  try {
    const undone = await deps.sites.delete(access.ref, { page, permanently: true })
    if (undone.ok && undone.value.outcome === 'done') return
  } catch {
    // Logged below, as when the site answers.
  }
  deps.log.warn('a moved page could not be removed from its new name after the old one stayed', { ownerType: access.ref.ownerType })
}

/**
 * Delete keeps the page among the recently deleted; `permanently` removes it and every version at once, or with
 * `versionId` that one kept version only.
 */
export async function deletePage(
  deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, input: { page: unknown; permanently?: boolean; versionId?: unknown }, userId: string,
): Promise<KnowledgeChangeAnswer> {
  const page = requirePageName(input.page, true)
  const versionId = input.versionId === undefined || input.versionId === null ? undefined : requireVersionId(input.versionId, true)
  if (versionId && !input.permanently) throw new KnowledgeRefusal(400, `One earlier version can only be deleted permanently. ${UNCHANGED}`)
  const access = await changeAccess(deps, owner, userId)
  if (input.permanently) {
    const result = await fromSite(deps, 'delete', true, () => deps.sites.delete(access.ref, { page, permanently: true, ...(versionId ? { versionId } : {}) }))
    // Nothing of a permanently deleted page is kept, so its record has no version to join on.
    if (result.outcome === 'done') await record(deps, access, userId, { page, kind: 'deleted', version: '' })
    return result
  }
  const current = await deps.sites.read(access.ref, page).catch(() => null)
  const result = await fromSite(deps, 'delete', true, () => deps.sites.delete(access.ref, { page }))
  if (result.outcome === 'done') await record(deps, access, userId, { page, kind: 'deleted', version: current?.ok ? versionOf(current.value) : '' })
  return result
}

/** A kept version saved back as the page, through the gate, as a new version; a deleted page comes back so too. */
export async function restoreVersion(
  deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, input: { page: unknown; versionId: unknown }, userId: string,
): Promise<KnowledgeChangeAnswer> {
  const page = requirePageName(input.page, true)
  const versionId = requireVersionId(input.versionId, true)
  const access = await changeAccess(deps, owner, userId)
  const result = await fromSite(deps, 'restore', true, () => deps.sites.restore(access.ref, { page, versionId }))
  if (result.outcome === 'done' && result.version) await record(deps, access, userId, { page, kind: 'restored', version: result.version })
  return result
}

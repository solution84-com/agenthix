/**
 * The draft of a skill in a place's files (spec part 4 FV1; D25; security review H5): the same editor and draft as the
 * Library's, kept in hq and never in the place's live folder, so no agent sees it. Anyone who may write the place edits
 * it; each save is a revision with its author. A repository's skills are not drafted in hq (FV6). *New skill* makes a
 * place skill that exists only as its draft until it is first published.
 */
import type { PlaceSkill, PrismaClient } from '@prisma/client'
import { agentSkillsRoot, isAssetName, PLACE_SKILLS_ROOT } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import type { PackageFile } from '../../library/packages/packageZip'
import { readContent, releaseContent, storeContent } from '../content'
import type { Actor } from '../policy'
import { validateSkill } from '../validation'
import { DraftError, draftFiles, saveRefusal, starterFiles, whenNoOneElseWasFirst, type StarterShape } from '../lifecycle/drafts'
import { authorOf } from '../lifecycle/draftStore'
import { fileChanges, type FileChanges } from '../lifecycle/versions'
import { assertNotWorkspace, assertPlace, folderOf, placeOfProject, placeOfSkill, type PlaceContext } from './place'
import { placeTreeProblem } from './treeBounds'
import { readSkillFolder } from './siteSkills'

const NOTHING = 'Nothing was changed.'
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

/** A place skill runs under its folder's name. */
export const skillNameOf = (skill: Pick<PlaceSkill, 'path'>) => skill.path.slice(skill.path.lastIndexOf('/') + 1)

export async function newestVersion(db: Db, placeSkillId: string) {
  return db.placeSkillVersion.findFirst({ where: { placeSkillId }, orderBy: { number: 'desc' } })
}

/** What the skill holds now: its live files, or its newest version when its folder is gone. */
export async function liveFiles(db: Db, ctx: PlaceContext, skill: PlaceSkill): Promise<PackageFile[]> {
  if (!skill.goneAt) {
    const { loc, dir } = folderOf(ctx, skill)
    return readSkillFolder(loc, dir)
  }
  const newest = await newestVersion(db, skill.id)
  return newest ? readContent(newest.digest, db) : []
}

export function checkedSkill(name: string, files: PackageFile[]): string[] {
  const { errors, warnings } = validateSkill(name, files)
  if (errors.length) throw new DraftError(`${errors.join(' ')} ${NOTHING}`)
  return warnings
}

/** A skill that will be published to a place also fits the bounds the place's site holds a folder to. */
export function checkedPlaceSkill(name: string, files: PackageFile[]): string[] {
  const tooLarge = placeTreeProblem(files.map(f => f.path))
  if (tooLarge) throw new DraftError(`${tooLarge} ${NOTHING}`)
  return checkedSkill(name, files)
}

export type PlaceDraftView = {
  path: string
  revision: number | null
  files: { path: string; base64: string }[]
  revisions: { number: number; authorId: string | null; proposedByAgentId: string | null; at: Date }[]
  /** From the newest published version to what is shown; every file, scripts included. */
  changes: FileChanges
  newestVersion: number | null
  warnings: string[]
}

async function editable(db: Db, actor: Actor, placeSkillId: unknown) {
  const found = await placeOfSkill(db, placeSkillId)
  assertPlace(actor, 'editDraft', found.ctx)
  assertNotWorkspace(found.skill, 'Editing')
  return found
}

/** The draft, or what the skill holds now when there is none (revision null). */
export async function readPlaceDraft(db: PrismaClient, actor: Actor, placeSkillId: unknown): Promise<PlaceDraftView> {
  const { ctx, skill } = await editable(db, actor, placeSkillId)
  const draft = await db.draft.findUnique({ where: { placeSkillId: skill.id }, include: { revisions: { orderBy: { number: 'asc' } } } })
  const newest = await newestVersion(db, skill.id)
  const published = newest ? await readContent(newest.digest, db) : []
  const files = draft ? await readContent(draft.digest, db) : await liveFiles(db, ctx, skill)
  return {
    path: skill.path,
    revision: draft?.revision ?? null,
    files: files.map(f => ({ path: f.path, base64: f.content.toString('base64') })),
    revisions: (draft?.revisions ?? []).map(r => ({ number: r.number, authorId: r.authorId, proposedByAgentId: r.proposedByAgentId, at: r.createdAt })),
    changes: fileChanges(published, files),
    newestVersion: newest?.number ?? null,
    warnings: files.length ? validateSkill(skillNameOf(skill), files).warnings : [],
  }
}

export type PlaceSaveInput = { placeSkillId: unknown; files: unknown; revision?: number | null; conversationId?: string | null }

export async function savePlaceDraft(db: PrismaClient, actor: Actor, input: PlaceSaveInput): Promise<{ revision: number; warnings: string[] }> {
  const { skill } = await editable(db, actor, input.placeSkillId)
  const files = draftFiles(input.files, { manifestAllowed: true })
  const warnings = checkedPlaceSkill(skillNameOf(skill), files)
  const author = authorOf(actor, input.conversationId ?? null)
  const seen = input.revision === null || typeof input.revision === 'number' ? input.revision : undefined
  return whenNoOneElseWasFirst(() => db.$transaction(async tx => {
    const draft = await tx.draft.findUnique({ where: { placeSkillId: skill.id } })
    const refusal = saveRefusal(draft?.revision ?? null, seen)
    if (refusal) throw new DraftError(refusal, 409)
    const digest = await storeContent(files, tx)
    if (!draft) {
      const made = await tx.draft.create({ data: { placeSkillId: skill.id, revision: 1, digest } })
      await tx.draftRevision.create({ data: { draftId: made.id, number: 1, digest, ...author } })
      return { revision: 1, warnings }
    }
    if (draft.digest === digest) return { revision: draft.revision, warnings }
    const next = draft.revision + 1
    const { count } = await tx.draft.updateMany({ where: { id: draft.id, revision: draft.revision }, data: { revision: next, digest } })
    if (count === 0) throw new DraftError(`Someone saved this draft at the same moment. Open it again. ${NOTHING}`, 409)
    await tx.draftRevision.create({ data: { draftId: draft.id, number: next, digest, ...author } })
    return { revision: next, warnings }
  }, TRANSACTION), `Someone saved this draft at the same moment. Open it again. ${NOTHING}`)
}

/** The draft goes, its content released. A new skill that was never published goes with it. */
export async function discardPlaceDraft(db: PrismaClient, actor: Actor, input: { placeSkillId: unknown; revision: unknown }): Promise<{ skillRemoved: boolean }> {
  const { skill } = await editable(db, actor, input.placeSkillId)
  return db.$transaction(async tx => {
    const draft = await tx.draft.findUnique({ where: { placeSkillId: skill.id }, include: { revisions: { select: { digest: true } } } })
    if (!draft) throw new DraftError(`There is no draft to discard. ${NOTHING}`, 404)
    if (draft.revision !== input.revision) throw new DraftError(`The draft changed since you looked at it (revision ${draft.revision}). Look again before discarding it. ${NOTHING}`, 409)
    // The revision is checked in the delete itself, so a save that landed since the read is never discarded unseen.
    const { count } = await tx.draft.deleteMany({ where: { id: draft.id, revision: draft.revision } })
    if (count === 0) throw new DraftError(`The draft changed as you discarded it. Look again before discarding it. ${NOTHING}`, 409)
    const unpublished = skill.lastFingerprint === null && (await tx.placeSkillVersion.count({ where: { placeSkillId: skill.id } })) === 0
    if (unpublished) await tx.placeSkill.delete({ where: { id: skill.id } })
    for (const digest of new Set([draft.digest, ...draft.revisions.map(r => r.digest)])) await releaseContent(digest, tx)
    return { skillRemoved: unpublished }
  }, TRANSACTION)
}

export type NewPlaceSkillInput = { projectId: unknown; name: unknown; description: unknown; shape?: unknown; agentId?: unknown; conversationId?: string | null }

/** *New skill* in a place, for every agent there or for one: a draft only, until it is first published. */
export async function createPlaceSkill(db: PrismaClient, actor: Actor, input: NewPlaceSkillInput): Promise<{ placeSkillId: string; path: string; revision: number }> {
  const ctx = await placeOfProject(db, input.projectId)
  assertPlace(actor, 'editDraft', ctx)
  const name: string = typeof input.name === 'string' ? input.name.trim() : ''
  if (!isAssetName(name)) throw new DraftError(`The name “${String(name).slice(0, 80)}” must be 1 to 64 lowercase letters, digits and single hyphens. ${NOTHING}`)
  const agentId = typeof input.agentId === 'string' && input.agentId !== '' ? input.agentId : null
  const root = agentId ? agentSkillsRoot(agentId) : PLACE_SKILLS_ROOT
  if (!root || (agentId && !(await db.agent.findUnique({ where: { id: agentId }, select: { id: true } })))) {
    throw new DraftError(`That agent isn't here. ${NOTHING}`, 404)
  }
  const path = `${root}/${name}`
  const files = starterFiles(name, typeof input.description === 'string' ? input.description : '', input.shape === 'scripts' ? 'scripts' : 'plain' as StarterShape)
  checkedPlaceSkill(name, files)
  const taken = await db.placeSkill.findUnique({ where: { placeType_placeId_path: { ...ctx.place, path } } })
  if (taken && (!taken.goneAt || (await db.draft.count({ where: { placeSkillId: taken.id } })) > 0)) {
    throw new DraftError(`This place already has a skill named ${name} there. Choose another name. ${NOTHING}`, 409)
  }
  const author = authorOf(actor, input.conversationId ?? null)
  return whenNoOneElseWasFirst(() => db.$transaction(async tx => {
    const skill = taken ?? await tx.placeSkill.create({ data: { ...ctx.place, path, group: agentId ? 'AGENT' : 'PLACE', agentId } })
    const digest = await storeContent(files, tx)
    const draft = await tx.draft.create({ data: { placeSkillId: skill.id, revision: 1, digest } })
    await tx.draftRevision.create({ data: { draftId: draft.id, number: 1, digest, ...author } })
    return { placeSkillId: skill.id, path, revision: 1 }
  }, TRANSACTION), `This place already has a skill named ${name} there. Choose another name. ${NOTHING}`)
}

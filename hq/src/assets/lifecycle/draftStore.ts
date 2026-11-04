/**
 * The one shared draft of a Library skill (spec part 2 *Editing: draft, then publish*; security review H5): read,
 * saved as a new revision with its author, discarded, and *New skill*, an asset with a draft and no version. No agent
 * sees a draft. Only a skill the organisation made is drafted in place; one another publisher signed is edited
 * through the organisation's own copy (`ownCopy.ts`). Every save passes the validation every save, upload and install
 * passes (`validation.ts`).
 */
import type { PrismaClient } from '@prisma/client'
import { formatAssetIdentity } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { readContent, releaseContent, storeContent } from '../content'
import { organisationPublisher } from '../organisationPublisher'
import type { Actor } from '../policy'
import { validateSkill } from '../validation'
import { DraftError, draftFiles, saveRefusal, starterFiles, whenNoOneElseWasFirst, type StarterShape } from './drafts'
import { assertLibrary, identityOf, librarySkill, type LibrarySkill } from './records'
import { fileChanges, type FileChanges } from './versions'

const NOTHING = 'Nothing was changed.'
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

/** Who made a revision: a person, or the run that proposed it and the person it acted for (H5). */
export type Author = { authorId: string | null; proposedByAgentId: string | null; proposedByRunId: string | null; conversationId: string | null }

export function authorOf(actor: Actor, conversationId: string | null = null): Author {
  if (actor.kind === 'person') return { authorId: actor.userId, proposedByAgentId: null, proposedByRunId: null, conversationId }
  return { authorId: actor.forUserId, proposedByAgentId: actor.agentId, proposedByRunId: actor.runId, conversationId }
}

/** The skill is the organisation's own, so its draft is edited in place. */
export async function assertEditedInPlace(db: Db, asset: LibrarySkill): Promise<void> {
  if (asset.builtIn) throw new DraftError(`${identityOf(asset)} is built into hq and isn't edited. ${NOTHING}`, 409)
  if (asset.publisher !== (await organisationPublisher(db))) {
    throw new DraftError(`${identityOf(asset)} is published by ${asset.publisher}. Editing it makes the organisation's own copy: open it with Edit. ${NOTHING}`, 409)
  }
}

function checked(name: string, files: { path: string; content: Buffer }[]): string[] {
  const { errors, warnings } = validateSkill(name, files)
  if (errors.length) throw new DraftError(`${errors.join(' ')} ${NOTHING}`)
  return warnings
}

export type DraftView = {
  identity: string
  revision: number | null
  files: { path: string; base64: string }[]
  revisions: { number: number; authorId: string | null; proposedByAgentId: string | null; proposedByRunId: string | null; at: Date }[]
  /** From the version in use to the draft; every file, scripts included. */
  changes: FileChanges
  warnings: string[]
}

/** The draft, or the version in use when there is no draft (revision null). */
export async function readDraft(db: Db, actor: Actor, assetId: unknown): Promise<DraftView> {
  await assertLibrary(actor, 'editDraft', db)
  const asset = await librarySkill(db, assetId)
  const draft = await db.draft.findUnique({ where: { assetId: asset.id }, include: { revisions: { orderBy: { number: 'asc' } } } })
  const published = asset.currentVersion ? await readContent(asset.currentVersion.digest, db) : []
  const files = draft ? await readContent(draft.digest, db) : published
  return {
    identity: identityOf(asset),
    revision: draft?.revision ?? null,
    files: files.map(f => ({ path: f.path, base64: f.content.toString('base64') })),
    revisions: (draft?.revisions ?? []).map(r => ({
      number: r.number, authorId: r.authorId, proposedByAgentId: r.proposedByAgentId, proposedByRunId: r.proposedByRunId, at: r.createdAt,
    })),
    changes: fileChanges(published, files),
    warnings: files.length ? validateSkill(asset.name, files).warnings : [],
  }
}

export type SaveInput = { assetId: unknown; files: unknown; revision?: number | null; conversationId?: string | null }

/** Saves the editor's files as the draft's next revision. Returns the revision now newest, and validation's warnings. */
export async function saveDraft(db: PrismaClient, actor: Actor, input: SaveInput): Promise<{ revision: number; warnings: string[] }> {
  await assertLibrary(actor, 'editDraft', db)
  const asset = await librarySkill(db, input.assetId)
  await assertEditedInPlace(db, asset)
  const files = draftFiles(input.files)
  const warnings = checked(asset.name, files)
  const author = authorOf(actor, input.conversationId ?? null)
  const seen = input.revision === null || typeof input.revision === 'number' ? input.revision : undefined
  return whenNoOneElseWasFirst(() => db.$transaction(async tx => {
    const draft = await tx.draft.findUnique({ where: { assetId: asset.id } })
    const refusal = saveRefusal(draft?.revision ?? null, seen)
    if (refusal) throw new DraftError(refusal, 409)
    const digest = await storeContent(files, tx)
    if (!draft) {
      if (asset.currentVersion?.digest === digest) throw new DraftError(`That is the version in use; there is nothing to save. ${NOTHING}`)
      const made = await tx.draft.create({ data: { assetId: asset.id, revision: 1, digest } })
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

/** The draft and its revisions go; their content is released. A new skill that never had a version goes with it. */
export async function discardDraft(db: PrismaClient, actor: Actor, input: { assetId: unknown; revision: unknown }): Promise<{ assetRemoved: boolean }> {
  await assertLibrary(actor, 'editDraft', db)
  const asset = await librarySkill(db, input.assetId)
  return db.$transaction(async tx => {
    const draft = await tx.draft.findUnique({ where: { assetId: asset.id }, include: { revisions: { select: { digest: true } } } })
    if (!draft) throw new DraftError(`There is no draft to discard. ${NOTHING}`, 404)
    if (draft.revision !== input.revision) throw new DraftError(`The draft changed since you looked at it (revision ${draft.revision}). Look again before discarding it. ${NOTHING}`, 409)
    // The revision is checked in the delete itself, so a save that landed since the read is never discarded unseen.
    const { count } = await tx.draft.deleteMany({ where: { id: draft.id, revision: draft.revision } })
    if (count === 0) throw new DraftError(`The draft changed as you discarded it. Look again before discarding it. ${NOTHING}`, 409)
    const unversioned = asset.currentVersionId === null && (await tx.assetVersion.count({ where: { assetId: asset.id } })) === 0
    if (unversioned) await tx.asset.delete({ where: { id: asset.id } })
    for (const digest of new Set([draft.digest, ...draft.revisions.map(r => r.digest)])) await releaseContent(digest, tx)
    return { assetRemoved: unversioned }
  }, TRANSACTION)
}

export type NewSkillInput = { name: unknown; description: unknown; shape?: unknown; conversationId?: string | null }

/** *New skill*: the organisation's asset with a first draft and no version; its first publish is 1.0.0. */
export async function createNewSkill(db: PrismaClient, actor: Actor, input: NewSkillInput): Promise<{ assetId: string; identity: string; revision: number }> {
  await assertLibrary(actor, 'editDraft', db)
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const description = typeof input.description === 'string' ? input.description : ''
  const shape: StarterShape = input.shape === 'scripts' ? 'scripts' : 'plain'
  const files = starterFiles(name, description, shape)
  checked(name, files)
  const publisher = await organisationPublisher(db)
  const identity = formatAssetIdentity({ publisher, name })
  const taken = await db.asset.findUnique({ where: { kind_publisher_name: { kind: 'SKILL', publisher, name } }, select: { removedAt: true } })
  if (taken) {
    throw new DraftError(taken.removedAt
      ? `${identity} was removed from the Library; it keeps its name and history. Choose another name. ${NOTHING}`
      : `The Library already has ${identity}. Choose another name. ${NOTHING}`, 409)
  }
  const author = authorOf(actor, input.conversationId ?? null)
  return whenNoOneElseWasFirst(() => db.$transaction(async tx => {
    const asset = await tx.asset.create({ data: { kind: 'SKILL', publisher, name } })
    const digest = await storeContent(files, tx)
    const draft = await tx.draft.create({ data: { assetId: asset.id, revision: 1, digest } })
    await tx.draftRevision.create({ data: { draftId: draft.id, number: 1, digest, ...author } })
    return { assetId: asset.id, identity, revision: 1 }
  }, TRANSACTION), `The Library already has ${identity}. Choose another name. ${NOTHING}`)
}

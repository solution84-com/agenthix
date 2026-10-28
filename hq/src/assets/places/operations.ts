/**
 * A place's skills as Wasp operations (spec part 4; adr-0159, adr-0072): the Skills page and looking at the place
 * again, the default and the switches, drafts and publishing, history, roll back and put back, adding from the Library
 * and removing. Each acts as the signed-in person; the policy is checked by what it calls. Only what a person chooses
 * is read from the request: who asked for it is never. Hosted in `assets.wasp.ts`.
 */
import { HttpError, prisma } from 'wasp/server'
import { LocationFileError } from '@agenthix/core'
import { asHttp } from '../operations'
import { personActor } from '../policyActors'
import type { PersonActor } from '../policy'
import { LifecycleError } from '../lifecycle/errors'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { addToPlace, removeFromPlace } from './addRemove'
import { placeSkillFiles, placeSkillVersions } from './history'
import { listPlaceSkills, scanPlace } from './list'
import { createPlaceSkill, discardPlaceDraft, readPlaceDraft, savePlaceDraft } from './placeDrafts'
import { publishFromFiles, publishPlaceDraft, putBackPlaceSkill, rollBackPlaceSkill } from './placeVersions'
import { setPlaceDefault, switchAll, switchSkill } from './switches'

type Ctx = { user?: { id: string } | null }
type Args = Record<string, unknown>

async function person(context: Ctx): Promise<PersonActor> {
  if (!context.user) throw new HttpError(401)
  return personActor(context.user.id, prisma)
}

/** The project's role is read per place, so the actor is resolved against the project the request names. */
async function personIn(context: Ctx, projectId: unknown): Promise<PersonActor> {
  if (!context.user) throw new HttpError(401)
  return personActor(context.user.id, prisma, typeof projectId === 'string' ? projectId : undefined)
}

async function personForSkill(context: Ctx, placeSkillId: unknown): Promise<PersonActor> {
  if (!context.user) throw new HttpError(401)
  const row = typeof placeSkillId === 'string'
    ? await prisma.placeSkill.findUnique({ where: { id: placeSkillId }, select: { placeType: true, placeId: true } })
    : null
  return personActor(context.user.id, prisma, row?.placeType === 'project' ? row.placeId : undefined)
}

function places<T>(work: () => Promise<T>): Promise<T> {
  return asHttp(async () => {
    try {
      return await work()
    } catch (err) {
      if (err instanceof LifecycleError) throw new HttpError(err.status, err.message)
      if (err instanceof SiteUnreachableError) throw new HttpError(503, `${err.message} Nothing was changed.`)
      if (err instanceof LocationFileError) throw new HttpError(err.code === 'not_found' ? 404 : 400, `The site couldn't read the skill's files (${err.detail}). Nothing was changed.`)
      throw err
    }
  })
}

const args = (a: unknown): Args => (a && typeof a === 'object' ? (a as Args) : {})

// The page
export const getPlaceSkills = async (a: unknown, c: Ctx) => { const actor = await personIn(c, args(a).projectId); return places(() => listPlaceSkills(prisma, actor, args(a).projectId)) }
export const scanPlaceSkills = async (a: unknown, c: Ctx) => {
  const actor = await personIn(c, args(a).projectId)
  return places(() => scanPlace(prisma, actor, { projectId: args(a).projectId, agentId: args(a).agentId }))
}
export const getPlaceSkillFiles = async (a: unknown, c: Ctx) => { const actor = await person(c); return places(() => placeSkillFiles(prisma, actor.userId, args(a).placeSkillId)) }
export const getPlaceSkillVersions = async (a: unknown, c: Ctx) => { const actor = await person(c); return places(() => placeSkillVersions(prisma, actor.userId, args(a).placeSkillId)) }

// The default and the switches (C1b, C2)
export const setPlaceSkillsDefault = async (a: unknown, c: Ctx) => {
  const actor = await personIn(c, args(a).projectId)
  return places(() => setPlaceDefault(prisma, actor, { projectId: args(a).projectId, value: args(a).value }))
}
export const switchPlaceSkill = async (a: unknown, c: Ctx) => {
  const { placeSkillId, on, fingerprint } = args(a)
  const actor = await personForSkill(c, placeSkillId)
  return places(() => switchSkill(prisma, actor, { placeSkillId, on, fingerprint }))
}
export const switchAllPlaceSkills = async (a: unknown, c: Ctx) => {
  const { projectId, on, seen, group, agentId, workspaceId } = args(a)
  const actor = await personIn(c, projectId)
  return places(() => switchAll(prisma, actor, { projectId, on, seen, group, agentId, workspaceId }))
}

// Drafts (FV1)
export const getPlaceSkillDraft = async (a: unknown, c: Ctx) => {
  const actor = await personForSkill(c, args(a).placeSkillId)
  return places(() => readPlaceDraft(prisma, actor, args(a).placeSkillId))
}
export const savePlaceSkillDraft = async (a: unknown, c: Ctx) => {
  const { placeSkillId, files, revision } = args(a)
  const actor = await personForSkill(c, placeSkillId)
  return places(() => savePlaceDraft(prisma, actor, { placeSkillId, files, revision: typeof revision === 'number' || revision === null ? revision : undefined }))
}
export const discardPlaceSkillDraft = async (a: unknown, c: Ctx) => {
  const { placeSkillId, revision } = args(a)
  const actor = await personForSkill(c, placeSkillId)
  return places(() => discardPlaceDraft(prisma, actor, { placeSkillId, revision }))
}
export const createPlaceSkillDraft = async (a: unknown, c: Ctx) => {
  const { projectId, name, description, shape, agentId } = args(a)
  const actor = await personIn(c, projectId)
  return places(() => createPlaceSkill(prisma, actor, { projectId, name, description, shape, agentId }))
}

// Versions by publishing (FV2–FV4)
export const publishPlaceSkillDraft = async (a: unknown, c: Ctx) => {
  const { placeSkillId, revision, note } = args(a)
  const actor = await personForSkill(c, placeSkillId)
  return places(() => publishPlaceDraft(prisma, actor, { placeSkillId, revision, note }))
}
export const publishPlaceSkillFiles = async (a: unknown, c: Ctx) => {
  const { placeSkillId, fingerprint, note } = args(a)
  const actor = await personForSkill(c, placeSkillId)
  return places(() => publishFromFiles(prisma, actor, { placeSkillId, fingerprint, note }))
}
export const rollBackPlaceSkillVersion = async (a: unknown, c: Ctx) => {
  const { placeSkillId, versionId, reason } = args(a)
  const actor = await personForSkill(c, placeSkillId)
  return places(() => rollBackPlaceSkill(prisma, actor, { placeSkillId, versionId, reason }))
}
export const putBackPlaceSkillVersion = async (a: unknown, c: Ctx) => {
  const { placeSkillId, fingerprint } = args(a)
  const actor = await personForSkill(c, placeSkillId)
  return places(() => putBackPlaceSkill(prisma, actor, { placeSkillId, fingerprint }))
}

// Add to this place, and Remove
export const addSkillToPlace = async (a: unknown, c: Ctx) => {
  const { projectId, assetId, agentId } = args(a)
  const actor = await personIn(c, projectId)
  return places(() => addToPlace(prisma, actor, { projectId, assetId, agentId }))
}
export const removePlaceSkill = async (a: unknown, c: Ctx) => {
  const { placeSkillId } = args(a)
  const actor = await personForSkill(c, placeSkillId)
  return places(() => removeFromPlace(prisma, actor, { placeSkillId }))
}

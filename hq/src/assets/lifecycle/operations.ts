/**
 * The Library's lifecycle as Wasp operations (spec part 2; adr-0157): versions, update and roll back, any version on
 * purpose, drafts and publishing, the organisation's own copy, credit, and which agents have a skill. Each operation
 * acts as the signed-in person; the policy is checked by what it calls. Hosted in `assets.wasp.ts`.
 */
import { HttpError, prisma } from 'wasp/server'
import { asHttp, type PackageFrom } from '../operations'
import { NoOrganisationError } from '../organisationPublisher'
import { personActor } from '../policyActors'
import type { PersonActor } from '../policy'
import { createVerifier } from '../signing'
import { shelfArrival } from '../sources/imageShelf'
import { uploadArrival } from '../sources/upload'
import { addStatedCredit, creditOf } from './credits'
import { createNewSkill, discardDraft, readDraft, saveDraft } from './draftStore'
import { LifecycleError } from './errors'
import { addToAgents, holdersOf, removeAsset, removeFromAgent, setEveryAgent } from './holders'
import { installVersionOnPurpose, type OnPurposeConfirmation } from './onPurpose'
import { copyNews, editAsset, switchToCopy, switchToOriginal } from './ownCopy'
import { listVersions, moveToVersion, versionChanges } from './pinnedVersions'
import { publishDraft } from './publish'

type Ctx = { user?: { id: string } | null }
type Args = Record<string, unknown>

async function person(context: Ctx): Promise<PersonActor> {
  if (!context.user) throw new HttpError(401)
  return personActor(context.user.id, prisma)
}

/** Reading the Library is for the organisation's people. */
async function reader(context: Ctx): Promise<PersonActor> {
  const actor = await person(context)
  if (actor.role === null) throw new HttpError(403, 'The Library is for people in this organisation. Nothing was changed.')
  return actor
}

function lifecycle<T>(work: () => Promise<T>): Promise<T> {
  return asHttp(async () => {
    try {
      return await work()
    } catch (err) {
      if (err instanceof LifecycleError) throw new HttpError(err.status, err.message)
      if (err instanceof NoOrganisationError) throw new HttpError(409, err.message)
      throw err
    }
  })
}

const args = (a: unknown): Args => (a && typeof a === 'object' ? (a as Args) : {})
/** Only what a person chooses; who asked for it is never taken from the request. */
const move = (a: unknown) => ({ assetId: args(a).assetId, versionId: args(a).versionId, reason: args(a).reason, withdrawnAccepted: args(a).withdrawnAccepted })

// Versions (2.7)
export const getAssetVersions = async (a: unknown, c: Ctx) => { await reader(c); return lifecycle(() => listVersions(prisma, args(a).assetId)) }
export const getAssetVersionChanges = async (a: unknown, c: Ctx) => {
  await reader(c)
  return lifecycle(() => versionChanges(prisma, args(a).assetId, args(a).versionId))
}
export const acceptAssetUpdate = async (a: unknown, c: Ctx) => { const actor = await person(c); return lifecycle(() => moveToVersion(prisma, actor, 'update', move(a))) }
export const rollBackAsset = async (a: unknown, c: Ctx) => { const actor = await person(c); return lifecycle(() => moveToVersion(prisma, actor, 'rollBack', move(a))) }

export const installAssetVersionOnPurpose = async (a: PackageFrom & { confirm: OnPurposeConfirmation }, c: Ctx) => {
  const actor = await person(c)
  if (!a?.confirm || typeof a.confirm.fingerprint !== 'string') throw new HttpError(400, 'Look at the package before installing it. Nothing was changed.')
  return lifecycle(async () => {
    const arrival = a.from === 'shelf' ? await shelfArrival(a.name) : a.from === 'upload' ? await uploadArrival(a) : null
    if (!arrival) throw new LifecycleError('Say where the package comes from: Agenthix or an upload. Nothing was changed.')
    return installVersionOnPurpose(arrival, a.confirm, actor, { db: prisma, verifier: createVerifier(), now: new Date() })
  })
}

// Drafts and publishing (2.8)
export const getAssetDraft = async (a: unknown, c: Ctx) => { const actor = await person(c); return lifecycle(() => readDraft(prisma, actor, args(a).assetId)) }
export const saveAssetDraft = async (a: unknown, c: Ctx) => {
  const actor = await person(c)
  const { assetId, files, revision } = args(a)
  return lifecycle(() => saveDraft(prisma, actor, { assetId, files, revision: revision === null || typeof revision === 'number' ? revision : undefined }))
}
export const discardAssetDraft = async (a: unknown, c: Ctx) => {
  const actor = await person(c)
  return lifecycle(() => discardDraft(prisma, actor, { assetId: args(a).assetId, revision: args(a).revision }))
}
export const publishAssetDraft = async (a: unknown, c: Ctx) => {
  const actor = await person(c)
  const { assetId, revision, note, bump } = args(a)
  return lifecycle(() => publishDraft(prisma, actor, { assetId, revision, note, bump }))
}
export const createSkillDraft = async (a: unknown, c: Ctx) => {
  const actor = await person(c)
  const { name, description, shape } = args(a)
  return lifecycle(() => createNewSkill(prisma, actor, { name, description, shape }))
}

// The organisation's own copy (2.9)
export const editLibraryAsset = async (a: unknown, c: Ctx) => {
  const actor = await person(c)
  return lifecycle(() => editAsset(prisma, actor, { assetId: args(a).assetId, copyName: args(a).copyName }, new Date()))
}
export const switchToOriginalAsset = async (a: unknown, c: Ctx) => { const actor = await person(c); return lifecycle(() => switchToOriginal(prisma, actor, args(a).assetId)) }
export const switchToOwnCopy = async (a: unknown, c: Ctx) => { const actor = await person(c); return lifecycle(() => switchToCopy(prisma, actor, args(a).assetId)) }
export const getAssetCopyNews = async (a: unknown, c: Ctx) => { await reader(c); return lifecycle(() => copyNews(prisma, args(a).assetId)) }

// Provenance (2.10)
export const getAssetCredit = async (a: unknown, c: Ctx) => { await reader(c); return lifecycle(() => creditOf(prisma, args(a).assetId)) }
export const addAssetCredit = async (a: unknown, c: Ctx) => {
  const actor = await person(c)
  const { assetId, skill, version, copied } = args(a)
  return lifecycle(() => addStatedCredit(prisma, actor, { assetId, skill, version, copied }, new Date()))
}

// Which agents have it (2.11)
export const getAssetHolders = async (a: unknown, c: Ctx) => { await reader(c); return lifecycle(() => holdersOf(prisma, args(a).assetId)) }
export const setAssetEveryAgent = async (a: unknown, c: Ctx) => {
  const actor = await person(c)
  return lifecycle(() => setEveryAgent(prisma, actor, { assetId: args(a).assetId, everyAgent: args(a).everyAgent }))
}
export const addAssetToAgents = async (a: unknown, c: Ctx) => {
  const actor = await person(c)
  return lifecycle(() => addToAgents(prisma, actor, { assetId: args(a).assetId, agentIds: args(a).agentIds }))
}
export const removeAssetFromAgent = async (a: unknown, c: Ctx) => {
  const actor = await person(c)
  return lifecycle(() => removeFromAgent(prisma, actor, { assetId: args(a).assetId, agentId: args(a).agentId }))
}
export const removeLibraryAsset = async (a: unknown, c: Ctx) => {
  const actor = await person(c)
  return lifecycle(() => removeAsset(prisma, actor, { assetId: args(a).assetId, confirmed: args(a).confirmed }, new Date()))
}

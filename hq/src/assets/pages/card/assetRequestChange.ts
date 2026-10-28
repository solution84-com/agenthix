/**
 * What an agent's request would change, for the approval card (spec part 5, D31; board R1's card style): read from
 * HQ's own records again at the moment the person looks, never from the agent's words. Only the person the agent
 * asked sees it; anyone else gets nothing, so a card in a shared conversation shows its details to the one who decides.
 * A request whose draft or file has moved since it was made says so, since approving it would be refused.
 */
import type { PrismaClient } from '@prisma/client'
import { formatAssetIdentity } from '@agenthix/core'
import { openJson } from '../../../conversations/sealing'
import { readContent } from '../../content'
import { parseRequestArgs, policyTarget, ASSET_REQUEST_TOOL, type AssetRequest } from '../../approvals/types'
import { bumpOf } from '../../lifecycle/drafts'
import { nextVersion } from '../../lifecycle/versions'
import { may } from '../../policy'
import { organisationTarget, personActor } from '../../policyActors'
import { agentName } from '../../proposals/names'
import { changesBetween, type ReviewChange } from '../review/changes'

const NOTHING = 'Nothing was changed.'

export type AssetRequestChange =
  | { kind: 'none' }
  | {
    kind: 'publish'; identity: string; requestedBy: string | null; from: string | null; to: string; note: string
    /** The draft has moved on since the request: approving it would be refused. */
    stale: string | null; changes: ReviewChange[]
  }
  | { kind: 'rollBack'; identity: string; requestedBy: string | null; from: string | null; to: string; reason: string; changes: ReviewChange[]; stale: string | null }
  | { kind: 'switchOn'; requestedBy: string | null; skill: string; place: string; stale: string | null }
  | { kind: 'install'; requestedBy: string | null; source: string; note: string | null }

const NONE: AssetRequestChange = { kind: 'none' }

async function publishChange(db: PrismaClient, r: Extract<AssetRequest, { kind: 'publish' }>, by: string | null): Promise<AssetRequestChange> {
  const asset = await db.asset.findUnique({
    where: { id: r.assetId },
    include: { currentVersion: true, versions: { select: { version: true } }, draft: true },
  })
  if (!asset) return NONE
  const identity = formatAssetIdentity(asset)
  const to = nextVersion(asset.versions.map(v => v.version), bumpOf(r.bump ?? 'minor'))
  const moved = !asset.draft ? `The draft of ${identity} is gone.` : asset.draft.revision !== r.revision ? `The draft has changed since this was asked (now revision ${asset.draft.revision}). ${NOTHING}` : null
  const current = asset.currentVersion ? await readContent(asset.currentVersion.digest, db) : null
  const draft = asset.draft ? await readContent(asset.draft.digest, db) : []
  return { kind: 'publish', identity, requestedBy: by, from: asset.currentVersion?.version ?? null, to, note: r.note, stale: moved, changes: changesBetween(current, draft) }
}

async function rollBackChange(db: PrismaClient, r: Extract<AssetRequest, { kind: 'rollBack' }>, by: string | null): Promise<AssetRequestChange> {
  const asset = await db.asset.findUnique({ where: { id: r.assetId }, include: { currentVersion: true } })
  const target = await db.assetVersion.findFirst({ where: { id: r.toVersionId, assetId: r.assetId } })
  if (!asset || !target) return NONE
  const current = asset.currentVersion ? await readContent(asset.currentVersion.digest, db) : null
  const stale = target.withdrawn ? `${target.version} was withdrawn, so a card can't roll back to it. Do it on the skill's page. ${NOTHING}` : null
  return {
    kind: 'rollBack', identity: formatAssetIdentity(asset), requestedBy: by, from: asset.currentVersion?.version ?? null, to: target.version,
    reason: r.reason, stale, changes: changesBetween(current, await readContent(target.digest, db)),
  }
}

async function switchOnChange(db: PrismaClient, r: Extract<AssetRequest, { kind: 'switchOn' }>, by: string | null): Promise<AssetRequestChange> {
  const skill = await db.placeSkill.findUnique({ where: { id: r.placeSkillId } })
  if (!skill || skill.goneAt) return NONE
  const place = skill.placeType === 'project'
    ? (await db.project.findUnique({ where: { id: skill.placeId }, select: { name: true } }))?.name ?? 'the project'
    : 'Your space'
  const stale = skill.lastFingerprint !== r.fingerprint ? `The skill's files have changed since this was asked, so switching it on would be refused. ${NOTHING}` : null
  return { kind: 'switchOn', requestedBy: by, skill: skill.name || skill.path, place, stale }
}

export async function assetRequestChange(db: PrismaClient, viewerId: string, operationId: unknown): Promise<AssetRequestChange> {
  const op = typeof operationId === 'string'
    ? await db.operation.findUnique({ where: { id: operationId }, select: { toolName: true, args: true, authorisedById: true, state: true } })
    : null
  if (!op || op.toolName !== ASSET_REQUEST_TOOL || op.authorisedById !== viewerId || op.state !== 'WAITING_FOR_APPROVAL' || !op.args) return NONE
  const args = parseRequestArgs(openJson<Record<string, unknown>>(op.args))
  if (!args) return NONE
  // The right is checked again as when it is answered: someone who lost it is shown nothing of a draft.
  const person = await personActor(viewerId, db, args.target.level === 'project' ? args.target.projectId : undefined)
  if (!may(person, args.action, policyTarget(args.target, (await organisationTarget(db)).outsideInstallers))) return NONE
  const by = await agentName(db, args.requester.agentId)
  const r = args.request
  switch (r.kind) {
    case 'publish': return publishChange(db, r, by)
    case 'rollBack': return rollBackChange(db, r, by)
    case 'switchOn': return switchOnChange(db, r, by)
    case 'install': return { kind: 'install', requestedBy: by, source: r.from === 'shelf' ? `${r.name}, from Agenthix's shelf` : r.link, note: r.note ?? null }
  }
}

/**
 * An agent's request to change the Library or a place's skills (spec part 5 *Proposing*, D31; adr-0159): publish a
 * draft, roll back, switch a skill on, or install. Each becomes an approval card for the person the run acts for and
 * runs only when that person approves it and holds the right at that moment. No agent setting skips it, *Bypassed*
 * included: the request is written by hq as a card, never run as the agent's own tool call, so the agent's approval
 * mode never reaches it. Trusting publishers, the settings and naming Library maintainers have no request at all.
 */
import type { AssetAction, PolicyTarget } from '../policy'

/** The tool name of an asset request's card operation; no agent is ever offered a tool of this name. */
export const ASSET_REQUEST_TOOL = 'approve_asset_request'
/** Every asset request's operation key starts so; a lead's own call waiting at Ask starts `ask:`. */
export const ASSET_REQUEST_KEY_PREFIX = 'asset-request:'

export type AssetRequest =
  | { kind: 'publish'; assetId: string; revision: number; note: string; bump?: 'patch' | 'minor' | 'major' }
  | { kind: 'rollBack'; assetId: string; toVersionId: string; reason: string }
  | { kind: 'switchOn'; placeSkillId: string; fingerprint: string }
  | { kind: 'install'; from: 'shelf'; name: string; note?: string }
  | { kind: 'install'; from: 'url'; link: string; note?: string }

export type AssetRequestKind = AssetRequest['kind']

/** Who asks: the run's agent and the person the run acts for, from its on-behalf-of record, never a tool argument. */
export type AssetRequester = { agentId: string; runId: string; forUserId: string }

/** Where the right is checked; an organisation's `outsideInstallers` is read again when it is answered. */
export type RequestTarget = { level: 'organisation' } | { level: 'project'; projectId: string } | { level: 'person'; userId: string }

/** What a card's operation holds, sealed. */
export type AssetRequestArgs = { request: AssetRequest; requester: AssetRequester; target: RequestTarget; action: AssetAction }

export function actionOf(request: AssetRequest): AssetAction {
  switch (request.kind) {
    case 'publish': return 'publish'
    case 'rollBack': return 'rollBack'
    // A place's switches are its administrators' (part 4 *Who acts*), the same holders as its settings.
    case 'switchOn': return 'settings'
    case 'install': return request.from === 'shelf' ? 'install' : 'installFromOutside'
  }
}

export function policyTarget(target: RequestTarget, outsideInstallers: 'ADMINS' | 'ADMINS_AND_MAINTAINERS'): PolicyTarget {
  return target.level === 'organisation' ? { level: 'organisation', outsideInstallers } : target
}

const ID = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200
const TEXT = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

/** A request as an agent's tool hands it over, checked for shape; null when it isn't one. */
export function parseAssetRequest(raw: unknown): AssetRequest | null {
  const r = raw as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  switch (r.kind) {
    case 'publish':
      if (!ID(r.assetId) || !Number.isInteger(r.revision) || (r.revision as number) < 1 || !TEXT(r.note, 1000)) return null
      if (r.bump !== undefined && r.bump !== 'patch' && r.bump !== 'minor' && r.bump !== 'major') return null
      return { kind: 'publish', assetId: r.assetId, revision: r.revision as number, note: r.note.trim(), ...(r.bump ? { bump: r.bump as 'patch' | 'minor' | 'major' } : {}) }
    case 'rollBack':
      if (!ID(r.assetId) || !ID(r.toVersionId) || !TEXT(r.reason, 1000)) return null
      return { kind: 'rollBack', assetId: r.assetId, toVersionId: r.toVersionId, reason: r.reason.trim() }
    case 'switchOn':
      if (!ID(r.placeSkillId) || !TEXT(r.fingerprint, 200)) return null
      return { kind: 'switchOn', placeSkillId: r.placeSkillId, fingerprint: r.fingerprint }
    case 'install': {
      const note = r.note === undefined ? undefined : TEXT(r.note, 1000) ? r.note.trim() : null
      if (note === null) return null
      if (r.from === 'shelf' && TEXT(r.name, 64)) return { kind: 'install', from: 'shelf', name: r.name, ...(note ? { note } : {}) }
      if (r.from === 'url' && TEXT(r.link, 2000)) return { kind: 'install', from: 'url', link: r.link.trim(), ...(note ? { note } : {}) }
      return null
    }
    default:
      return null
  }
}

/** The card operation's sealed arguments, read back; null when they aren't an asset request's. */
export function parseRequestArgs(raw: Record<string, unknown> | null): AssetRequestArgs | null {
  if (!raw) return null
  const request = parseAssetRequest(raw.request)
  const q = raw.requester as Record<string, unknown> | undefined
  const t = raw.target as Record<string, unknown> | undefined
  if (!request || !q || !ID(q.agentId) || !ID(q.runId) || !ID(q.forUserId) || !t) return null
  let target: RequestTarget
  if (t.level === 'organisation') target = { level: 'organisation' }
  else if (t.level === 'project' && ID(t.projectId)) target = { level: 'project', projectId: t.projectId }
  else if (t.level === 'person' && ID(t.userId)) target = { level: 'person', userId: t.userId }
  else return null
  // The action is derived again, never taken from what was stored.
  return { request, requester: { agentId: q.agentId, runId: q.runId, forUserId: q.forUserId }, target, action: actionOf(request) }
}

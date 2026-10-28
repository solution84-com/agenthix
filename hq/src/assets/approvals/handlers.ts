/**
 * What an approved asset request does, as the person who approved it (spec part 5, D31). Each handler gets that
 * person, already checked against the policy at this moment, and the agent that asked, to record as "requested by".
 * Publish and roll back are the Library's lifecycle operations, given exactly the revision or version the request named
 * (H5), so a draft that moved since is refused. Switching on is a place's; until it is wired here, a request of its kind
 * is refused when approved and nothing is done.
 */
import { HttpError, prisma } from 'wasp/server'
import { installPackage } from '../install/commit'
import { previewInstall } from '../install/preview'
import type { Arrival } from '../install/types'
import { moveToVersion } from '../lifecycle/pinnedVersions'
import { publishDraft } from '../lifecycle/publish'
import type { PersonActor } from '../policy'
import { createVerifier } from '../signing'
import { shelfArrival } from '../sources/imageShelf'
import { linkArrival, sameReadError } from '../sources/link'
import type { AssetRequest, AssetRequestKind } from './types'

export type ApprovedRequest = { actor: PersonActor; requestedByAgentId: string; runId: string }
/** Answers the summary the card's operation ends with. */
export type AssetRequestHandler<K extends AssetRequestKind = AssetRequestKind> =
  (request: Extract<AssetRequest, { kind: K }>, approved: ApprovedRequest) => Promise<string>
export type AssetRequestHandlers = { [K in AssetRequestKind]: AssetRequestHandler<K> }

const NOTHING = 'Nothing was changed.'

const notYet = (what: string) => async (): Promise<string> => {
  throw new HttpError(409, `${what} can't be done from a conversation yet: do it on the skill's page. ${NOTHING}`)
}

/**
 * Installs from Agenthix or a link, only when nothing needs the person's own look: an unsigned package or a new
 * publisher is refused, since a card can't show the package or let them name the publisher.
 */
async function install(request: Extract<AssetRequest, { kind: 'install' }>, approved: ApprovedRequest): Promise<string> {
  const deps = { db: prisma, verifier: createVerifier(), now: new Date() }
  const work = async () => {
    const arrival: Arrival = request.from === 'shelf' ? await shelfArrival(request.name) : await linkArrival(request.link)
    const preview = await previewInstall(arrival, approved.actor, deps)
    if (preview.refusal) throw new HttpError(409, preview.refusal)
    if (preview.needs.unsignedRead || preview.needs.publisherChoice) {
      throw new HttpError(409, `This package is ${preview.needs.unsignedRead ? 'unsigned' : 'from a publisher not yet trusted'}, so it needs a person to look at it first: add it from the Library. ${NOTHING}`)
    }
    const result = await installPackage(arrival, { fingerprint: preview.fingerprint, note: request.note }, approved.actor, deps, { requestedByAgentId: approved.requestedByAgentId })
    return result.message
  }
  return request.from === 'url' ? sameReadError(work) : work()
}

async function publish(request: Extract<AssetRequest, { kind: 'publish' }>, approved: ApprovedRequest): Promise<string> {
  const { identity, version } = await publishDraft(prisma, approved.actor, {
    assetId: request.assetId, revision: request.revision, note: request.note, bump: request.bump,
    requestedByAgentId: approved.requestedByAgentId,
  })
  return `Published ${identity} ${version}. Every agent that has it uses it from its next turn.`
}

async function rollBack(request: Extract<AssetRequest, { kind: 'rollBack' }>, approved: ApprovedRequest): Promise<string> {
  const { identity, version } = await moveToVersion(prisma, approved.actor, 'rollBack', {
    assetId: request.assetId, versionId: request.toVersionId, reason: request.reason,
    requestedByAgentId: approved.requestedByAgentId,
  })
  return `Rolled back ${identity} to ${version}. Every agent that has it uses it from its next turn.`
}

export const assetRequestHandlers: AssetRequestHandlers = {
  publish,
  rollBack,
  switchOn: notYet('Switching a skill on'),
  install,
}

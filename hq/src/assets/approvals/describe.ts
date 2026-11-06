/**
 * What an agent's request is about, read from hq's own records, never from the agent's words: the level its right
 * is checked at, and the card's text. Only the publish note, the roll back's reason and an install's note are the
 * agent's, and the card quotes them as such, since they are recorded with what is done.
 */
import { HttpError } from 'wasp/server'
import { formatAssetIdentity } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import type { AssetRequest, RequestTarget } from './types'

export type RequestSubject = { target: RequestTarget; title: string; what: string; reason: string }

/** A request refused before any card is written; its words reach the agent as they are. */
export class RequestRefused extends HttpError {
  constructor(message: string, status: 400 | 403 | 404 | 409 = 409) { super(status, message) }
}

const NOTHING = 'Nothing was changed.'
const QUOTE_MAX = 300

const quoted = (text: string) => `“${text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1)}…` : text}”`

async function libraryAsset(db: Db, assetId: string) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { publisher: true, name: true, removedAt: true, draft: { select: { revision: true } }, currentVersion: { select: { version: true } } },
  })
  if (!asset || asset.removedAt) throw new RequestRefused(`There is no such skill in the Library. ${NOTHING}`, 404)
  return { ...asset, identity: formatAssetIdentity(asset) }
}

export async function describeRequest(db: Db, request: AssetRequest): Promise<RequestSubject> {
  const organisation: RequestTarget = { level: 'organisation' }
  switch (request.kind) {
    case 'publish': {
      const asset = await libraryAsset(db, request.assetId)
      if (!asset.draft) throw new RequestRefused(`${asset.identity} has no draft to publish. ${NOTHING}`)
      if (asset.draft.revision !== request.revision) {
        throw new RequestRefused(`The draft of ${asset.identity} is at revision ${asset.draft.revision}, not ${request.revision}. Look at it again. ${NOTHING}`)
      }
      return {
        target: organisation,
        title: `Publish ${asset.identity}`,
        what: `publish revision ${request.revision} of the draft of ${asset.identity} as its next ${request.bump ?? 'minor'} version`,
        reason: `Every agent that has it uses the new version from its next turn. The note it gives: ${quoted(request.note)}`,
      }
    }
    case 'rollBack': {
      const asset = await libraryAsset(db, request.assetId)
      const version = await db.assetVersion.findFirst({ where: { id: request.toVersionId, assetId: request.assetId }, select: { version: true } })
      if (!version) throw new RequestRefused(`${asset.identity} has no such version installed. ${NOTHING}`, 404)
      return {
        target: organisation,
        title: `Return ${asset.identity} to ${version.version}`,
        what: `return ${asset.identity} from ${asset.currentVersion?.version ?? 'its current version'} to ${version.version}`,
        reason: `Every agent that has it uses ${version.version} from its next turn. Why, as it says: ${quoted(request.reason)}`,
      }
    }
    case 'switchOn': {
      const skill = await db.placeSkill.findUnique({ where: { id: request.placeSkillId }, select: { placeType: true, placeId: true, path: true, goneAt: true } })
      if (!skill || skill.goneAt) throw new RequestRefused(`There is no such skill in this place's files. ${NOTHING}`, 404)
      const target: RequestTarget = skill.placeType === 'project' ? { level: 'project', projectId: skill.placeId } : { level: 'person', userId: skill.placeId }
      return {
        target,
        title: `Switch on the skill at ${skill.path}`,
        what: `switch on the skill at ${skill.path}, exactly as its files are now`,
        reason: 'Agents working here use it from their next turn. If its files change, it goes off again until someone switches it on.',
      }
    }
    case 'install': {
      const note = request.note ? ` The note it gives: ${quoted(request.note)}` : ''
      if (request.from === 'shelf') {
        return {
          target: organisation,
          title: `Install ${request.name} from Agenthix`,
          what: `install the skill ${request.name} from Agenthix into the Library`,
          reason: `It goes into the Library; no agent has it until it is given to them.${note}`,
        }
      }
      return {
        target: organisation,
        title: 'Install a skill from a link',
        what: `install the package at ${request.link.slice(0, QUOTE_MAX)}`,
        reason: 'HQ fetches and checks it when you approve. If it is unsigned or from a publisher not yet trusted, '
          + `it isn't installed: add it from the Library, where you can read it first.${note}`,
      }
    }
  }
}

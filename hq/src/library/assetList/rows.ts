/**
 * The Library's rows (skills spec part 6 *The Library*; plan 6.2): every installed asset and every proposal waiting
 * for review, read from the asset records the lifecycle writes. Read-only; who may see and do what is the policy's.
 */
import { AGENTHIX_PUBLISHER, formatAssetIdentity } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { readContent } from '../../assets/content'
import { offeredUpdate } from '../../assets/lifecycle/offers'
import { skillDescription, skillMdOf, skillTitle } from '../../assets/skillFile'
import { PERSON_SELECT, personSummary } from '../../server/identity/personSummary'
import type { PersonActor } from '../../assets/policy'
import { madeFromText, signedByText, titleOfName, whoHasText } from './words'
import type { LibraryAssetRow, LibraryKindId, LibraryStatus } from './types'

const KIND: Record<string, LibraryKindId> = { SKILL: 'skill', AGENT: 'agent', BOARD: 'board', TEAM: 'team' }

type Names = Map<string, string>

async function peopleNames(db: Db, ids: string[]): Promise<Names> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: PERSON_SELECT })
  return new Map(users.map((u: Parameters<typeof personSummary>[0]): [string, string] => [u.id, personSummary(u).name]))
}

export async function libraryRows(db: Db, viewer: PersonActor): Promise<LibraryAssetRow[]> {
  const [assets, proposals, org] = await Promise.all([
    db.asset.findMany({
      where: { removedAt: null, NOT: { name: { contains: '/' } }, currentVersionId: { not: null } },
      include: {
        currentVersion: { include: { trustedPublisher: true, _count: { select: { agentsMade: true, boardsMade: true, teamsMade: true } } } },
        versions: { select: { version: true, withdrawn: true } },
        grants: { select: { agent: { select: { name: true } } } },
        setAsideBy: { select: { publisher: true, name: true } },
        draft: { select: { revisions: { orderBy: { number: 'desc' }, take: 1, select: { authorId: true } } } },
      },
    }),
    db.proposal.findMany({ where: { state: 'OPEN', aim: 'ORGANISATION' }, orderBy: { createdAt: 'desc' } }),
    db.org.findFirst({ select: { publisherName: true } }),
  ])
  const visible = proposals.filter(p => viewer.role === 'ADMIN' || viewer.libraryMaintainer || p.forUserId === viewer.userId)
  const agentIds = visible.map(p => p.agentId).filter((id): id is string => id !== null)
  const [names, agents] = await Promise.all([
    peopleNames(db, [
      ...assets.flatMap(a => a.draft?.revisions[0]?.authorId ?? []),
      ...visible.map(p => p.forUserId).filter((id): id is string => id !== null),
    ]),
    agentIds.length ? db.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ])
  const agentName = new Map<string, string>(agents.map((a: { id: string; name: string }): [string, string] => [a.id, a.name]))

  const rows: LibraryAssetRow[] = []
  for (const a of assets) {
    const v = a.currentVersion!
    const kind = KIND[a.kind]!
    const identity = formatAssetIdentity(a)
    const madeHere = v.source === 'MADE_HERE' || a.publisher === org?.publisherName
    const signer = a.builtIn || (v.source === 'BUILT_IN' && a.publisher === AGENTHIX_PUBLISHER)
      ? (a.builtIn ? 'Built in' : 'Signed by Agenthix')
      : madeHere ? 'Made here'
      : v.trustedPublisher ? signedByText(v.trustedPublisher.displayName, v.trustedPublisher.repository)
      : 'Unsigned'
    const newer = offeredUpdate(a.versions, v.version, a.skippedVersion)?.version ?? null
    const draftAuthor = a.draft ? a.draft.revisions[0]?.authorId ?? null : null
    const statuses: LibraryStatus[] = []
    if (newer) statuses.push('update')
    if (a.draft) statuses.push('draft')
    if (a.setAsideBy) statuses.push('setAside')
    if (signer === 'Unsigned') statuses.push('unsigned')

    let title = titleOfName(a.name)
    let description = ''
    let has: string
    if (kind === 'skill') {
      const md = skillMdOf(await readContent(v.digest, db))
      title = skillTitle(md, a.name)
      description = skillDescription(md)
      has = a.builtIn ? 'On for every agent working in a repository'
        : a.givenToAll ? 'Every agent has it'
        : whoHasText(a.grants.map(g => g.agent.name).sort((x, y) => x.localeCompare(y)))
      if (!a.builtIn && !a.givenToAll && a.grants.length === 0 && !a.setAsideBy) statuses.push('noAgent')
    } else {
      const c = v._count
      has = madeFromText(kind, kind === 'agent' ? c.agentsMade : kind === 'board' ? c.boardsMade : c.teamsMade)
    }
    rows.push({
      key: a.id, assetId: a.id, proposalId: null, kind, title, description, identity, version: v.version, signer, has,
      builtIn: a.builtIn, switchedOff: a.switchedOff, statuses, updateTo: newer,
      draftBy: draftAuthor ? names.get(draftAuthor) ?? null : null, proposedBy: null,
      setAsideFor: a.setAsideBy ? formatAssetIdentity(a.setAsideBy) : null, partners: [],
    })
  }
  for (const p of visible) {
    const person = p.forUserId ? names.get(p.forUserId) ?? null : null
    const agent = p.agentId ? agentName.get(p.agentId) ?? 'An agent' : null
    rows.push({
      key: `proposal:${p.id}`, assetId: p.assetId, proposalId: p.id, kind: 'skill', title: titleOfName(p.name), description: p.description,
      identity: p.name, version: null, signer: 'Made here', has: 'Proposed for the organisation', builtIn: false, switchedOff: false,
      statuses: ['waiting'], updateTo: null, draftBy: null,
      proposedBy: agent ? `Proposed by ${agent}${person ? ` for ${person}` : ''}` : `Proposed by ${person ?? 'a member'}`,
      setAsideFor: null, partners: [],
    })
  }
  return rows.sort((x, y) => Number(y.builtIn) - Number(x.builtIn) || x.title.localeCompare(y.title))
}

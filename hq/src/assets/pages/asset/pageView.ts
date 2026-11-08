/**
 * An asset's page, read (skills spec part 6 *An asset's page*; board U3): what it is, who vouches for it, which version
 * is in use, what the viewer may do, and for a template what it carries and what was made from it. Read-only. Who may
 * see it is the organisation's people; who may act is the policy's, shown as `can` so the page offers only that.
 */
import { AGENTHIX_PUBLISHER, compareSemVer, formatAssetIdentity } from '@agenthix/core'
import type { Db } from '../../../packages/packageStore'
import { readContent } from '../../content'
import { readParts } from '../../install/parts'
import { findExisting } from '../../install/lookup'
import { LifecycleError } from '../../lifecycle/errors'
import { libraryAsset } from '../../lifecycle/records'
import { offeredUpdate } from '../../lifecycle/offers'
import { may, type PersonActor } from '../../policy'
import { organisationTarget } from '../../policyActors'
import { skillDescription, skillMdOf, skillTitle } from '../../skillFile'
import { PERSON_SELECT, personSummary } from '../../../server/identity/personSummary'
import { titleOfName } from '../../../library/assetList/words'
import { signedByWords } from './signedBy'
import { assetRelatives } from './relatives'
import type { AssetPageView, CarriedSkill, LastUsed, MadeFrom, PageKind } from './pageTypes'

const KIND: Record<string, PageKind> = { SKILL: 'skill', AGENT: 'agent', BOARD: 'board', TEAM: 'team' }

const SOURCE_WORDS: Record<string, string> = {
  BUILT_IN: 'Agenthix, in the HQ image', UPLOAD: 'An upload', URL: 'A link', MADE_HERE: 'Made in the editor',
}

export { signedByWords }

async function carriedBy(db: Db, template: { publisher: string; name: string }, digest: string): Promise<CarriedSkill[]> {
  const parts = readParts({ root: template.name, files: await readContent(digest, db) })
  const out: CarriedSkill[] = []
  for (const part of parts.embedded) {
    const existing = await findExisting(db, 'skill', template.publisher, part.name)
    const have = existing && !existing.removed ? existing.current?.version ?? null : null
    let state = 'Installed with the first agent made from this'
    if (part.role) state = have ? 'Installed' : 'Installed with the first agent made from this'
    else if (have === null) state = existing?.removed ? 'Removed from the Library; it stays removed' : state
    else if (have === part.version) state = `Already installed at the same version: shared, not copied`
    else state = compareSemVer(have, part.version) > 0 ? `Kept your newer ${have}` : `Kept ${have}; update to ${part.version} offered`
    out.push({ identity: formatAssetIdentity({ publisher: template.publisher, name: part.name }), title: part.title, version: part.version, role: part.role, state, assetId: existing?.id ?? null })
  }
  return out
}

async function madeFromOf(db: Db, kind: PageKind, assetId: string): Promise<MadeFrom[]> {
  const where = { madeFromVersion: { assetId } }
  const rows = kind === 'agent' ? await db.agent.findMany({ where, select: { name: true, madeFromVersion: { select: { version: true } } } })
    : kind === 'board' ? await db.board.findMany({ where, select: { name: true, madeFromVersion: { select: { version: true } } } })
    : kind === 'team' ? await db.team.findMany({ where, select: { name: true, madeFromVersion: { select: { version: true } } } })
    : []
  return rows.map((r: { name: string; madeFromVersion: { version: string } | null }) => ({ name: r.name, version: r.madeFromVersion?.version ?? '' }))
}

/** Whether the person may see a project: its members, Viewers included, and the owner of their own. */
export type Sees = (projectId: string, userId: string) => Promise<boolean>

type UsedStamp = { lastUsedAt: Date | null; lastUsedAgentId: string | null; lastUsedPlaceType: string | null; lastUsedPlaceId: string | null }

/** The newest use hq has read; the agent by name, the place only for a viewer who may see it. */
async function lastUsedOf(db: Db, viewer: PersonActor, stamp: UsedStamp, sees: Sees): Promise<LastUsed | null> {
  if (!stamp.lastUsedAt) return null
  const agent = stamp.lastUsedAgentId ? await db.agent.findUnique({ where: { id: stamp.lastUsedAgentId }, select: { name: true } }) : null
  const project = !stamp.lastUsedPlaceId ? null
    : stamp.lastUsedPlaceType === 'user'
      ? await db.project.findFirst({ where: { personalOwnerId: stamp.lastUsedPlaceId, personalSpace: true }, select: { id: true, name: true } })
      : await db.project.findUnique({ where: { id: stamp.lastUsedPlaceId }, select: { id: true, name: true } })
  const where = project && viewer.kind === 'person' && await sees(project.id, viewer.userId) ? project.name : null
  return { by: agent?.name ?? null, at: stamp.lastUsedAt.toISOString(), where }
}

export async function assetPageView(db: Db, viewer: PersonActor, assetId: unknown, sees: Sees = async () => false): Promise<AssetPageView> {
  if (viewer.role === null) throw new LifecycleError('The Library is for people in this organisation. Nothing was changed.', 403)
  const found = await libraryAsset(db, assetId)
  const asset = await db.asset.findUniqueOrThrow({
    where: { id: found.id },
    include: {
      currentVersion: { include: { trustedPublisher: true } },
      versions: { orderBy: { createdAt: 'asc' }, select: { id: true, version: true, withdrawn: true, byId: true, createdAt: true } },
      setAsideBy: { select: { id: true, publisher: true, name: true } },
      draft: { select: { revisions: { orderBy: { number: 'desc' }, take: 1, select: { authorId: true } } } },
    },
  })
  const v = asset.currentVersion
  if (!v) throw new LifecycleError('That has no published version yet. Open its draft from the Library. Nothing was changed.', 404)
  const kind = KIND[asset.kind]
  // A task template has no Library page yet.
  if (!kind) throw new LifecycleError('That is not in the Library. Nothing was changed.', 404)
  const [org, target] = await Promise.all([db.org.findFirst({ select: { publisherName: true } }), organisationTarget(db)])
  const own = asset.publisher === org?.publisherName
  const can = {
    edit: may(viewer, 'editDraft', target) && !asset.builtIn && kind === 'skill',
    update: may(viewer, 'update', target),
    grant: may(viewer, 'grant', target),
    remove: may(viewer, 'remove', target) && !asset.builtIn,
    switch: asset.builtIn && may(viewer, 'settings', target),
  }
  const files = await readContent(v.digest, db)
  let title = titleOfName(asset.name)
  let description = ''
  if (kind === 'skill') {
    const md = skillMdOf(files)
    title = skillTitle(md, asset.name)
    description = skillDescription(md)
  }
  const first = asset.versions[0]
  const draftAuthor = asset.draft?.revisions[0]?.authorId ?? null
  const pins = await db.assetPinChange.findMany({ where: { assetId: asset.id }, select: { byId: true } })
  const ids = [...new Set([...asset.versions.map(x => x.byId), ...pins.map((p: { byId: string | null }) => p.byId), draftAuthor].filter((id): id is string => !!id))]
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: PERSON_SELECT }) : []
  const nameOf = (id: string | null | undefined) => {
    const u = users.find((x: { id: string }) => x.id === id)
    return u ? personSummary(u).name : null
  }
  const newer = offeredUpdate(asset.versions, v.version, asset.skippedVersion)
  const maintainers = await db.libraryMaintainer.findMany({ where: { user: { deactivatedAt: null } }, orderBy: { createdAt: 'asc' }, select: { user: { select: PERSON_SELECT } } })
  const allAgents: { id: string; name: string; avatarUrl?: string | null }[] = kind === 'skill' && !asset.builtIn
    ? await db.agent.findMany({ select: { id: true, name: true, avatarUrl: true }, orderBy: { name: 'asc' } })
    : []
  const unsigned = !asset.builtIn && !own && v.source !== 'MADE_HERE' && v.trustedPublisher === null && !(v.source === 'BUILT_IN' && asset.publisher === AGENTHIX_PUBLISHER)
  return {
    assetId: asset.id, kind, title, description, identity: formatAssetIdentity(asset), version: v.version,
    builtIn: asset.builtIn, switchedOff: asset.switchedOff, own, orgPublisher: org?.publisherName ?? null, unsigned,
    signedBy: signedByWords(v, asset.publisher, asset.builtIn, own),
    source: SOURCE_WORDS[v.source] ?? v.source, sourceUrl: v.sourceUrl,
    installedBy: nameOf(first?.byId), installedAt: first ? first.createdAt.toISOString() : null,
    update: newer ? { versionId: newer.id, version: newer.version } : null,
    draftBy: asset.draft ? nameOf(draftAuthor) ?? 'someone' : null,
    setAsideFor: asset.setAsideBy ? { assetId: asset.setAsideBy.id, identity: formatAssetIdentity(asset.setAsideBy) } : null,
    ...(kind === 'skill' && !asset.builtIn ? await assetRelatives(db, asset, own, org?.publisherName ?? null) : { original: null, copies: [] }),
    can,
    names: Object.fromEntries(users.map((u: Parameters<typeof personSummary>[0]) => [u.id, personSummary(u).name])),
    maintainers: maintainers.map((m: { user: Parameters<typeof personSummary>[0] }) => personSummary(m.user).name),
    agents: can.grant ? allAgents.map(({ id, name }) => ({ id, name })) : [],
    agentAvatars: Object.fromEntries(allAgents.map(a => [a.id, a.avatarUrl ?? null])),
    carries: kind === 'skill' ? null : await carriedBy(db, asset, v.digest),
    madeFrom: kind === 'skill' ? null : await madeFromOf(db, kind, asset.id),
    lastUsed: kind === 'skill' ? await lastUsedOf(db, viewer, asset, sees) : null,
  }
}

/**
 * Agenthix's shelf, as the Add screen lists it (skills spec part 3 *Sources*; board U4): the skills in hq's image,
 * with what the organisation already has of each. Offering a skill is not installing it: nothing reaches an agent
 * until a person installs it and gives it to one (R2, D14).
 */
import { AGENTHIX_PUBLISHER, compareSemVer } from '@agenthix/core'
import type { Db } from '../../../packages/packageStore'
import { may, type PersonActor } from '../../policy'
import { organisationTarget } from '../../policyActors'
import { listShelf } from '../../sources/imageShelf'
import { titleOfName } from '../../../library/assetList/words'

const TEMPLATE_KIND = { AGENT: 'agent', TEAM: 'team' } as const

async function removedTemplates(db: Db): Promise<RemovedTemplate[]> {
  const rows = await db.asset.findMany({
    where: { publisher: AGENTHIX_PUBLISHER, kind: { in: ['AGENT', 'TEAM'] }, removedAt: { not: null }, currentVersionId: { not: null } },
    select: { id: true, kind: true, name: true },
    orderBy: { name: 'asc' },
  })
  return rows.map((r: { id: string; kind: string; name: string }) => ({
    assetId: r.id, identity: `${AGENTHIX_PUBLISHER}/${r.name}`, title: titleOfName(r.name), kind: TEMPLATE_KIND[r.kind as keyof typeof TEMPLATE_KIND],
  }))
}

export type ShelfItem = {
  /** The folder name, which `installAsset` takes as `{ from: 'shelf', name }`. */
  name: string
  identity: string
  title: string
  description: string
  version: string
  suitedTo: string[]
  /** What the organisation has: the version in use, and whether the shelf's is newer. */
  have: { assetId: string; version: string; newer: boolean } | null
}

/** An Agenthix template an administrator removed: hq doesn't install it again at start, until one of them puts it back. */
export type RemovedTemplate = { assetId: string; identity: string; title: string; kind: 'agent' | 'team' }

export type ShelfView = {
  items: ShelfItem[]
  /** Only for those who may remove, as putting back is theirs. */
  removed: RemovedTemplate[]
  suitedTo: string[]
  /** What the viewer may add: Agenthix's shelf, and packages from outside (an upload or a link; P3). */
  can: { shelf: boolean; outside: boolean }
}

export async function shelfView(db: Db, viewer: PersonActor): Promise<ShelfView> {
  const target = await organisationTarget(db)
  const can = { shelf: may(viewer, 'install', target), outside: may(viewer, 'installFromOutside', target) }
  const removed = may(viewer, 'remove', target) ? await removedTemplates(db) : []
  if (!can.shelf) return { items: [], removed, suitedTo: [], can }
  const shelf = await listShelf()
  const held = await db.asset.findMany({
    where: { kind: 'SKILL', publisher: AGENTHIX_PUBLISHER, name: { in: shelf.map(s => s.name) }, removedAt: null, currentVersionId: { not: null } },
    select: { id: true, name: true, currentVersion: { select: { version: true } } },
  })
  const haveOf = new Map(held.map((h: { id: string; name: string; currentVersion: { version: string } | null }) => [h.name, h]))
  const items = shelf.map((s): ShelfItem => {
    const h = haveOf.get(s.name)
    const version = h?.currentVersion?.version
    return {
      name: s.name, identity: s.identity, title: s.title, description: s.description, version: s.version, suitedTo: s.suitedTo,
      have: h && version ? { assetId: h.id, version, newer: compareSemVer(s.version, version) > 0 } : null,
    }
  })
  return { items, removed, suitedTo: [...new Set(items.flatMap(i => i.suitedTo))].sort(), can }
}

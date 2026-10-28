/**
 * The Library's entries (spec part 2 *Editing makes your own copy*, part 6 *The Library*; D18): the rows, with a copy
 * and the original it was made from shown as one entry. The entry is whichever of them serves the agents: the copy
 * once it has taken the original's place, with the original set aside under it; otherwise the original, with the copy
 * under it. Who has which is unchanged; this only reads.
 */
import type { Db } from '../../packages/packageStore'
import type { PersonActor } from '../../assets/policy'
import { copyLinks, originalWords, ownerWords, type CopyLink } from './copies'
import { libraryRows } from './rows'
import type { LibraryAssetRow, LibraryPartner, LibraryStatus } from './types'

const assetRow = (r: LibraryAssetRow) => r.assetId !== null && r.proposalId === null

function originalPartner(original: LibraryAssetRow, link: CopyLink, owner: string | null): LibraryPartner {
  return {
    assetId: original.assetId!, relation: 'original', identity: original.identity, version: original.version,
    words: originalWords({ owner, title: original.title, identity: original.identity, version: link.copiedFrom ?? original.version }),
    statuses: ['setAside'], draftBy: null,
  }
}

function copyPartner(copy: LibraryAssetRow, link: CopyLink): LibraryPartner {
  const statuses: LibraryStatus[] = []
  if (copy.statuses.includes('draft')) statuses.push('draft')
  if (link.published) statuses.push('setAside')
  return {
    assetId: copy.assetId!, relation: 'copy', identity: copy.identity, version: copy.version,
    words: copy.version ? `${copy.identity} ${copy.version}` : copy.identity, statuses, draftBy: copy.draftBy,
  }
}

/** Folds each copy and its original into one entry. `owners` names each original's signer ("Agenthix"), or null. */
export function foldCopies(rows: LibraryAssetRow[], links: CopyLink[], owners: Map<string, string | null>): LibraryAssetRow[] {
  const byId = new Map(rows.filter(assetRow).map(r => [r.assetId!, r]))
  const groups = new Map<string, CopyLink[]>()
  for (const l of links) {
    if (!byId.has(l.originId) || !byId.has(l.copyId)) continue
    groups.set(l.originId, [...groups.get(l.originId) ?? [], l])
  }
  const heads = new Map<string, LibraryAssetRow>()
  const folded = new Set<string>()
  for (const [originId, copies] of groups) {
    const original = byId.get(originId)!
    const inUse = copies.find(c => c.inUse)
    const head = inUse ? byId.get(inUse.copyId)! : original
    const partners: LibraryPartner[] = inUse ? [originalPartner(original, inUse, owners.get(originId) ?? null)] : []
    for (const c of copies) if (c !== inUse) partners.push(copyPartner(byId.get(c.copyId)!, c))
    heads.set(head.assetId!, { ...head, partners: [...head.partners, ...partners] })
    for (const p of partners) folded.add(p.assetId)
  }
  return rows
    .filter(r => !(assetRow(r) && folded.has(r.assetId!)))
    .map(r => (assetRow(r) ? heads.get(r.assetId!) ?? r : r))
}

export async function libraryEntries(db: Db, viewer: PersonActor): Promise<LibraryAssetRow[]> {
  const [rows, org] = await Promise.all([libraryRows(db, viewer), db.org.findFirst({ select: { publisherName: true } })])
  const own = org?.publisherName ? `${org.publisherName}/` : null
  const candidates = own ? rows.filter(r => assetRow(r) && r.kind === 'skill' && r.identity.startsWith(own)).map(r => r.assetId!) : []
  const links = await copyLinks(db, candidates)
  if (links.length === 0) return rows
  const originals = await db.asset.findMany({
    where: { id: { in: [...new Set(links.map(l => l.originId))] } },
    select: { id: true, publisher: true, builtIn: true, currentVersion: { select: { source: true, trustedPublisher: { select: { displayName: true } } } } },
  })
  const owners = new Map<string, string | null>(originals.map((o: {
    id: string; publisher: string; builtIn: boolean; currentVersion: { source: string; trustedPublisher: { displayName: string } | null } | null
  }): [string, string | null] => [o.id, ownerWords({
    publisher: o.publisher, builtIn: o.builtIn, source: o.currentVersion?.source ?? null, signer: o.currentVersion?.trustedPublisher?.displayName ?? null,
  })]))
  return foldCopies(rows, links, owners)
}

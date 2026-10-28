/**
 * A copy and its original on each other's page (spec part 2 *Editing makes your own copy*, D18): the copy's page shows
 * the original it was made from, and the original's page its copies. Read from hq's own record, as switching back
 * reads it. Read-only.
 */
import { formatAssetIdentity } from '@agenthix/core'
import type { Db } from '../../../packages/packageStore'
import { readContent } from '../../content'
import { skillMdOf, skillTitle } from '../../skillFile'
import { PERSON_SELECT, personSummary } from '../../../server/identity/personSummary'
import { copyLinks, originalWords, ownerWords, ownSkillIds } from '../../../library/assetList/copies'
import { signedByWords } from './signedBy'
import type { CopyView, OriginalView } from './pageTypes'

type Relatives = { original: OriginalView | null; copies: CopyView[] }

async function originalOf(db: Db, copyId: string): Promise<OriginalView | null> {
  const [link] = await copyLinks(db, [copyId])
  if (!link) return null
  const o = await db.asset.findUnique({ where: { id: link.originId }, include: { currentVersion: { include: { trustedPublisher: true } } } })
  if (!o || o.removedAt || !o.currentVersion) return null
  const v = o.currentVersion
  const identity = formatAssetIdentity(o)
  const title = skillTitle(skillMdOf(await readContent(v.digest, db)), o.name)
  const owner = ownerWords({ publisher: o.publisher, builtIn: o.builtIn, source: v.source, signer: v.trustedPublisher?.displayName ?? null })
  return {
    assetId: o.id, identity, name: originalWords({ owner, title, identity, version: null }), version: v.version, copiedFrom: link.copiedFrom,
    signedBy: signedByWords(v, o.publisher, o.builtIn, false), inUse: !link.inUse, copyPublished: link.published,
  }
}

async function copiesOf(db: Db, originId: string, publisher: string | null): Promise<CopyView[]> {
  const links = (await copyLinks(db, await ownSkillIds(db, publisher))).filter(l => l.originId === originId)
  if (links.length === 0) return []
  const assets = await db.asset.findMany({
    where: { id: { in: links.map(l => l.copyId) } },
    select: { id: true, publisher: true, name: true, currentVersion: { select: { version: true } }, draft: { select: { revisions: { orderBy: { number: 'desc' }, take: 1, select: { authorId: true } } } } },
  })
  type Copy = { id: string; publisher: string; name: string; currentVersion: { version: string } | null; draft: { revisions: { authorId: string | null }[] } | null }
  const authors = assets.flatMap((a: Copy) => a.draft?.revisions[0]?.authorId ?? [])
  const users = authors.length ? await db.user.findMany({ where: { id: { in: authors } }, select: PERSON_SELECT }) : []
  const nameOf = (id: string | null | undefined) => {
    const u = users.find((x: { id: string }) => x.id === id)
    return u ? personSummary(u).name : null
  }
  return links.flatMap(l => {
    const a = assets.find((x: Copy) => x.id === l.copyId) as Copy | undefined
    if (!a) return []
    return [{
      assetId: a.id, identity: formatAssetIdentity(a), version: a.currentVersion?.version ?? null, inUse: l.inUse, published: l.published,
      draftBy: a.draft ? nameOf(a.draft.revisions[0]?.authorId) ?? 'someone' : null,
    }]
  })
}

/** The original of the organisation's own copy, or the copies of another publisher's skill. */
export async function assetRelatives(db: Db, asset: { id: string }, own: boolean, orgPublisher: string | null): Promise<Relatives> {
  if (own) return { original: await originalOf(db, asset.id), copies: [] }
  return { original: null, copies: await copiesOf(db, asset.id, orgPublisher) }
}

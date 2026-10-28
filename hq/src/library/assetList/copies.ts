/**
 * Which of the organisation's skills are its own copies of another publisher's, and of which original (spec part 2
 * *Editing makes your own copy*, D18), read from hq's own record the way switching back reads it (`originOf`). The
 * Library shows a copy and its original as one entry, and each one's page shows the other. Read-only.
 */
import { AGENTHIX_PUBLISHER } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { originOf } from '../../assets/lifecycle/ownCopy'

export type CopyLink = {
  copyId: string
  originId: string
  /** The original's version the copy was made from. */
  copiedFrom: string | null
  /** The copy serves the agents that had the original, which is set aside for it. */
  inUse: boolean
  /** Published since it was copied: a copy not in use then is set aside; one never published is still being made. */
  published: boolean
}

/** The links for the assets given that are copies; anything else is left out. */
export async function copyLinks(db: Db, assetIds: string[]): Promise<CopyLink[]> {
  const out: CopyLink[] = []
  for (const id of assetIds) {
    const origin = await originOf(db, { id, kind: 'SKILL' })
    if (!origin) continue
    const versions = await db.assetVersion.count({ where: { assetId: id } })
    out.push({ copyId: id, originId: origin.asset.id, copiedFrom: origin.line.version ?? null, inUse: origin.asset.setAsideById === id, published: versions > 1 })
  }
  return out
}

/** The organisation's skills that are not removed: the only assets that can be copies. */
export async function ownSkillIds(db: Db, publisher: string | null | undefined): Promise<string[]> {
  if (!publisher) return []
  const own = await db.asset.findMany({ where: { kind: 'SKILL', publisher, removedAt: null, currentVersionId: { not: null } }, select: { id: true } })
  return own.map((a: { id: string }) => a.id)
}

/** Whose an original is, in words a person reads before its title: "Agenthix", "Acme"; null when nobody signed it. */
export function ownerWords(asset: { publisher: string; builtIn: boolean; source: string | null; signer: string | null }): string | null {
  if (asset.signer) return asset.signer
  if (asset.builtIn || (asset.source === 'BUILT_IN' && asset.publisher === AGENTHIX_PUBLISHER)) return 'Agenthix'
  return null
}

/** "Agenthix's Code Review 2.0.0", or "unsigned/code-review 1.3.0" when nobody signed it. */
export function originalWords(o: { owner: string | null; title: string; identity: string; version: string | null }): string {
  const name = o.owner ? `${o.owner}'s ${o.title}` : o.identity
  return o.version ? `${name} ${o.version}` : name
}

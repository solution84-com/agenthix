/**
 * The installed skills a run is given (spec part 5 *Delivery per turn*; L2, L3): every skill every agent has and every
 * skill granted to this agent, at its pinned version, not removed and not set aside for the organisation's own copy
 * (D18). Each carries a `skill` package ref keyed by its version row, so package delivery sends it once per version per
 * site (adr-0072). Built-in skills come from `builtInSkillsFor`.
 */
import type { InstalledSkillEntry } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'

export type InstalledAssetRow = {
  publisher: string
  name: string
  givenToAll: boolean
  builtIn: boolean
  removedAt: Date | null
  setAsideById: string | null
  currentVersion: { id: string; version: string; digest: string } | null
}

/** The entry an installed asset gives a run, or null when it gives none. */
export function installedEntry(asset: InstalledAssetRow): InstalledSkillEntry | null {
  const v = asset.currentVersion
  if (!v || asset.builtIn || asset.removedAt !== null || asset.setAsideById !== null) return null
  return {
    identity: `${asset.publisher}/${asset.name}`,
    version: v.version,
    digest: v.digest,
    level: asset.givenToAll ? 'org' : 'agent',
    ref: { kind: 'skill', key: v.id, digest: v.digest },
  }
}

export async function installedSkillsFor(db: Db, agentId: string): Promise<InstalledSkillEntry[]> {
  const rows = await db.asset.findMany({
    where: {
      kind: 'SKILL', builtIn: false, removedAt: null, setAsideById: null, currentVersionId: { not: null },
      OR: [{ givenToAll: true }, { grants: { some: { agentId } } }],
    },
    select: {
      publisher: true, name: true, givenToAll: true, builtIn: true, removedAt: true, setAsideById: true,
      currentVersion: { select: { id: true, version: true, digest: true } },
    },
    // In the order installed: of two that would stage under one name, the first is kept (stagedNames.ts).
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  return rows.map(installedEntry).filter((e): e is InstalledSkillEntry => e !== null)
}

/** Built-in skills not switched off (L1a, D6): phase 4 ships them. Until then there are none. */
export async function builtInSkillsFor(_db: Db, _agentId: string): Promise<InstalledSkillEntry[]> {
  return []
}

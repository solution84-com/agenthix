/**
 * "Last used" (board U3, UQ4): when hq reads runs' records of the skills they used (4c's reading, the same hostile
 * read), it remembers the newest use of each Library skill and each place skill: when, which agent, and for a
 * Library skill the boundary the run worked in. It is a stamp for people to read and decides nothing, so a failed
 * write (a read-only hq, a race) is let go; the read that called it goes on.
 */
import type { WorkspaceOwnerType } from '@prisma/client'
import { parseAssetIdentity, type RunSkillUse } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { usedSkillsOf } from './usedSkillRecord'

/** More distinct skills than this from one read are not stamped. */
export const LAST_USED_STAMPS = 50

const INSTALLED = new Set(['platform', 'org', 'agent'])
const IN_FILES = new Set(['boundary', 'shared', 'workspace'])

export type UsedRun = { agentId: string; skillsUsed?: unknown; endedAt?: string | null; startedAt?: string | null; createdAt: string }
export type RunPlace = { placeType: WorkspaceOwnerType; placeId: string } | null

type Stamp = { use: RunSkillUse; at: Date; agentId: string }

const whenOf = (run: UsedRun): Date | null => {
  const at = new Date(run.endedAt ?? run.startedAt ?? run.createdAt)
  return Number.isNaN(at.getTime()) ? null : at
}

const keyOf = (u: RunSkillUse) => JSON.stringify([u.source, u.fingerprint, u.identity ?? null, u.placeId ?? null, u.path ?? null, u.personId ?? null])

/** The newest use of each distinct skill across the runs read. */
function newestUses(runs: UsedRun[]): Stamp[] {
  const stamps = new Map<string, Stamp>()
  for (const run of runs) {
    const at = whenOf(run)
    if (!at || typeof run.agentId !== 'string') continue
    for (const use of usedSkillsOf(run.skillsUsed).values()) {
      const key = keyOf(use)
      const held = stamps.get(key)
      if (!held || held.at < at) stamps.set(key, { use, at, agentId: run.agentId })
    }
  }
  return [...stamps.values()].slice(0, LAST_USED_STAMPS)
}

async function stamp(db: Db, { use, at, agentId }: Stamp, place: RunPlace): Promise<void> {
  const newer = { OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: at } }] }
  if (INSTALLED.has(use.source)) {
    const identity = parseAssetIdentity(use.identity)
    await db.asset.updateMany({
      where: { kind: 'SKILL', ...(identity ?? {}), versions: { some: { digest: use.fingerprint } }, ...newer },
      data: { lastUsedAt: at, lastUsedAgentId: agentId, lastUsedPlaceType: place?.placeType ?? null, lastUsedPlaceId: place?.placeId ?? null },
    })
  } else if (IN_FILES.has(use.source) && use.placeId && use.path) {
    await db.placeSkill.updateMany({ where: { placeId: use.placeId, path: use.path, ...newer }, data: { lastUsedAt: at, lastUsedAgentId: agentId } })
  } else if (use.source === 'person' && use.personId) {
    await db.placeSkill.updateMany({
      where: { placeType: 'user', placeId: use.personId, versions: { some: { digest: use.fingerprint } }, ...newer },
      data: { lastUsedAt: at, lastUsedAgentId: agentId },
    })
  }
}

/** Stamps the newest use of each skill the runs used. Never throws. */
export async function noteSkillUses(db: Db, runs: UsedRun[], place: RunPlace): Promise<void> {
  try {
    for (const s of newestUses(runs)) await stamp(db, s, place)
  } catch {
    // A stamp for people to read: a read-only hq or a lost race leaves the older one, and the read goes on.
  }
}

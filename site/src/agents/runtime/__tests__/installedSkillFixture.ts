/**
 * Skills given to a test run the way hq gives them (skills spec part 5 *Delivery per turn*): each one's content put in
 * the package cache under a `skill` ref, and an `installedSkills` entry naming it. At level `agent` a skill stages as
 * `agent-<slug>`, the name an agent package's own skill had. The cache is under `SITE_ROOT`, which the caller sets.
 */
import type { InstalledSkillEntry, InstalledSkillLevel } from '@agenthix/core'
import { storeVerifiedPackage } from '../../../packages/packageCache'
import { makeTransfer } from '../../../packages/__tests__/transferFixture'
import type { RunSkillInputs } from '../skillSources'

/** `skills` maps each slug to its folder's files. */
export async function cacheInstalledSkills(
  skills: Record<string, Record<string, string>>,
  level: InstalledSkillLevel = 'agent',
): Promise<InstalledSkillEntry[]> {
  const entries: InstalledSkillEntry[] = []
  for (const [slug, files] of Object.entries(skills)) {
    const { ref, body } = makeTransfer('skill', `v-${slug}`, files)
    await storeVerifiedPackage(ref, body)
    entries.push({ identity: `acme/${slug}`, version: '1.0.0', digest: ref.digest, level, ref })
  }
  return entries
}

/** A run's skill inputs holding only these installed skills. */
export function installedOnly(
  installed: InstalledSkillEntry[],
  at: { ownerType?: RunSkillInputs['place']['ownerType']; ownerId?: string; agentId?: string } = {},
): RunSkillInputs {
  return {
    place: { ownerType: at.ownerType ?? 'project', ownerId: at.ownerId ?? 'p1' },
    agentId: at.agentId ?? 'a',
    personId: null,
    installed,
    files: [],
    person: [],
  }
}

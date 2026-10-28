/**
 * When the same skill comes from two places (spec part 4, D12, D16): installed by the organisation, then the
 * project's files and workspaces, then the person's own. Only the same identity clashes; different skills all apply.
 * Two of one level are both kept, since staging names each apart (security review M2).
 */
import { formatAssetIdentity, parseAssetIdentity } from '@agenthix/core'

export type SkillLevel = 'installed' | 'project' | 'person'

const RANK: Record<SkillLevel, number> = { installed: 0, project: 1, person: 2 }

export type SkillCandidate<T> = { level: SkillLevel; key: string; label: string; item: T }

export type SetAsideSkill<T> = { item: T; level: SkillLevel; key: string; label: string; by: SkillLevel; reason: string }

function reasonFor(winner: SkillCandidate<unknown>): string {
  if (winner.level === 'installed') {
    return `Set aside: the organisation's installed ${winner.label} is used instead (an installed skill comes first).`
  }
  return `Set aside: this project's own ${winner.label} is used instead (the project's skill comes before a person's).`
}

export function settleClashes<T>(candidates: SkillCandidate<T>[]): { kept: SkillCandidate<T>[]; setAside: SetAsideSkill<T>[] } {
  const best = new Map<string, SkillCandidate<T>>()
  for (const c of candidates) {
    const held = best.get(c.key)
    if (!held || RANK[c.level] < RANK[held.level]) best.set(c.key, c)
  }
  const kept: SkillCandidate<T>[] = []
  const setAside: SetAsideSkill<T>[] = []
  for (const c of candidates) {
    const winner = best.get(c.key)!
    if (RANK[c.level] === RANK[winner.level]) kept.push(c)
    else setAside.push({ item: c.item, level: c.level, key: c.key, label: c.label, by: winner.level, reason: reasonFor(winner) })
  }
  return { kept, setAside }
}

/**
 * What a skill is the same skill as: the `publisher/name` identity it names (an installed skill's, or one copied in
 * with *Add to this place*), else its name, else its folder. Renaming a skill in files makes it a different skill.
 */
export function skillKey(skill: { identity?: string | null; name?: string | null; path: string }): string {
  const identity = parseAssetIdentity(skill.identity)
  if (identity) return formatAssetIdentity(identity)
  const name = skill.name?.trim()
  if (name) return name.toLowerCase()
  return (skill.path.split('/').pop() ?? skill.path).toLowerCase()
}

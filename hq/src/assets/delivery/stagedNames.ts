/**
 * Two skills a run is told about must never stage under one name (security review M2): the site would refuse both.
 * hq names each as the site will (`<source>-<slug>`, adr-0084) and, of two that share one, sends only the one higher in
 * the clash order, or at the same level the one installed first; the other is set aside, and the run's notes say so.
 * A workspace's skills are numbered apart by the site, so they never share a name.
 */
import { INSTALLED_SKILL_SOURCE, deliveredSkillName, namespacedSkillName, type FileSkillEntry, type InstalledSkillEntry, type PersonSkillEntry } from '@agenthix/core'
import type { SetAsideSkill, SkillCandidate, SkillLevel } from './clashOrder'

export type NamedItem =
  | { kind: 'installed'; entry: InstalledSkillEntry }
  | { kind: 'file'; entry: FileSkillEntry }
  | { kind: 'person'; entry: PersonSkillEntry }

export const SAME_NAME_REASON = 'Set aside: another skill has the same name here.'

const RANK: Record<SkillLevel, number> = { installed: 0, project: 1, person: 2 }

/** The name the site stages it under; null when it has none, which the site refuses and records. */
export function stagedNameOf(item: NamedItem): string | null {
  if (item.kind === 'installed') return deliveredSkillName(INSTALLED_SKILL_SOURCE[item.entry.level], item.entry.identity)
  if (item.kind === 'person') return deliveredSkillName('person', item.entry.identity)
  const { group, path } = item.entry
  if (group === 'workspace') return `workspace:${path}`
  return namespacedSkillName(group === 'agent' ? 'boundary' : 'shared', path.slice(path.lastIndexOf('/') + 1))
}

/** `candidates` in the order they were installed or found; of each name, the first of the highest level is kept. */
export function settleStagedNames<T extends NamedItem>(candidates: SkillCandidate<T>[]): { kept: SkillCandidate<T>[]; setAside: SetAsideSkill<T>[] } {
  const owner = new Map<string, SkillCandidate<T>>()
  for (const c of candidates) {
    const name = stagedNameOf(c.item)
    if (name === null) continue
    const held = owner.get(name)
    if (!held || RANK[c.level] < RANK[held.level]) owner.set(name, c)
  }
  const kept: SkillCandidate<T>[] = []
  const setAside: SetAsideSkill<T>[] = []
  for (const c of candidates) {
    const name = stagedNameOf(c.item)
    const winner = name === null ? c : owner.get(name)!
    if (winner === c) kept.push(c)
    else setAside.push({ item: c.item, level: c.level, key: c.key, label: c.label, by: winner.level, reason: SAME_NAME_REASON })
  }
  return { kept, setAside }
}

import { describe, it, expect } from 'vitest'
import type { FileSkillEntry, InstalledSkillEntry, PersonSkillEntry } from '@agenthix/core'
import { SAME_NAME_REASON, settleStagedNames, stagedNameOf, type NamedItem } from '../stagedNames'
import type { SkillCandidate, SkillLevel } from '../clashOrder'

const D = 'd'.repeat(64)
const installed = (identity: string, level: InstalledSkillEntry['level'] = 'org'): NamedItem =>
  ({ kind: 'installed', entry: { identity, version: '1.0.0', digest: D, level } })
const file = (path: string, group: FileSkillEntry['group'] = 'place'): NamedItem =>
  ({ kind: 'file', entry: { placeId: 'p1', path, fingerprint: D, group } })
const person = (identity: string): NamedItem => ({ kind: 'person', entry: { identity, version: '1', digest: D } satisfies PersonSkillEntry })
const at = (level: SkillLevel, item: NamedItem, key = JSON.stringify(item.entry)): SkillCandidate<NamedItem> => ({ level, key, label: key, item })

describe('the name a skill stages under, as the site gives it @SC-1653', () => {
  it('an installed skill by its level, a person\'s as theirs, a place\'s and an agent\'s folder by theirs', () => {
    expect(stagedNameOf(installed('acme/review', 'org'))).toBe('org-review')
    expect(stagedNameOf(installed('acme/team/review', 'agent'))).toBe('agent-review')
    expect(stagedNameOf(installed('agenthix/tasks', 'builtin'))).toBe('platform-tasks')
    expect(stagedNameOf(person('acme/review'))).toBe('person-review')
    expect(stagedNameOf(file('.agents/skills/review'))).toBe('shared-review')
    expect(stagedNameOf(file('.agents/agents/a1/skills/review', 'agent'))).toBe('boundary-review')
  })

  it('a workspace\'s skill by its own path, since the site numbers each workspace and folder apart', () => {
    expect(stagedNameOf(file('workspace/w1/.claude/skills/review', 'workspace'))).not.toBe(stagedNameOf(file('workspace/w2/.claude/skills/review', 'workspace')))
  })

  it('none for what can\'t be staged at all: the site refuses it and says why', () => {
    expect(stagedNameOf(installed('not-an-identity'))).toBeNull()
  })
})

describe('two skills that would stage under one name @security-M2 @SC-1653', () => {
  it('keeps the earlier installed at the same level and sets the later aside, whichever publisher', () => {
    const first = at('installed', installed('acme/review'))
    const later = at('installed', installed('other/review'))
    const { kept, setAside } = settleStagedNames([first, later])
    expect(kept).toEqual([first])
    expect(setAside).toEqual([{ item: later.item, level: 'installed', key: later.key, label: later.label, by: 'installed', reason: SAME_NAME_REASON }])
  })

  it('keeps the first of two of the person\'s own', () => {
    const p = at('person', person('acme/review'))
    const p2 = at('person', person('other/review'))
    expect(settleStagedNames([p, p2]).kept).toEqual([p])
  })

  it('keeps every skill whose name is its own, and those the site will refuse', () => {
    const list = [
      at('installed', installed('acme/review', 'org')), at('installed', installed('acme/review2', 'agent')),
      at('installed', installed('other/review', 'agent')), at('project', file('.agents/skills/review')),
      at('person', person('acme/review')), at('installed', installed('bad')), at('installed', installed('worse')),
    ]
    const { kept, setAside } = settleStagedNames(list)
    expect(kept).toEqual(list)
    expect(setAside).toEqual([])
  })

  it('says why in words a person reads', () => {
    expect(SAME_NAME_REASON).toMatch(/another skill has the same name here/)
  })
})

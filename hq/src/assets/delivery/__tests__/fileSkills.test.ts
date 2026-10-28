import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../sites/channel', () => ({ siteChannelRegistry: {} }))

import type { PlaceSkill } from '@prisma/client'
import type { LocationScanSkillsResult, ScannedSkill } from '@agenthix/core'
import { keptFindings, switchedOn } from '../fileSkills'

const F = 'a'.repeat(64)
const G = 'b'.repeat(64)
const found = (over: Partial<ScannedSkill> = {}): ScannedSkill => ({ group: 'place', path: 'release', fingerprint: F, name: 'release', description: 'd', ...over })
const scan = (skills: ScannedSkill[]): LocationScanSkillsResult => ({ skills, problems: [], truncated: false })

describe('what hq keeps of a scan', () => {
  it('keeps the place\'s, this agent\'s and this run\'s workspaces\' skills', () => {
    const skills = [
      found(),
      found({ group: 'agent', agentId: 'ada' }),
      found({ group: 'workspace', workspaceId: 'w1', workspaceFolder: '.claude/skills' }),
    ]
    expect(keptFindings(scan(skills), 'ada', ['w1'])).toHaveLength(3)
  })

  it('leaves out another agent\'s, another workspace\'s, and a folder outside the roots', () => {
    const skills = [
      found({ group: 'agent', agentId: 'bob' }),
      found({ group: 'workspace', workspaceId: 'w2', workspaceFolder: '.agents/skills' }),
      found({ group: 'workspace', workspaceId: 'w1', workspaceFolder: '../../etc' }),
    ]
    expect(keptFindings(scan(skills), 'ada', ['w1'])).toEqual([])
  })

  it('leaves out a path that climbs or hides, and a fingerprint that is not one', () => {
    const skills = [found({ path: '../outside' }), found({ path: '.hidden' }), found({ fingerprint: 'nope' })]
    expect(keptFindings(scan(skills), 'ada', [])).toEqual([])
  })

  it('reads nothing from an answer that is not a scan', () => {
    expect(keptFindings({} as LocationScanSkillsResult, 'ada', [])).toEqual([])
  })
})

const row = (over: Partial<PlaceSkill> = {}): PlaceSkill => ({
  id: 'r1', placeType: 'project', placeId: 'proj', path: '.agents/skills/release', group: 'PLACE', agentId: null, workspaceId: null,
  switch: null, switchFingerprint: null, switchedById: null, switchedAt: null, lastFingerprint: F, lastSeenAt: new Date(), goneAt: null,
  setAsideReason: null, name: '', description: '', lastUsedAt: null, lastUsedAgentId: null, createdAt: new Date(), updatedAt: new Date(), ...over,
})

describe('which skills in files a run is told about', () => {
  it('none new under Off by default; each under On by default', () => {
    expect(switchedOn([found()], [row()], 'proj', null, 'OFF')).toEqual([])
    expect(switchedOn([found()], [row()], 'proj', null, 'ON')).toEqual([
      { entry: { placeId: 'proj', path: '.agents/skills/release', fingerprint: F, group: 'place' }, key: 'release', label: 'release', rowId: 'r1' },
    ])
  })

  it('one switched on, by place, path and the fingerprint it was switched on for', () => {
    expect(switchedOn([found()], [row({ switch: 'ON', switchFingerprint: F })], 'proj', null, 'OFF')).toHaveLength(1)
  })

  it('not once its files changed under Off by default', () => {
    expect(switchedOn([found({ fingerprint: G })], [row({ switch: 'ON', switchFingerprint: F, lastFingerprint: G })], 'proj', null, 'OFF')).toEqual([])
  })

  it('not under a place\'s stricter default', () => {
    expect(switchedOn([found()], [row()], 'proj', 'OFF', 'ON')).toEqual([])
  })

  it('not one switched off', () => {
    expect(switchedOn([found()], [row({ switch: 'OFF', switchFingerprint: F })], 'proj', null, 'ON')).toEqual([])
  })
})

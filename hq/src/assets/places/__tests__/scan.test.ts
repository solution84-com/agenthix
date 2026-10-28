import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { placeSkillPath } from '../scan'

const skill = { fingerprint: 'a'.repeat(64), name: 'x', description: 'y', path: 'review' }

describe('the path a found skill is kept under', () => {
  it('names the root it was found under', () => {
    expect(placeSkillPath({ ...skill, group: 'place' })).toBe('.agents/skills/review')
    expect(placeSkillPath({ ...skill, group: 'agent', agentId: 'ada' })).toBe('.agents/agents/ada/skills/review')
    expect(placeSkillPath({ ...skill, group: 'workspace', workspaceId: 'w1', workspaceFolder: '.claude/skills' }))
      .toBe('workspace/w1/.claude/skills/review')
  })

  it('keeps two workspaces with the same folder apart', () => {
    const a = placeSkillPath({ ...skill, group: 'workspace', workspaceId: 'w1', workspaceFolder: '.agents/skills' })
    const b = placeSkillPath({ ...skill, group: 'workspace', workspaceId: 'w2', workspaceFolder: '.agents/skills' })
    expect(a).not.toBe(b)
  })

  it('refuses a finding that names no safe root', () => {
    expect(placeSkillPath({ ...skill, group: 'agent', agentId: '../x' })).toBeNull()
    expect(placeSkillPath({ ...skill, group: 'agent' })).toBeNull()
    expect(placeSkillPath({ ...skill, group: 'workspace', workspaceId: 'w1' })).toBeNull()
  })

  it('refuses a path that is not plain relative segments, and a workspace folder that is not a skill root', () => {
    for (const path of ['../x', 'a/../b', '/abs', 'a\\b', 'a//b', '', './a', 'a/']) {
      expect(placeSkillPath({ ...skill, path, group: 'place' }), path).toBeNull()
    }
    expect(placeSkillPath({ ...skill, path: 'tools/review', group: 'place' })).toBe('.agents/skills/tools/review')
    expect(placeSkillPath({ ...skill, group: 'workspace', workspaceId: 'w1', workspaceFolder: 'src' })).toBeNull()
    expect(placeSkillPath({ ...skill, group: 'workspace', workspaceId: 'w1', workspaceFolder: '../.agents/skills' })).toBeNull()
    expect(placeSkillPath({ ...skill, group: 'workspace', workspaceId: 'w/1', workspaceFolder: '.agents/skills' })).toBeNull()
    expect(placeSkillPath({ ...skill, group: 'workspace', workspaceId: '..', workspaceFolder: '.agents/skills' })).toBeNull()
  })
})

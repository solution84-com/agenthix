import { describe, it, expect } from 'vitest'
import { buildSdkBuiltinTools, buildSdkDisallowedTools, BLACKLISTED_SDK_TOOLS, fromSdkToolName } from '../sdkNames'
import type { ApprovedManifest } from '../types'

const manifest: ApprovedManifest = { tools: [], bashPatterns: [], approvedAt: 't' }

describe('the built-in tools a Claude agent sees', () => {
  it('always include the harness\'s own to-do list and Skill', () => {
    expect(buildSdkBuiltinTools({ bypassed: false, neverTools: [], allowedTools: [], approvedManifest: manifest })).toEqual(['TodoWrite', 'Skill'])
    expect(buildSdkBuiltinTools({
      bypassed: false,
      neverTools: ['bash'],
      allowedTools: [{ name: 'read_file', state: 'ask' }, { name: 'bash', state: 'never' }],
      approvedManifest: manifest,
    })).toEqual(['Read', 'TodoWrite', 'Skill'])
    expect(buildSdkBuiltinTools({ bypassed: true, neverTools: [], allowedTools: undefined })).toContain('TodoWrite')
    expect(buildSdkBuiltinTools({ bypassed: true, neverTools: [], allowedTools: undefined })).toContain('Skill')
  })

  it('leave out a restricted agent\'s ask-state built-ins in a run with no manifest, which nobody can approve', () => {
    const unattended = {
      bypassed: false,
      neverTools: [],
      allowedTools: [
        { name: 'read_file', state: 'always' as const },
        { name: 'grep_files', state: 'ask' as const },
        { name: 'write_file', state: 'ask' as const },
        { name: 'bash', state: 'ask' as const },
      ],
    }
    expect(buildSdkBuiltinTools(unattended)).toEqual(['Read', 'TodoWrite', 'Skill'])
    expect(buildSdkBuiltinTools({ ...unattended, approvedManifest: manifest })).toEqual(['Read', 'Grep', 'Write', 'Bash', 'TodoWrite', 'Skill'])
  })

  it('keep bash in a run with no manifest while an always pattern lets some command run', () => {
    const unattended = { bypassed: false, neverTools: [], allowedTools: [{ name: 'bash', state: 'ask' as const }] }
    expect(buildSdkBuiltinTools({ ...unattended, allowedBashPatterns: [{ pattern: 'git', state: 'always' }] })).toEqual(['Bash', 'TodoWrite', 'Skill'])
    expect(buildSdkBuiltinTools({ ...unattended, allowedBashPatterns: [] })).toEqual(['TodoWrite', 'Skill'])
  })

  it('keep bash in a run with no manifest while bash is always: any other command runs', () => {
    const unattended = { bypassed: false, neverTools: [], allowedTools: [{ name: 'bash', state: 'always' as const }] }
    expect(buildSdkBuiltinTools({ ...unattended, allowedBashPatterns: [] })).toEqual(['Bash', 'TodoWrite', 'Skill'])
  })

  it('keep Skill whatever the agent\'s permissions say, in a run with no manifest too: no permission is named for it', () => {
    const unattended = { bypassed: false, allowedTools: [{ name: 'skill', state: 'never' as const }, { name: 'Skill', state: 'ask' as const }] }
    expect(buildSdkBuiltinTools({ ...unattended, neverTools: ['skill', 'Skill'] })).toEqual(['TodoWrite', 'Skill'])
    expect(buildSdkBuiltinTools({ ...unattended, neverTools: [], approvedManifest: manifest })).toEqual(['TodoWrite', 'Skill'])
  })

  it('name Skill as skill, as OpenCode does, and nothing else of Claude\'s own', () => {
    expect(fromSdkToolName('Skill')).toBe('skill')
    expect(fromSdkToolName('TodoWrite')).toBeNull()
  })

  it('leave a bypassed agent\'s set whole in a run with no manifest', () => {
    expect(buildSdkBuiltinTools({ bypassed: true, neverTools: [], allowedTools: undefined })).toContain('Grep')
  })
})

describe('the tools a Claude run disallows', () => {
  const restricted = {
    bypassed: false,
    neverTools: ['create_project'],
    allowedTools: [
      { name: 'fetch_my_queued_tasks', state: 'always' as const },
      { name: 'run_task', state: 'always' as const },
      { name: 'create_task', state: 'ask' as const },
      { name: 'create_project', state: 'never' as const },
    ],
  }

  it('are the meta tools and never-state platform tools in a run with a manifest', () => {
    expect(buildSdkDisallowedTools({ ...restricted, approvedManifest: manifest })).toEqual([...BLACKLISTED_SDK_TOOLS, 'mcp__platform__create_project'])
  })

  it('add every ask-state platform tool in a run with no manifest, missing ones included, and never the always ones', () => {
    const disallowed = buildSdkDisallowedTools(restricted)
    expect(disallowed).toContain('mcp__platform__create_task')
    expect(disallowed).toContain('mcp__platform__list_tasks')
    expect(disallowed).not.toContain('mcp__platform__fetch_my_queued_tasks')
    expect(disallowed).not.toContain('mcp__platform__run_task')
    expect(disallowed.filter(t => t === 'mcp__platform__create_project')).toHaveLength(1)
  })

  it('add nothing for a bypassed agent in a run with no manifest', () => {
    expect(buildSdkDisallowedTools({ bypassed: true, neverTools: [], allowedTools: undefined })).toEqual(BLACKLISTED_SDK_TOOLS)
  })
})

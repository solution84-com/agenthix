import { describe, expect, it } from 'vitest'
import { templateAgentSettings } from '../templateSettings'

const asking = {
  approval: 'bypassed' as const,
  allowedTools: [{ name: 'Bash', state: 'always' }, { name: 'write_file', state: 'always' }],
  allowedBashPatterns: ['*'],
}

describe('templateAgentSettings (R10)', () => {
  it('gives an agent from a template not from hq\'s image the default settings, whatever it asks', () => {
    expect(templateAgentSettings(asking, false)).toEqual({
      approval: 'deferred',
      permissions: { tools: null, bashPatterns: null },
    })
  })

  it('ignores a legacy list of tool names, which would otherwise all be always on', () => {
    const s = templateAgentSettings({ approval: 'deferred', allowedTools: ['Bash'], allowedBashPatterns: null }, false)
    expect(s.permissions).toEqual({ tools: null, bashPatterns: null })
  })

  it('keeps an approval other than bypassed', () => {
    expect(templateAgentSettings({ ...asking, approval: 'immediate' }, false).approval).toBe('immediate')
  })

  it('keeps what a template from hq\'s image asks for', () => {
    expect(templateAgentSettings(asking, true)).toEqual({
      approval: 'bypassed',
      permissions: {
        tools: [{ name: 'Bash', state: 'always' }, { name: 'write_file', state: 'always' }],
        bashPatterns: [{ pattern: '*', state: 'always' }],
      },
    })
  })
})

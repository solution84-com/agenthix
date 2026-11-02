import { describe, expect, it } from 'vitest'
import type { ToolPermission } from '@agenthix/core'
import { getToolState } from '../../../agents/runtime/toolPermissions'
import { withCodeWorkTools } from '../forwardedCodeSchemas'

describe('withCodeWorkTools', () => {
  const deferred: ToolPermission[] = [
    { name: 'edit_file', state: 'always' },
    { name: 'bash', state: 'never' },
  ]

  it('gives a code-work run commit and merge_into_main without asking, where an agent has them in no setting', () => {
    expect(getToolState('commit', deferred)).toBe('ask')
    const given = withCodeWorkTools(deferred)
    expect(getToolState('commit', given)).toBe('always')
    expect(getToolState('merge_into_main', given)).toBe('always')
    expect(getToolState('update_from_main', given)).toBe('always')
  })

  it('leaves every other tool as it was, and lists each code tool once', () => {
    const given = withCodeWorkTools([...deferred, { name: 'commit', state: 'never' }])
    expect(getToolState('edit_file', given)).toBe('always')
    expect(getToolState('bash', given)).toBe('never')
    expect(given.filter(p => p.name === 'commit')).toEqual([{ name: 'commit', state: 'always' }])
  })
})

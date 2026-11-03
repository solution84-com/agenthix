import { describe, expect, it } from 'vitest'
import { withBranches } from '../workspaceDeleteWords'

const branch = (name: string, over: Record<string, unknown> = {}) => ({ name, whose: { personName: 'Mia' }, ahead: 6, working: null, ...over })

describe("the workspace delete's confirm, with its branches (Default 5) @SC-1677", () => {
  it('leaves the confirm as it is when there are no branches', () => {
    expect(withBranches('Delete — it holds no files', [])).toBe('Delete — it holds no files')
    expect(withBranches('Delete — it holds no files', undefined)).toBe('Delete — it holds no files')
  })

  it('names each branch, whose it is, how far ahead, and an agent that stops', () => {
    const words = withBranches('Delete', [branch('login-page', { working: { agentName: 'Kernel' } }), branch('fix', { ahead: 1 })])
    expect(words).toContain('Its 2 branches go too')
    expect(words).toContain('login-page (Mia, 6 commits ahead of main, Kernel is working on it and stops)')
    expect(words).toContain('fix (Mia, 1 commit ahead of main)')
  })

  it('counts past five', () => {
    const words = withBranches('Delete', Array.from({ length: 7 }, (_, i) => branch(`b${i}`)))
    expect(words).toContain('; 2 more')
  })
})

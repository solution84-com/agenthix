import { describe, it, expect } from 'vitest'
import { filesToolCounts } from '../filesToolCounts'
import { silentSitesLine, allowedToolsText } from '../workspaceNotices'

describe('what the four tools show in the tools list', () => {
  it('counts each list once it has been read, and says nothing before', () => {
    expect(filesToolCounts({})).toEqual({})
    expect(filesToolCounts({
      files: [{ name: 'AGENTS.md' }, { name: '.agents', isDir: true }, { name: 'specs', isDir: true }],
      artefacts: [{ name: 'a.md' }],
      topics: [{ path: 'a.md', title: 'A', summary: '', tags: [], modifiedAt: '' }, { path: 'b.md', title: 'B', summary: '', tags: [], modifiedAt: '' }],
      workspaces: [{}, {}, {}],
    })).toEqual({ files: '2', artefacts: '1', knowledge: '2 topics', workspaces: '3' })
  })

  it('says "1 topic" for one', () => {
    expect(filesToolCounts({ topics: [{ path: 'a.md', title: 'A', summary: '', tags: [], modifiedAt: '' }] }).knowledge).toBe('1 topic')
  })
})

describe('the Workspaces tool’s notices', () => {
  const site = (label: string) => ({ siteId: label, label, reason: 'offline' as const, detail: '' })

  it('says nothing when every site answered', () => {
    expect(silentSitesLine([])).toBeNull()
  })

  it('says which sites, in one line', () => {
    expect(silentSitesLine([site('Office Mac')])).toEqual({ line: "1 site isn't answering, so its workspaces aren't shown.", names: ['Office Mac'] })
    expect(silentSitesLine([site('A'), site('B')])?.line).toBe("2 sites aren't answering, so their workspaces aren't shown.")
  })

  it('reads a tool cap as All, or how many tools', () => {
    expect(allowedToolsText(null)).toBe('All')
    expect(allowedToolsText(['a'])).toBe('1 tool')
    expect(allowedToolsText([])).toBe('0 tools')
  })
})

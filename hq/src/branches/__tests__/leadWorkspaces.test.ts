import { describe, expect, it } from 'vitest'
import { describeWorkspaces } from '../leadWorkspaces'

describe("what the lead is told of a place's workspaces @SC-1675", () => {
  it('lists each with its id, marking the code workspaces', () => {
    const lines = describeWorkspaces([{ key: 'SHOP', workspaces: [{ id: 'w1', name: 'shop-app', git: true }, { id: 'w2', name: 'notes', git: false }] }])
    expect(lines).toContain('- SHOP: shop-app (workspaceId w1): a code workspace (Git)')
    expect(lines).toContain('- SHOP: notes (workspaceId w2)')
    expect(lines.join('\n')).toContain('goes to a task on that workspace')
  })

  it('says nothing when the places have no workspace', () => {
    expect(describeWorkspaces([{ key: 'SHOP', workspaces: [] }])).toEqual([])
  })
})

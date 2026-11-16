import { describe, expect, it } from 'vitest'
import { describeWorkerWorkspaces, describeWorkspaces } from '../leadWorkspaces'

describe("what the lead is told of a place's workspaces @SC-1675", () => {
  it('lists each with its id, marking the code workspaces', () => {
    const lines = describeWorkspaces([{ key: 'SHOP', workspaces: [{ id: 'w1', name: 'shop-app', git: true }, { id: 'w2', name: 'notes', git: false }] }])
    expect(lines).toContain('- SHOP: shop-app (workspaceId w1): a code workspace (Git)')
    expect(lines).toContain('- SHOP: notes (workspaceId w2)')
    expect(lines.join('\n')).toContain('pass one\'s id as workspaceId')
  })

  it('tells start_work to name the workspace; the rules for its branch are the base instructions\'', () => {
    const text = describeWorkerWorkspaces([{ key: 'SHOP', workspaces: [{ id: 'w1', name: 'shop-app', git: true }] }]).join('\n')
    expect(text).toContain('- SHOP: shop-app (workspaceId w1): a code workspace (Git)')
    expect(text).toContain("pass one's id as `workspace`")
    expect(describeWorkerWorkspaces([{ key: 'SHOP', workspaces: [] }])).toEqual([])
  })

  it('says nothing when the places have no workspace', () => {
    expect(describeWorkspaces([{ key: 'SHOP', workspaces: [] }])).toEqual([])
  })
})

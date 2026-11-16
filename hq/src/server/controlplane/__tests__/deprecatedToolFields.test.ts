/**
 * The tool fields deprecated before v0.1.0 are no longer offered (lean agent context spec, *Every tool slimmed*), and
 * a site one version back that still sends one is served, not refused: the data path validates with these shapes and
 * drops any key they do not declare (dataApi.ts). Every tool names its area for the tool search.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { TOOL_AREAS } from '@agenthix/core'
import { ALL_CONTROL_PLANE_TOOLS } from '../toolSchemas'
import { itemKindOf } from '../memoryOps'

const dataPath = (name: string) => z.object(ALL_CONTROL_PLANE_TOOLS.find(t => t.name === name)!.schema)
const fields = (name: string) => Object.keys(ALL_CONTROL_PLANE_TOOLS.find(t => t.name === name)!.schema)

describe('the deprecated tool fields', () => {
  it('are no longer offered', () => {
    expect(fields('attach_file')).not.toContain('agentId')
    expect(fields('add_comment')).not.toContain('agentId')
    expect(fields('list_products')).not.toContain('agentId')
    expect(fields('remember')).not.toContain('scope')
    expect(fields('forget')).not.toContain('scope')
    expect(dataPath('remember').safeParse({ title: 't', body: 'b', kind: 'preference' }).success).toBe(false)
  })

  it('are dropped, not refused, when an older site still sends them', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['attach_file', { taskId: 'WAL-2', name: 'Notes', filename: 'n.md', content: 'x', agentId: 'a1' }, 'agentId'],
      ['add_comment', { taskId: 'WAL-2', content: 'Done', agentId: 'a1' }, 'agentId'],
      ['list_products', { agentId: 'a1' }, 'agentId'],
      ['remember', { title: 't', body: 'b', kind: 'fact', scope: 'person' }, 'scope'],
      ['forget', { key: 'k', scope: 'agent_place' }, 'scope'],
    ]
    for (const [name, args, dropped] of cases) {
      const parsed = dataPath(name).safeParse(args)
      expect(parsed.success, name).toBe(true)
      expect(parsed.success && Object.keys(parsed.data), name).not.toContain(dropped)
    }
  })
})

describe('remember', () => {
  it('needs only a title and a body, and a memory left without a kind is a fact', () => {
    expect(dataPath('remember').safeParse({ title: 'Deploys', body: 'Friday deploys need sign-off' }).success).toBe(true)
    expect(dataPath('remember').safeParse({ title: 'Deploys' }).success).toBe(false)
    expect(itemKindOf(undefined)).toBe('FACT')
    expect(itemKindOf('rule')).toBe('RULE')
  })
})

describe('every tool on the data path', () => {
  it('names its area', () => {
    for (const t of ALL_CONTROL_PLANE_TOOLS) expect(TOOL_AREAS, t.name).toContain(t.area)
  })
})

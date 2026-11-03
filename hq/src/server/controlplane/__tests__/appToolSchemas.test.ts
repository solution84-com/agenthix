import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { APP_TOOL_DECLARATIONS } from '@agenthix/core'
import { ALL_CONTROL_PLANE_TOOLS } from '../toolSchemas'
import { APP_TOOL_SCHEMAS } from '../appToolSchemas'
import {
  ADMINISTRATIVE_MCP_TOOLS, ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, SYSTEM_MCP_TOOLS,
} from '../../../shared/mcpTools'

const schema = (name: string) => z.object(APP_TOOL_SCHEMAS.find(t => t.name === name)!.schema)

describe("a live preview's app tools @SC-1701", () => {
  it("are core's declarations, on the data path, once each", () => {
    expect(Object.values(SYSTEM_MCP_TOOLS.APPS)).toEqual(APP_TOOL_DECLARATIONS.map(d => d.name))
    for (const d of APP_TOOL_DECLARATIONS) {
      const tool = APP_TOOL_SCHEMAS.find(t => t.name === d.name)!
      expect(tool.description).toBe(d.description)
      expect(ALL_CONTROL_PLANE_TOOLS.filter(t => t.name === d.name)).toHaveLength(1)
    }
  })

  it('are in no access tier: only a run on a branch with a live preview is given them', () => {
    for (const tier of [ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, ADMINISTRATIVE_MCP_TOOLS]) {
      for (const name of Object.values(SYSTEM_MCP_TOOLS.APPS)) expect(tier).not.toContain(name)
    }
  })

  it('take what each needs, and nothing the agent could aim at another workspace or branch', () => {
    const start = schema('start_app').safeParse({
      name: 'web', folder: 'apps/web', command: 'npm run dev', port: '5173', workspace: 'w2', branch: 'main',
    })
    expect(start.success && start.data).toEqual({ name: 'web', folder: 'apps/web', command: 'npm run dev', port: '5173' })
    expect(schema('start_app').safeParse({ name: 'web' }).success).toBe(false)
    expect(schema('stop_app').safeParse({}).success).toBe(false)
    expect(schema('list_apps').safeParse({}).success).toBe(true)
    expect(schema('reload_view').safeParse({}).success).toBe(true)
    expect(schema('set_auto_reload').safeParse({ auto: false }).success).toBe(true)
    expect(schema('set_auto_reload').safeParse({ auto: 'no' }).success).toBe(false)
  })
})

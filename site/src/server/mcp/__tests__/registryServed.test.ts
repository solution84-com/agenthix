/**
 * Every tool the registry offers an agent must be one this site actually
 * serves: an advertised tool nothing serves fails mid-run, where it is
 * least recoverable. The site serves three tools itself and forwards the rest.
 */
import { describe, it, expect } from 'vitest'
import { ALL_SYSTEM_MCP_TOOL_NAMES } from '../../../shared/mcpTools'
import { FORWARDED_TOOLS } from '../forwardedToolSchemas'

const SERVED_LOCALLY = ['ping', 'get_site_info', 'stop_processes']

describe('the MCP tool registry and what the site serves agree', () => {
  const served = new Set([...SERVED_LOCALLY, ...FORWARDED_TOOLS.map((t) => t.name)])

  it.each([...ALL_SYSTEM_MCP_TOOL_NAMES].sort())('%s is served', (name) => {
    expect(served.has(name)).toBe(true)
  })

  it('does not advertise request_workspace_git', () => {
    expect(ALL_SYSTEM_MCP_TOOL_NAMES.has('request_workspace_git')).toBe(false)
  })
})

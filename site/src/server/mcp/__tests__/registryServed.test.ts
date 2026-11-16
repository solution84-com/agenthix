/**
 * Every tool the registry offers an agent must be one this site actually
 * serves: an advertised tool nothing serves fails mid-run, where it is
 * least recoverable. The site serves a few tools itself, the tool search among them, and forwards the rest.
 */
import { describe, it, expect } from 'vitest'
import { ALL_SYSTEM_MCP_TOOL_NAMES } from '../../../shared/mcpTools'
import { FORWARDED_TOOLS } from '../forwardedToolSchemas'

const SERVED_LOCALLY = ['stop_processes', 'find_tools', 'use_tool']

describe('the MCP tool registry and what the site serves agree', () => {
  const served = new Set([...SERVED_LOCALLY, ...FORWARDED_TOOLS.map((t) => t.name)])

  it.each([...ALL_SYSTEM_MCP_TOOL_NAMES].sort())('%s is served', (name) => {
    expect(served.has(name)).toBe(true)
  })

  it('does not advertise ping or get_site_info, which no model needs', () => {
    expect(ALL_SYSTEM_MCP_TOOL_NAMES.has('ping')).toBe(false)
    expect(ALL_SYSTEM_MCP_TOOL_NAMES.has('get_site_info')).toBe(false)
  })

  it('does not advertise request_workspace_git', () => {
    expect(ALL_SYSTEM_MCP_TOOL_NAMES.has('request_workspace_git')).toBe(false)
  })
})

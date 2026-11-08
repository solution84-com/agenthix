import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'

vi.mock('../../server/siteConfig', () => ({ getSitePublicUrl: () => 'https://my-site.example' }))

import { createMcpServer } from '../../server/mcp/mcpServer'
import { ALL_CONTROL_PLANE_TOOLS } from '../../server/controlplane/toolSchemas'
import { ALL_RUNTIME_TOOL_NAMES } from '../../shared/runtimeTools'

const ASSETS = path.resolve(__dirname, '../../../assets')

async function filesUnder(dir: string, ext: RegExp): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await filesUnder(full, ext)))
    else if (ext.test(entry.name)) out.push(full)
  }
  return out
}

/** Every tool an agent can be told to call: what the MCP server registers for a run, what the
 *  control-plane registry dispatches (site's MCP forwards those), and the runtime's own tools. */
function realToolNames(): Set<string> {
  const claims = {
    tokenType: 'capability' as const,
    userId: 'u1', runner: { kind: 'person' as const, userId: 'u1' }, startedBy: 'person' as const, agentId: 'a1', sessionId: 's1',
    projectId: null, workspaceId: null, taskId: null, role: null, siteId: 'site-local',
    permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registered = Object.keys((createMcpServer({ caller: { kind: 'run', claims } }) as any)._registeredTools as Record<string, unknown>)
  return new Set([...registered, ...ALL_CONTROL_PLANE_TOOLS.map(t => t.name), ...ALL_RUNTIME_TOOL_NAMES])
}

// The Claude SDK's own sub-agent tool: agents' allowedTools name it, and the runtime passes it through.
const SDK_BUILT_INS = new Set(['Agent'])

// snake_case words the skills use that are not tools: GitHub API vocabulary.
const GITHUB_VOCABULARY = new Set(['workflow_dispatch', 'pull_requests'])

// Column names some agents' instructions write as the board templates (now gone) spelled them: not tools.
const COLUMN_WORDS = new Set(['in_progress', 'in_review'])

describe('tool names in shipped assets', () => {
  it('finds the tools the assets were written against (guards the scan)', () => {
    const real = realToolNames()
    for (const name of ['list_tasks', 'add_comment', 'start_app', 'get_site_info', 'read_file']) {
      expect(real.has(name)).toBe(true)
    }
    expect(real.has('request_project_git')).toBe(false)
    expect(real.has('resolve_git_credential')).toBe(false)
  })

  it('every tool an agent.json allows or forbids exists', async () => {
    const real = realToolNames()
    const unknown: string[] = []
    for (const file of await filesUnder(ASSETS, /agent\.json$/)) {
      const parsed = JSON.parse(await fs.readFile(file, 'utf-8')) as { allowedTools?: Array<string | { name: string }> }
      for (const entry of parsed.allowedTools ?? []) {
        const name = typeof entry === 'string' ? entry : entry.name
        if (!real.has(name) && !SDK_BUILT_INS.has(name)) unknown.push(`${path.relative(ASSETS, file)}: ${name}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('every snake_case name a skill or instruction tells an agent to use is a tool that exists', async () => {
    const real = realToolNames()
    const notTools = new Set([...GITHUB_VOCABULARY, ...COLUMN_WORDS])
    const unknown: string[] = []
    for (const file of await filesUnder(ASSETS, /\.md$/)) {
      // The built platform guide is the user guide's text, not instructions to an agent.
      if (path.relative(ASSETS, file).startsWith('platform-guide')) continue
      const lines = (await fs.readFile(file, 'utf-8')).split('\n')
      lines.forEach((line, i) => {
        const candidates = [
          ...[...line.matchAll(/`([a-z]+(?:_[a-z]+)+)(?:\([^`]*\))?`/g)].map(m => m[1]),
          ...[...line.matchAll(/\b([a-z]+(?:_[a-z]+)+)\(/g)].map(m => m[1]),
        ]
        for (const name of candidates) {
          if (!real.has(name) && !notTools.has(name)) unknown.push(`${path.relative(ASSETS, file)}:${i + 1}: ${name}`)
        }
      })
    }
    expect(unknown).toEqual([])
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: () => 'http://site:4201' }))

import { buildClaudeStart } from '../claudeStart'
import { claudeTestContext } from '../../__tests__/claudeTestContext'

describe('install scripts in a claude process\'s commands (adr-0170) @SC-1743', () => {
  it('switches them off for npm, pnpm and every Yarn, in every command the process starts', () => {
    const start = buildClaudeStart(claudeTestContext({ containerName: 'agent-c1', gitCredEnv: {} }), null)
    expect(start.execEnv).toMatchObject({ npm_config_ignore_scripts: 'true', YARN_IGNORE_SCRIPTS: 'true', YARN_ENABLE_SCRIPTS: 'false' })
  })

  it('is not undone by the run\'s own environment', () => {
    const start = buildClaudeStart(claudeTestContext({ containerName: 'agent-c1', gitCredEnv: { SITE_MCP_KEY: 'k' } }), null)
    expect(start.execEnv.npm_config_ignore_scripts).toBe('true')
    expect(start.execEnv.SITE_MCP_KEY).toBe('k')
  })
})

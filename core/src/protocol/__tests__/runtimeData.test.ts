import { describe, it, expect } from 'vitest'
import { RUNTIME_METHODS } from '../runtimeData.js'
import { RUN_STREAM_EVENT_NAMES, RUN_STREAM_TARGET_ROOMS } from '../runtimeEvents.js'
import { SITE_DATA_METHODS } from '../siteData.js'
import type { AgentPromptPreviewResult } from '../runtimeData.js'

/**
 * Reserved outside RUNTIME_METHODS: `site.describe` (a channel.request method
 * defined in connection.ts) and the three SiteEventPayload event names (sent
 * as `site.event`, not `channel.request`, but still names on the same wire).
 * A future runtime method colliding with any of these must fail this test.
 */
const RESERVED_METHOD_NAMES = ['site.describe', 'run.status', 'run.stream', 'site.credentialHealth']

describe('runtime data contract @SC-337', () => {
  it('method names are unique and disjoint from the workspace data methods and reserved names', () => {
    const runtime = Object.values(RUNTIME_METHODS)
    const workspace = Object.values(SITE_DATA_METHODS)
    expect(new Set(runtime).size).toBe(runtime.length)
    for (const m of runtime) {
      expect(workspace).not.toContain(m)
      expect(RESERVED_METHOD_NAMES).not.toContain(m)
    }
  })
})

// SC-355: hq's intake validation (siteEventHandler.ts's validateRunStreamFrame)
// feeds from RUN_STREAM_EVENT_NAMES/RUN_STREAM_TARGET_ROOMS — pinning the exact
// set here so a drift between the wire vocabulary and the validator's allowlist
// is loud (a TypeScript union widening alone would not fail a test).
describe('RunStreamEvent vocabularies @SC-355', () => {
  it('RUN_STREAM_EVENT_NAMES is exactly the eight known socket.io event names', () => {
    expect(new Set(RUN_STREAM_EVENT_NAMES)).toEqual(
      new Set([
        'agentStreamDelta',
        'agentToolCall',
        'agentToolResult',
        'agentThinking',
        'agentRunNotice',
        'agentRunStatus',
        'manifestPendingApproval',
        'taskSessionStarted',
      ]),
    )
    expect(RUN_STREAM_EVENT_NAMES.length).toBe(8)
  })

  it('RUN_STREAM_TARGET_ROOMS is exactly session and task', () => {
    expect(new Set(RUN_STREAM_TARGET_ROOMS)).toEqual(new Set(['session', 'task']))
    expect(RUN_STREAM_TARGET_ROOMS.length).toBe(2)
  })
})

describe('AgentPromptPreviewResult', () => {
  it('carries sections alongside the flattened prompt', () => {
    const preview: AgentPromptPreviewResult = {
      prompt: 'p',
      sections: [{ key: 'profile', label: 'Profile', content: 'c', editable: true }],
    }
    expect(preview.sections[0].editable).toBe(true)
  })
})

describe('parseRunStartedBy', () => {
  it('reads each of the four starters', async () => {
    const { parseRunStartedBy } = await import('../runtimeData.js')
    expect(parseRunStartedBy('person')).toBe('person')
    expect(parseRunStartedBy('pulse')).toBe('pulse')
    expect(parseRunStartedBy('schedule')).toBe('schedule')
    expect(parseRunStartedBy('agent')).toBe('agent')
  })

  it('returns null for anything else, so a missing value is never read as a person', async () => {
    const { parseRunStartedBy } = await import('../runtimeData.js')
    for (const v of [undefined, null, '', 'Person', 'heartbeat', 1, {}]) expect(parseRunStartedBy(v)).toBeNull()
  })

  it('names run.usage among the runtime methods @SC-759', async () => {
    const { RUN_USAGE_METHOD } = await import('../runUsage.js')
    expect(RUNTIME_METHODS.runUsage).toBe(RUN_USAGE_METHOD)
  })
})

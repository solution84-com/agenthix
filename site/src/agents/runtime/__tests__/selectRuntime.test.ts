import { describe, it, expect, vi } from 'vitest'

vi.mock('../ClaudeSDKRuntime', () => ({ ClaudeSDKRuntime: class ClaudeSDKRuntime {} }))
vi.mock('../OpenCodeRuntime', () => ({ OpenCodeRuntime: class OpenCodeRuntime {} }))

import { selectRuntime } from '../selectRuntime'
import { ClaudeSDKRuntime } from '../ClaudeSDKRuntime'
import { OpenCodeRuntime } from '../OpenCodeRuntime'

describe('selectRuntime', () => {
  it("selects the Claude runtime for 'claude-sdk'", () => {
    expect(selectRuntime('claude-sdk')).toBeInstanceOf(ClaudeSDKRuntime)
  })

  it("selects the OpenCode runtime for 'opencode', never Claude", () => {
    expect(selectRuntime('opencode')).toBeInstanceOf(OpenCodeRuntime)
  })

  it("refuses the retired name 'native' and any other unknown name", () => {
    expect(() => selectRuntime('native')).toThrow(/Unknown agent runtime 'native'/)
    expect(() => selectRuntime('')).toThrow(/Unknown agent runtime/)
  })
})

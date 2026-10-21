/** The model a piece of work runs on and the runtime that can be given it, from its boundary's policy. */
import { describe, it, expect } from 'vitest'
import { CLAUDE_SDK_MODELS } from '@agenthix/core'
import { workChoice } from '../workChoice'

const [light, heavy] = CLAUDE_SDK_MODELS.map(m => m.value)
const policy = { talking: light, lightWork: light, heavyWork: heavy, allowed: null, ceiling: null }
const openRouter = 'openrouter/~deepseek/deepseek-flash-latest'

describe("a piece of work's model and runtime @SC-955", () => {
  it("is the boundary's light-work model by default and its heavy-work model for heavy work, on the agent's runtime", () => {
    expect(workChoice(policy, 'light', 'claude-sdk')).toEqual({ model: light, runtime: 'claude-sdk' })
    expect(workChoice(policy, 'heavy', 'claude-sdk')).toEqual({ model: heavy, runtime: 'claude-sdk' })
  })

  it("runs on OpenCode when the policy's model is one only OpenCode can be given", () => {
    expect(workChoice({ ...policy, lightWork: openRouter }, 'light', 'claude-sdk')).toEqual({ model: openRouter, runtime: 'opencode' })
  })

  it("stays on OpenCode for an agent already there", () => {
    expect(workChoice({ ...policy, lightWork: openRouter }, 'light', 'opencode')).toEqual({ model: openRouter, runtime: 'opencode' })
  })

  it("is left to the agent when no runtime can be given the policy's model", () => {
    expect(workChoice({ ...policy, lightWork: 'not-a-model' }, 'light', 'claude-sdk')).toEqual({ model: null, runtime: 'claude-sdk' })
  })
})

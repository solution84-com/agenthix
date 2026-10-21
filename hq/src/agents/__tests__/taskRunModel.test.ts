/**
 * A task's run follows the work models: its boundary's light-work model on the runtime that can be given it, unless
 * the boundary narrows the agent to a model of its own; and the task's session is kept unless the run needs another
 * runtime and nothing in the session carries on.
 */
import { describe, it, expect } from 'vitest'
import { CLAUDE_SDK_MODELS, type PendingManifest } from '@agenthix/core'
import { keepsTaskSession, taskRunChoice } from '../taskRunModel'

const [sonnet, haiku] = ['claude-sonnet-4-6', 'claude-haiku-4-5']
const openRouter = 'openrouter/~deepseek/deepseek-flash-latest'
const kernel = { defaultModel: sonnet, runtime: 'claude-sdk' }
const policy = (lightWork: string) => ({ talking: lightWork, lightWork, heavyWork: lightWork, allowed: null, ceiling: null })

describe("a task's run model @SC-955", () => {
  it('knows the models these tests name', () => {
    expect(CLAUDE_SDK_MODELS.map(m => m.value)).toEqual(expect.arrayContaining([sonnet, haiku]))
  })

  it("is the boundary's light-work model on the agent's runtime when it offers it", () => {
    expect(taskRunChoice(policy(haiku), kernel, null)).toEqual({ model: haiku, runtime: 'claude-sdk' })
  })

  it("runs on OpenCode when the light-work model is one only OpenCode can be given", () => {
    expect(taskRunChoice(policy(openRouter), kernel, null)).toEqual({ model: openRouter, runtime: 'opencode' })
  })

  it("is the agent's own model on its own runtime when no runtime can be given the policy's", () => {
    expect(taskRunChoice(policy('not-a-model'), kernel, null)).toEqual({ model: sonnet, runtime: 'claude-sdk' })
  })

  it("keeps a boundary's override of the agent's model, which only narrows", () => {
    expect(taskRunChoice(policy(openRouter), kernel, haiku)).toEqual({ model: haiku, runtime: 'claude-sdk' })
  })

  it('ignores an override the agent cannot take', () => {
    expect(taskRunChoice(policy(openRouter), kernel, 'claude-opus-4-6')).toEqual({ model: openRouter, runtime: 'opencode' })
  })
})

describe("a task's session @SC-955", () => {
  const base = { sessionRuntime: 'claude-sdk', neededRuntime: 'opencode', paused: false, newestRun: null }
  const run = (
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
    manifestStatus: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | null = null,
    pendingManifest: PendingManifest | null = manifestStatus === 'APPROVED' ? { tools: [{ name: 'Bash' }], bashPatterns: [] } : null,
  ) => ({ status, manifestStatus, pendingManifest })

  it('is kept when it is on the runtime the run needs', () => {
    expect(keepsTaskSession({ ...base, neededRuntime: 'claude-sdk', newestRun: run('COMPLETED') })).toBe(true)
  })

  it('is replaced when the run needs another runtime and nothing in it carries on', () => {
    expect(keepsTaskSession(base)).toBe(false)
    expect(keepsTaskSession({ ...base, newestRun: run('FAILED') })).toBe(false)
    expect(keepsTaskSession({ ...base, newestRun: run('COMPLETED', 'REJECTED') })).toBe(false)
    expect(keepsTaskSession({ ...base, newestRun: run('COMPLETED', 'PENDING_APPROVAL') })).toBe(false)
  })

  it('is kept for a run paused for a scheduled change, which carries on in the same conversation', () => {
    expect(keepsTaskSession({ ...base, paused: true })).toBe(true)
  })

  it('is kept for the run an approval is for, which is given what was approved in the session that asked', () => {
    expect(keepsTaskSession({ ...base, newestRun: run('COMPLETED', 'APPROVED') })).toBe(true)
  })

  it('is replaced after an ordinary run, which the site marks approved with nothing asked', () => {
    expect(keepsTaskSession({ ...base, newestRun: run('FAILED', 'APPROVED', null) })).toBe(false)
    expect(keepsTaskSession({ ...base, newestRun: run('COMPLETED', 'APPROVED', { tools: [], bashPatterns: [] }) })).toBe(false)
  })

  it('is kept while a run in it is still going', () => {
    expect(keepsTaskSession({ ...base, newestRun: run('RUNNING') })).toBe(true)
    expect(keepsTaskSession({ ...base, newestRun: run('PENDING') })).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import type { RunContextPayload, SessionSeed } from '@agenthix/core'
import { runDispatchParams } from '../dispatchParams'

/**
 * site's zod validator is a hand-written mirror of core's `RunContextPayload`,
 * and `runDispatchParams` strips what it does not list — so a field core drops while
 * the validator still requires it breaks every dispatch at runtime, with both
 * apps type-checking clean. That is exactly what happened when the product
 * mounts were removed: hq stopped sending `mounts.products`, site kept
 * requiring it, and the only site-side test hand-built the old shape.
 *
 * This pins the two together. The fixture is typed as `RunContextPayload`, so
 * core changing shape breaks compilation here; the parse then proves the
 * validator agrees with that shape at runtime.
 */
const context: RunContextPayload = {
  agent: {
    id: 'agent-1',
    name: 'Ada',
    handle: 'ada',
    role: null,
    runtime: 'claude-sdk',
    approval: 'deferred',
    defaultModel: 'claude-sonnet-4-6',
    allowedTools: null,
    allowedBashPatterns: null,
    isKernel: false,
  },
  // The validator adds a cross-field rule core's type does not express: a chat
  // dispatch must carry context.chat.
  chat: { sessionContext: null },
  mounts: { ownerSlugs: { p1: 'atlas' } },
  riskRules: null,
  credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-live' },
  packages: {
    agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
    org: null,
    platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
  },
}

/** Typed as core's own seed for the same reason the context is. */
const session: SessionSeed = {
  id: 's1',
  sessionKey: 'chat:agent-1:u1',
  agentId: 'agent-1',
  userId: 'u1',
  sessionType: 'chat',
  taskId: null,
  title: null,
  model: null,
  metadata: {},
  primaryOwnerType: 'user',
  primaryOwnerId: 'u1',
  primaryWorkspaceId: null,
  runtime: 'claude-sdk',
  createdAt: '2026-09-16T00:00:00.000Z',
}

function dispatch(ctx: RunContextPayload) {
  return {
    kind: 'chat' as const,
    startedBy: 'person' as const,
    capabilityJwt: 'jwt',
    session,
    inputText: 'hello',
    model: 'claude-sonnet-4-6',
    hideUserMessage: false,
    context: ctx,
    runLimits: { timeLimitMinutes: 60, turnLimit: 100 },
  }
}

describe('dispatch params agree with the context hq actually sends', () => {
  it('accepts a payload of exactly the shape core declares', () => {
    const result = runDispatchParams.safeParse(dispatch(context))
    if (!result.success) {
      throw new Error(`validator rejects core's own shape: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    }
    expect(result.success).toBe(true)
  })

  it('carries the picked skill through as it came, and runs a dispatch whose skill is malformed', () => {
    const picked = runDispatchParams.safeParse({ ...dispatch(context), skill: { name: 'org-review' } })
    expect(picked.success && picked.data.skill).toEqual({ name: 'org-review' })
    expect(runDispatchParams.safeParse({ ...dispatch(context), skill: { name: 42 } }).success).toBe(true)
  })

  it('carries the run limits through, and refuses a dispatch without them', () => {
    const limits = { timeLimitMinutes: 45, turnLimit: 80 }
    const withLimits = runDispatchParams.safeParse({ ...dispatch(context), runLimits: limits })
    expect(withLimits.success && withLimits.data.runLimits).toEqual(limits)
    const { runLimits: _limits, ...without } = dispatch(context)
    expect(runDispatchParams.safeParse(without).success).toBe(false)
    expect(runDispatchParams.safeParse({ ...dispatch(context), runLimits: { timeLimitMinutes: 0, turnLimit: 80 } }).success).toBe(false)
    expect(runDispatchParams.safeParse({ ...dispatch(context), runLimits: { timeLimitMinutes: 45 } }).success).toBe(false)
  })

  it("accepts every starter core declares, 'agent' included, and nothing else", async () => {
    const { RUN_STARTED_BY } = await import('@agenthix/core')
    for (const startedBy of RUN_STARTED_BY) {
      expect(runDispatchParams.safeParse({ ...dispatch(context), kind: 'task', startedBy }).success).toBe(true)
    }
    expect(runDispatchParams.safeParse({ ...dispatch(context), startedBy: 'heartbeat' }).success).toBe(false)
  })

  it("carries the run's person and a task's comments through, and still accepts a dispatch without them @SC-522", () => {
    const comments = [{ author: 'ana', at: '2026-10-07T09:00:00.000Z', text: 'Use the staging bucket.' }]
    const task = {
      taskId: 't1', taskKey: 'WEB-1', title: 'T', description: 'D', projectId: 'p1',
      projectName: 'Web', projectSlug: 'web', boardName: 'B', columns: '- Todo (TODO)', comments,
    }
    const result = runDispatchParams.safeParse({ ...dispatch({ ...context, task }), kind: 'task', onBehalfOfUserId: 'u1' })
    expect(result.success && result.data.onBehalfOfUserId).toBe('u1')
    expect(result.success && result.data.context.task?.comments).toEqual(comments)
    expect(runDispatchParams.safeParse({ ...dispatch(context), onBehalfOfUserId: '' }).success).toBe(false)
    const unbounded = { ...task, comments: [{ ...comments[0], text: 'x'.repeat(5000) }] }
    expect(runDispatchParams.safeParse({ ...dispatch({ ...context, task: unbounded }), kind: 'task' }).success).toBe(false)
  })

  it('carries the owner slugs through — the only mount input left', () => {
    const result = runDispatchParams.safeParse(dispatch(context))
    expect(result.success && result.data.context.mounts.ownerSlugs).toEqual({ p1: 'atlas' })
  })

  it('rejects a mounts object that has lost its owner slugs — the validator still guards what it should', () => {
    const broken = { ...context, mounts: {} } as unknown as RunContextPayload
    expect(runDispatchParams.safeParse(dispatch(broken)).success).toBe(false)
  })

  /**
   * The credential replaced `llmApiKey` at protocol 10.0 — a REQUIRED field
   * leaving the wire, which is the exact drift this file exists to catch: a
   * validator still demanding the old field refuses every dispatch while both
   * apps type-check clean.
   *
   * The fixture is typed as core's own `RunContextPayload`, so the accept case
   * below cannot be written with `llmApiKey` at all; the refusals are what pin
   * the validator to the union's SHAPE rather than to "some object is there".
   */
  it('carries an API key credential through with its kind intact', () => {
    const result = runDispatchParams.safeParse(dispatch(context))
    expect(result.success && result.data.context.credential).toEqual({ kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-live' })
  })

  it('carries a subscription credential through as the OAuth document', () => {
    const subscription = { ...context, credential: { kind: 'subscription' as const, provider: 'anthropic' as const, oauthJson: '{"claudeAiOauth":{}}', grantId: 'grant-1', loginId: 'login-1' } }
    const result = runDispatchParams.safeParse(dispatch(subscription))
    expect(result.success && result.data.context.credential).toEqual({
      kind: 'subscription',
      provider: 'anthropic',
      oauthJson: '{"claudeAiOauth":{}}',
      grantId: 'grant-1', loginId: 'login-1',
    })
  })

  it('carries an OpenAI-compatible endpoint with its base URL, keyless or not', () => {
    for (const apiKey of ['', 'sk-local']) {
      const compatible: RunContextPayload = {
        ...context,
        credential: { kind: 'apiKey', provider: 'openai_compatible', apiKey, baseUrl: 'http://localhost:11434/v1' },
      }
      const result = runDispatchParams.safeParse(dispatch(compatible))
      expect(result.success && result.data.context.credential).toEqual(compatible.credential)
    }
  })

  it('refuses a credential that does not fit its provider', () => {
    for (const bad of [
      { kind: 'apiKey', apiKey: 'sk-live' },
      { kind: 'apiKey', provider: 'mystery', apiKey: 'sk-live' },
      { kind: 'apiKey', provider: 'openai', apiKey: '' },
      { kind: 'apiKey', provider: 'openai', apiKey: 'sk', baseUrl: 'http://x/v1' },
      { kind: 'apiKey', provider: 'openai_compatible', apiKey: 'sk' },
      { kind: 'subscription', provider: 'openai', oauthJson: '{}', grantId: 'grant-1', loginId: 'login-1' },
      { kind: 'subscription', oauthJson: '{}', grantId: 'grant-1', loginId: 'login-1' },
    ]) {
      const broken = { ...context, credential: bad } as unknown as RunContextPayload
      expect(runDispatchParams.safeParse(dispatch(broken)).success, JSON.stringify(bad)).toBe(false)
    }
  })

  it("carries the turn's other providers' keys when hq sends them, and does not require them", () => {
    const fallbackCredentials = [
      { kind: 'apiKey' as const, provider: 'openai' as const, apiKey: 'sk-oai' },
      { kind: 'apiKey' as const, provider: 'openai_compatible' as const, apiKey: '', baseUrl: 'http://llm:11434/v1' },
    ]
    const withKeys = runDispatchParams.safeParse(dispatch({ ...context, fallbackCredentials }))
    expect(withKeys.success && withKeys.data.context.fallbackCredentials).toEqual(fallbackCredentials)
    const without = runDispatchParams.safeParse(dispatch(context))
    expect(without.success && 'fallbackCredentials' in without.data.context).toBe(false)
    for (const bad of [
      { kind: 'subscription', provider: 'anthropic', oauthJson: '{}', grantId: 'grant-1', loginId: 'login-1' },
      { kind: 'apiKey', provider: 'openai', apiKey: '' },
      { kind: 'apiKey', provider: 'openai_compatible', apiKey: 'sk' },
    ]) {
      const broken = { ...context, fallbackCredentials: [bad] } as unknown as RunContextPayload
      expect(runDispatchParams.safeParse(dispatch(broken)).success, JSON.stringify(bad)).toBe(false)
    }
  })

  it('carries the org\'s web-search key when hq sends one, and does not require it', () => {
    const withKey = runDispatchParams.safeParse(dispatch({ ...context, webSearchKey: 'exa-key' }))
    expect(withKey.success && withKey.data.context.webSearchKey).toBe('exa-key')
    const without = runDispatchParams.safeParse(dispatch(context))
    expect(without.success && 'webSearchKey' in without.data.context).toBe(false)
  })

  it('accepts a null credential — the run fails later, naming its boundary, rather than being refused here', () => {
    const none = { ...context, credential: null }
    expect(runDispatchParams.safeParse(dispatch(none)).success).toBe(true)
  })

  it('refuses a credential that is missing, of an unknown kind, or carrying the wrong half of the union', () => {
    const { credential: _omitted, ...withoutCredential } = context
    expect(runDispatchParams.safeParse(dispatch(withoutCredential as RunContextPayload)).success).toBe(false)

    for (const bad of [
      'sk-live',
      { kind: 'oauth', oauthJson: '{}' },
      { kind: 'apiKey', provider: 'anthropic' },
      { kind: 'subscription', provider: 'anthropic' },
      { kind: 'apiKey', provider: 'anthropic', apiKey: '' },
      {},
    ]) {
      const broken = { ...context, credential: bad } as unknown as RunContextPayload
      expect(runDispatchParams.safeParse(dispatch(broken)).success, JSON.stringify(bad)).toBe(false)
    }
  })

  it('ignores a field it does not know, never passing it on, and still refuses a malformed value @SC-1153', () => {
    const extra = { ...context, packages: { ...context.packages, agent: { ...context.packages.agent, version: 3 } } }
    const parsed = runDispatchParams.safeParse(dispatch(extra as RunContextPayload))
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'version' in parsed.data.context.packages.agent).toBe(false)
    expect(runDispatchParams.safeParse({ ...dispatch(context), futureField: 1 }).success).toBe(true)
  })

  it('carries the package refs through, and refuses a malformed one', () => {
    const result = runDispatchParams.safeParse(dispatch(context))
    expect(result.success && result.data.context.packages.agent.digest).toBe(context.packages.agent.digest)
    const bad = { ...context, packages: { ...context.packages, agent: { ...context.packages.agent, key: '../escape' } } }
    expect(runDispatchParams.safeParse(dispatch(bad)).success).toBe(false)
  })

  it("carries the person's timezone through, and refuses one that is not a string", () => {
    const withPerson = { ...context, person: { timezone: 'Australia/Sydney' } } as RunContextPayload
    const result = runDispatchParams.safeParse(dispatch(withPerson))
    expect(result.success && result.data.context.person).toEqual({ timezone: 'Australia/Sydney' })
    expect(runDispatchParams.safeParse(dispatch(context)).success).toBe(true)
    const bad = { ...context, person: { timezone: 5 } } as unknown as RunContextPayload
    expect(runDispatchParams.safeParse(dispatch(bad)).success).toBe(false)
  })

  it('carries the pinned memory through, and refuses an item of a scope that does not exist', () => {
    const item = { key: 'tea', scope: 'agent_person', title: 'Tea', body: 'Prefers tea.' }
    const withPinned = { ...context, pinnedMemory: [item] } as RunContextPayload
    const result = runDispatchParams.safeParse(dispatch(withPinned))
    expect(result.success && result.data.context.pinnedMemory).toEqual([item])
    const bad = { ...context, pinnedMemory: [{ ...item, scope: 'everyone' }] } as unknown as RunContextPayload
    expect(runDispatchParams.safeParse(dispatch(bad)).success).toBe(false)
  })
})

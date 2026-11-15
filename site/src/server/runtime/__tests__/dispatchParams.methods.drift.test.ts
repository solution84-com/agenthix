import { describe, it, expect } from 'vitest'
import { DEFAULT_RUN_LIMITS, type AgentConfigPayload, type RunContextPayload, type RunDispatchPayload, type RunPackages, type SessionSeed } from '@agenthix/core'
import { agentPromptPreviewParams, runDispatchParams } from '../dispatchParams'

/**
 * Extends dispatchParams.drift.test.ts, which pins `run.dispatch` for a CHAT
 * with the context fields a chat carries. The same hand-written schemas also
 * validate the other two dispatch kinds and `agent.promptPreview`
 * — none of which had a type or a test tying them to core, so a field core
 * changed there would refuse every task run or preview with
 * both apps type-checking clean.
 *
 * Fixtures are typed as core's own types, `Required<…>` where a type has
 * optional fields, so a field added to core fails to compile here rather than
 * being silently left out; the parse then proves the schema agrees at runtime.
 */
const agent: AgentConfigPayload = {
  id: 'agent-1',
  name: 'Ada',
  handle: 'ada',
  role: 'Engineer',
  runtime: 'claude-sdk',
  approval: 'deferred',
  defaultModel: 'claude-sonnet-4-6',
  allowedTools: ['Read'],
  allowedBashPatterns: null,
  isKernel: false,
}

const packages: RunPackages = {
  agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
  org: { kind: 'org', key: 'org-1', digest: 'c'.repeat(64) },
  platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
}

/** Every field of the context, including the ones a single run kind never carries. */
const fullContext: Required<RunContextPayload> = {
  agent,
  chat: { sessionContext: 'Focus on the release.' },
  task: {
    taskId: 't1',
    taskKey: 'WEB-42',
    title: 'Ship it',
    description: 'Do the thing.',
    projectId: 'p1',
    projectName: 'Atlas',
    projectSlug: 'atlas',
    boardName: 'Main',
    columns: 'todo,doing,done',
  },
  mounts: { ownerSlugs: { p1: 'atlas' } },
  riskRules: null,
  modelAccess: {
    model: { providerId: 'prov-anthropic', model: 'claude-sonnet-5' },
    provider: { kind: 'api_key', providerId: 'prov-anthropic', vendor: 'anthropic', apiKey: 'sk-test-fake' },
    others: [
      { kind: 'api_key', providerId: 'prov-local', vendor: 'openai_compatible', apiKey: '', baseUrl: 'http://localhost:11434/v1' },
      { kind: 'cloud', providerId: 'prov-cloud', vendor: 'cloud', api: 'anthropic', baseUrl: 'https://cloud.example/ai/v1/anthropic' },
      { kind: 'subscription', providerId: 'prov-mine', vendor: 'anthropic', oauthJson: '{}', grantId: 'g1', loginId: 'l1' },
    ],
    billingProfileId: 'bp-1',
  },
  webSearchKey: 'exa-key',
  credentialProblem: 'No credential is configured for this boundary.',
  packages,
  person: { timezone: 'Australia/Sydney' },
  memory: { items: [{ key: 'tables', kind: 'rule', title: 'Tables', body: 'When comparing options, use a table.' }], hinted: [{ key: 'host', title: 'Host' }] },
  installedSkills: [{ identity: 'agenthix/code-review', version: '1.3.0', digest: 'd'.repeat(64), level: 'agent' }],
  fileSkills: [{ placeId: 'p1', path: '.agents/skills/release', fingerprint: 'e'.repeat(64), group: 'place' }],
  personSkills: [{ identity: 'fernhill/my-notes', version: '1.0.0', digest: 'f'.repeat(64) }],
  codeWork: {
    workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
    copyId: '11111111-1111-4111-8111-111111111111',
    branch: 'add-login-page',
    main: 'main',
    behindMain: 2,
    otherBranches: [{ name: 'signup', whose: 'Ada · Sign-up', ahead: 3, agentWorking: 'Kernel' }],
    author: { name: 'Kernel', email: 'kernel@agents.hq.example' },
    onBehalfOf: null,
  },
}

function seed(sessionType: SessionSeed['sessionType']): SessionSeed {
  return {
    id: 's1',
    sessionKey: `${sessionType}:agent-1:u1`,
    agentId: 'agent-1',
    userId: 'u1',
    sessionType,
    taskId: sessionType === 'chat' ? null : 't1',
    title: null,
    model: null,
    metadata: {},
    primaryOwnerType: 'user',
    primaryOwnerId: 'u1',
    primaryWorkspaceId: null,
    runtime: 'claude-sdk',
    createdAt: '2026-09-16T00:00:00.000Z',
  }
}

function dispatch(kind: RunDispatchPayload['kind'], context: RunContextPayload): RunDispatchPayload {
  return {
    kind,
    startedBy: 'person',
    capabilityJwt: 'jwt',
    session: seed(kind),
    inputText: 'go',
    model: 'claude-sonnet-4-6',
    hideUserMessage: kind !== 'chat',
    context,
    runLimits: DEFAULT_RUN_LIMITS,
  }
}

function issues(result: { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } }): string {
  return result.error.issues.map(i => `${i.path.map(String).join('.')}: ${i.message}`).join('; ')
}

describe('every dispatch kind agrees with the payload core declares', () => {
  it('accepts a task dispatch, and carries the task fields through', () => {
    const { chat: _chat, ...taskContext } = fullContext
    const result = runDispatchParams.safeParse(dispatch('task', taskContext))
    if (!result.success) throw new Error(`validator rejects a task dispatch: ${issues(result)}`)
    expect(result.data.context.task).toEqual(fullContext.task)
  })

  it('accepts a context carrying every field core declares, and keeps credentialProblem', () => {
    const result = runDispatchParams.safeParse(dispatch('chat', fullContext))
    if (!result.success) throw new Error(`validator rejects core's full context: ${issues(result)}`)
    expect(result.data.context.credentialProblem).toBe(fullContext.credentialProblem)
    expect(result.data.context.packages.org).toEqual(packages.org)
    expect(result.data.context.modelAccess).toEqual(fullContext.modelAccess)
  })

  it('refuses a provider descriptor that does not fit its vendor', () => {
    const access = fullContext.modelAccess
    const keyless = { ...access, provider: { kind: 'api_key', providerId: 'p', vendor: 'openai', apiKey: '' } }
    const addressed = { ...access, provider: { kind: 'api_key', providerId: 'p', vendor: 'openai', apiKey: 'k', baseUrl: 'https://elsewhere.example' } }
    const unknownKind = { ...access, provider: { kind: 'token', providerId: 'p' } }
    for (const modelAccess of [keyless, addressed, unknownKind]) {
      const context = { ...fullContext, modelAccess } as unknown as RunContextPayload
      expect(runDispatchParams.safeParse(dispatch('chat', context)).success).toBe(false)
    }
  })

  it('still refuses a task dispatch whose task lost a field core requires', () => {
    const { chat: _chat, ...taskContext } = fullContext
    const { projectSlug: _projectSlug, ...brokenTask } = fullContext.task
    const broken = { ...taskContext, task: brokenTask } as unknown as RunContextPayload
    expect(runDispatchParams.safeParse(dispatch('task', broken)).success).toBe(false)
  })
})

describe('agent.promptPreview agrees with the agent config and packages core declares', () => {
  it('accepts the agent config, a session type and the run packages', () => {
    const params: { agent: AgentConfigPayload; sessionType: SessionSeed['sessionType']; packages: RunPackages } = {
      agent,
      sessionType: 'task',
      packages,
    }
    const result = agentPromptPreviewParams.safeParse(params)
    if (!result.success) throw new Error(`validator rejects agent.promptPreview: ${issues(result)}`)
    expect(result.data.packages.org).toEqual(packages.org)
  })
})

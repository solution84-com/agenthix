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
  credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-live' },
  fallbackCredentials: [{ kind: 'apiKey', provider: 'openrouter', apiKey: 'sk-or' }],
  webSearchKey: 'exa-key',
  credentialProblem: 'No credential is configured for this boundary.',
  packages,
  person: { timezone: 'Australia/Sydney' },
  pinnedMemory: [{ key: 'tea', scope: 'agent_person', title: 'Tea', body: 'Prefers tea.' }],
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

function issues(result: { success: false; error: { issues: Array<{ path: Array<string | number>; message: string }> } }): string {
  return result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
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

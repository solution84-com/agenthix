import type { RunContext } from '../types'

/** A Claude run's context with nothing staged and no container, for runtime tests. */
export function claudeTestContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: 'run-1',
    sessionId: 'session-1',
    taskId: null,
    projectId: null,
    model: 'claude-sonnet-4-6',
    prompt: 'Fix the bug',
    cwd: '/projects/web/files',
    agent: {
      id: 'agent-1',
      handle: 'coder',
      name: 'Coder',
      systemPrompt: 'You are a senior engineer.',
      defaultModel: 'claude-sonnet-4-6',
    },
    credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'test-key' },
    riskRules: null,
    packages: {
      refs: {
        agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
        org: null,
        platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
      },
      agentDir: '/cache/agent',
      orgDir: null,
      platformDir: '/cache/platform',
    },
    boundaryOverride: null,
    skills: null,
    claudeHome: { serverDir: '/site/homes/h', visibleDir: '/site/homes/h' },
    workingTreeDir: '/projects/web/files',
    ...overrides,
  }
}

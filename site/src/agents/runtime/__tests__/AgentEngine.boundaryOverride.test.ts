/**
 * assembleRunLaunch resolves a boundary's disk overrides (P18) for the run's
 * location and threads them into the run context and the prompt. Modeled on
 * AgentEngine.taskScope.test.ts's minimal scaffold.
 */
import { DEFAULT_RUN_LIMITS } from '@agenthix/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  capturedContext: null as any,
  capturedPromptArg: null as any,
  resolveAgentContext: vi.fn(),
  resolveBoundaryOverrideDir: vi.fn(),
  mockPrisma: {
    agentRun: { findUnique: vi.fn(), update: vi.fn() },
    agentSession: { update: vi.fn(), findUnique: vi.fn() },
    transcriptEntry: { count: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    toolCallLog: { findMany: vi.fn() },
  },
}))
vi.mock('#db', () => ({ prisma: h.mockPrisma }))

vi.mock('../agentUtils', async () => {
  const actual = await vi.importActual<any>('../agentUtils')
  return { ...actual, resolveAgentContext: h.resolveAgentContext }
})

const PRIMARY_LOC = { ownerType: 'project', ownerId: 'p1', taskId: null }
vi.mock('../../../server/storage/primaryLocationService', () => ({
  resolvePrimaryLocation: vi.fn(() => PRIMARY_LOC),
  getLocationCwd: vi.fn().mockResolvedValue('/tmp/agenthix-test-cwd'),
}))

vi.mock('../../agentDiskPaths', () => ({
  getSiteRoot: vi.fn(() => '/site'),
  AGENT_CONTAINER_CLAUDE_HOME: '/home/appuser/.claude',
}))

// The site now creates the agent's workspace directory itself at launch
// (hq no longer provisions a site's disk) — mkdir is mocked so this doesn't
// touch the real filesystem.
vi.mock('node:fs/promises', () => ({
  default: { mkdir: vi.fn().mockResolvedValue(undefined) },
}))

const FAKE_OVERRIDE = { dir: '/files/.agents/agents/agent-1', filesHome: '/files' }
vi.mock('../../../packages/boundaryOverrides', () => ({
  resolveBoundaryOverrideDir: h.resolveBoundaryOverrideDir,
}))

vi.mock('../../AgentPromptBuilder', () => ({
  AgentPromptBuilder: vi.fn().mockImplementation(() => ({
    buildChatPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
    buildTaskPrompt: vi.fn().mockResolvedValue({ systemPrompt: 'system prompt' }),
  })),
}))

vi.mock('../../../packages/runPackages', async () => ({
  ...(await vi.importActual<typeof import('../../../packages/runPackages')>('../../../packages/runPackages')),
  resolveRunPackageDirs: vi.fn(async (refs: unknown) => ({ refs, agentDir: '/cache/agent', orgDir: null, platformDir: '/cache/platform' })),
}))
vi.mock('../../promptContent', () => ({
  loadPromptContent: vi.fn(async (_packages: unknown, boundaryOverride: unknown) => {
    h.capturedPromptArg = boundaryOverride
    return { instructions: null, org: null }
  }),
}))

vi.mock('../../../server/identity/runnerClaim', async (importOriginal) =>
  (await import('./runnerClaimMock')).withDerivedRunner(await importOriginal()))
vi.mock('../../../server/identity/verifyHqToken', () => ({
  verifyHqToken: vi.fn().mockResolvedValue({
    sessionId: 'sess-1', agentId: 'agent-1', projectId: null, taskId: null, siteId: 'site-1',
    userId: 'u1', workspaceId: null, role: null,
    permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    exp: Math.floor(Date.now() / 1000) + 900,
  }),
}))

vi.mock('../../../server/siteConfig', () => ({
  getAgentFacingSiteUrl: vi.fn(() => 'http://localhost:4201'),
}))

vi.mock('../SiteStreamEmitter', () => ({
  siteStream: { stream: vi.fn(), status: vi.fn() },
}))

vi.mock('../selectRuntime', () => ({
  selectRuntime: vi.fn().mockImplementation(() => ({
    async sessionExists() { return true },
    async *run(context: any) {
      h.capturedContext = context
      yield { type: 'status', status: 'completed' }
    },
  })),
}))
vi.mock('../ClaudeSDKRuntime', () => ({
  ClaudeSDKRuntime: vi.fn().mockImplementation(() => ({
    async sessionExists() { return true },
    async *run(_context: any) {
      yield { type: 'status', status: 'completed' }
    },
  })),
}))

import { agentEngine } from '../AgentEngine'

function mockAgentRun(overrides: Record<string, unknown> = {}) {
  h.mockPrisma.agentRun.findUnique.mockResolvedValue({
    id: 'run-1', status: 'PENDING', sessionId: 'sess-1', agentId: 'agent-1',
    taskId: null, inputText: 'hi', approvedManifest: null,
    ...overrides,
  })
  h.mockPrisma.agentRun.update.mockResolvedValue(undefined)
}

const AGENT_FIXTURE = {
  id: 'agent-1', handle: 'test-agent', name: 'Test Agent', role: 'worker',
  defaultModel: 'claude-x', runtime: 'opencode', approval: 'bypassed',
  allowedTools: [], allowedBashPatterns: [], isKernel: false,
}
const TASK_SESSION_FIXTURE = {
  id: 'sess-1', userId: 'u1', model: null,
  primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null,
  taskId: null, sessionType: 'task',
}
const DISPATCH_CONTEXT: RunContextPayload = {
  agent: AGENT_FIXTURE as any,
  chat: { sessionContext: null },
  mounts: { ownerSlugs: {} },
  riskRules: null,
  credential: null,
  packages: {
    agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
    org: null,
    platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
  },
}

describe('assembleRunLaunch — a boundary\'s overrides reach the run (P18)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.capturedContext = null
    h.capturedPromptArg = null
    delete process.env.AGENT_CONTAINER_ISOLATION
    h.mockPrisma.toolCallLog.findMany.mockResolvedValue([])
    h.resolveAgentContext.mockResolvedValue({ agent: AGENT_FIXTURE, session: TASK_SESSION_FIXTURE })
    h.resolveBoundaryOverrideDir.mockResolvedValue(FAKE_OVERRIDE)
  })

  it('threads the real override through', async () => {
    mockAgentRun({ taskId: null })

    await agentEngine.run('run-1', { dispatchContext: DISPATCH_CONTEXT, capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.resolveBoundaryOverrideDir).toHaveBeenCalledWith(PRIMARY_LOC, 'agent-1')
    expect(h.capturedContext.boundaryOverride).toEqual(FAKE_OVERRIDE)
    expect(h.capturedPromptArg).toEqual(FAKE_OVERRIDE)
    expect(h.capturedContext.skills).toBeNull()
  })

  it("carries the skills hq named, for the run's place and agent, and leaves out an entry of the wrong shape", async () => {
    mockAgentRun({ taskId: null })
    const file = { placeId: 'p1', path: '.agents/skills/review', fingerprint: 'c'.repeat(64), group: 'place' as const }
    const context = { ...DISPATCH_CONTEXT, fileSkills: [file, { placeId: 'p1', path: 'x', fingerprint: 'not hex', group: 'place' }] } as RunContextPayload

    await agentEngine.run('run-1', { dispatchContext: context, capabilityJwt: 'jwt', runLimits: DEFAULT_RUN_LIMITS })

    expect(h.capturedContext.skills).toMatchObject({
      place: { ownerType: 'project', ownerId: 'p1' }, agentId: 'agent-1', installed: [], files: [file], person: [],
    })
  })
})

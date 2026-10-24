/**
 * Control checks for the agent's container (workflows spec part 6): A6, the agent's container and a step's executor
 * container share no network or process namespace and neither has the Docker socket; A12 (B-1), git in the agent's
 * container has no credential helper that could hand it a token, `git credential fill` answers none, and nothing in
 * its environment or home holds one. The agent container is started with the site's own arguments, the step by the
 * site's own run.
 *
 * Run with `npm run test:container` from site/. Needs Docker, the agent image (AGENT_TEST_IMAGE,
 * `imgtest/agent:dev`) and the executor image (EXECUTOR_TEST_IMAGE, `imgtest/executor:dev`); skipped when any is
 * missing.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

process.env.HOST_NAMESPACE = 'wf-lane-6b'

const db = vi.hoisted(() => ({ runs: new Map<string, Record<string, unknown>>() }))
vi.mock('#db', () => ({
  prisma: {
    workspace: { findUnique: async () => ({ id: 'ws-1', ownerType: 'project', ownerId: 'proj-1' }) },
    executorRun: {
      count: async ({ where }: { where: { id: string } }) => (db.runs.has(where.id) ? 1 : 0),
      create: async ({ data }: { data: Record<string, unknown> }) => { db.runs.set(data.id as string, { ...data, state: 'RUNNING' }) },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        db.runs.set(where.id, { ...db.runs.get(where.id), ...data })
      },
      findUnique: async ({ where }: { where: { id: string } }) => db.runs.get(where.id) ?? null,
      findMany: async () => [],
    },
    executorSnapshot: { create: async () => {}, updateMany: async () => {}, findMany: async () => [] },
  },
}))
vi.mock('../../runEvents', () => ({ sendStepEvent: () => {}, sendResult: () => {} }))

import { COMMAND_LAUNCHER_PATH } from '../../../agents/runtime/agentImage'
import { executorDeps, getRun, resetExecutorForTests, startRun, stopRun } from '../../run'
import { listStepContainers } from '../../runCleanup'
import { removeContainer } from '../../stepRunner'
import { definition, instruction, tempDir, writeTree } from '../fixtures'
import { AGENT, AGENT_IMAGE, EXECUTOR_IMAGE, imageId, inAgent, isolationOf, removeAgent, startAgent, type Isolation } from './harness'

const EXECUTOR_ID = imageId(EXECUTOR_IMAGE)
const AGENT_ID = imageId(AGENT_IMAGE)
let siteRoot: string

const SOCKET = /docker\.sock/
const sharesWith = (mode: string, other: Isolation) => mode === 'host' || mode === `container:${other.id}` || mode === `container:${AGENT}`

describe.skipIf(!EXECUTOR_ID || !AGENT_ID)('control checks for the agent\'s container', () => {
  beforeAll(async () => {
    siteRoot = await tempDir('control-checks-agent-')
    process.env.SITE_ROOT = siteRoot
    const boundary = path.join(siteRoot, 'projects/proj-1')
    await writeTree(path.join(boundary, 'workspaces/ws-1'), { 'README.md': 'hello' })
    await fs.chmod(boundary, 0o777)
    await startAgent('proj-1', boundary)
    executorDeps.resolveImage = async digest => (digest === EXECUTOR_ID ? EXECUTOR_ID : null)
    executorDeps.scanRunChanges = async () => ({ leaks: [] })
  })

  afterAll(async () => {
    for (const name of await listStepContainers()) await removeContainer(name)
    removeAgent()
    await fs.rm(siteRoot, { recursive: true, force: true })
  })

  it('A6: the agent\'s container and a running step\'s container share no network or process namespace, and neither has the Docker socket', async () => {
    resetExecutorForTests()
    const check = 'test ! -e /var/run/docker.sock && test ! -e /run/docker.sock && sleep 60'
    const d = definition({ files: [], steps: [{ name: 'Wait', run: check, secrets: [], timeoutSeconds: null }] })
    const ins = await instruction({ runId: 'run-a6', executorImageDigest: EXECUTOR_ID, definition: d, files: [] })
    expect(await startRun(ins)).toEqual({ accepted: true })
    await vi.waitFor(async () => expect(await listStepContainers('run-a6')).toHaveLength(1), { timeout: 60_000, interval: 250 })
    const [stepName] = await listStepContainers('run-a6')
    try {
      const agent = isolationOf(AGENT)
      const step = isolationOf(stepName!)
      expect(step.networkMode).toBe('none')
      expect(agent.networks.filter(n => step.networks.includes(n))).toEqual([])
      expect(sharesWith(agent.networkMode, step) || sharesWith(step.networkMode, agent)).toBe(false)
      for (const [a, b] of [[agent, step], [step, agent]] as const) {
        expect(sharesWith(a.pidMode, b), 'process namespace').toBe(false)
        expect(sharesWith(a.ipcMode, b), 'IPC namespace').toBe(false)
        expect(sharesWith(a.utsMode, b), 'host name namespace').toBe(false)
        expect(a.mounts.filter(m => SOCKET.test(m.source) || SOCKET.test(m.destination))).toEqual([])
      }
      expect(inAgent('test ! -e /var/run/docker.sock && test ! -e /run/docker.sock').status).toBe(0)
    } finally {
      await stopRun({ runId: 'run-a6', reason: 'stopped' })
      await vi.waitFor(async () => expect((await getRun({ runId: 'run-a6' }))?.result).toBeTruthy(), { timeout: 60_000, interval: 250 })
    }
    // The step's own check of the socket passed: it was still waiting when it was stopped.
    expect((await getRun({ runId: 'run-a6' }))!.result!.state).toBe('stopped')
  })

  describe('A12 (B-1): git in the agent\'s container gets no GitHub token', () => {
    const asHarness = (script: string) => inAgent(script)
    const asCommand = (script: string) => inAgent(`${COMMAND_LAUNCHER_PATH} /bin/bash -c '${script.replace(/'/g, `'\\''`)}'`)

    it('has one credential helper, which only tells git to stop, and no other to call', () => {
      const helpers = asHarness('git config --get-all credential.helper')
      expect(helpers.stdout.trim().split('\n')).toHaveLength(1)
      expect(helpers.stdout).toContain('echo quit=1')
      expect(helpers.stdout).not.toMatch(/curl|wget|http|password=|store|cache/)
      expect(asHarness('compgen -c | grep "^git-credential-" || true').stdout.trim()).toBe('')
    })

    it.each([['the harness', asHarness], ['an agent\'s command', asCommand]])('answers no token to %s', (_who, run) => {
      const r = run('printf "protocol=https\\nhost=github.com\\n\\n" | GIT_TERMINAL_PROMPT=0 git credential fill')
      expect(r.status).not.toBe(0)
      expect(r.stdout).not.toContain('password=')
      const env = run('env')
      expect(env.status).toBe(0)
      expect(env.stdout).not.toMatch(/^(GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GIT_ASKPASS|SSH_ASKPASS|GIT_CONFIG_PARAMETERS)=/m)
      expect(env.stdout).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}/)
      const stored = run('ls -a ~/.git-credentials ~/.config/git/credentials ~/.config/gh/hosts.yml 2>/dev/null; true')
      expect(stored.stdout.trim()).toBe('')
    })
  })
})

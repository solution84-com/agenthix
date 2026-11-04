/**
 * adr-0173 in a real container, as `buildContainerRunCommand` starts one: what an agent can do to the folders it can
 * write does not move what the site mounts or stages. `main` is mounted read-only from the code space over its place
 * in the boundary, and run staging read-only at /run/staging on the read-only root; neither mount point can be
 * renamed or replaced from inside, and renaming `.claude` in the harness home changes nothing the harness loads.
 *
 * Run with `npm run test:container` from site/ (vitest.container.config.ts). Needs Docker and the agent image
 * (AGENT_IMAGE, `agenthix-agent:latest` by default), and is skipped when either is missing. One container
 * (AGENT_ADR0173_TEST_CONTAINER) with no network, removed at the end. Calls no model.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prepareHarnessHome } from '../boundaryClaudeHome'
import { prepareRunStaging } from '../runStaging'
import { runStagingFor } from '../harnessHomes'
import { prepareOpenCodeConfigMounts } from '../openCodeConfigMounts'
import { buildContainerRunCommand } from '../containerRunArgs'
import { codeWorkspaceMounts } from '../codeWorkspaceMounts'
import { resolveBoundaryMount } from '../locationResolver'
import { getSiteRoot } from '../../agentDiskPaths'
import type { AgentMounts, ContainerKey } from '../containerTypes'

const IMAGE = process.env.AGENT_IMAGE ?? 'agenthix-agent:latest'
const NAME = process.env.AGENT_ADR0173_TEST_CONTAINER ?? 'agenthix-adr0173-test'
const available = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0

const KEY: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'rw', runner: { kind: 'project', projectId: 'p1' } }

/** As any run in the container: the harness user. */
function inContainer(script: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync('docker', ['exec', '-u', 'appuser', NAME, 'sh', '-c', script], { encoding: 'utf8', timeout: 30_000 })
}

let root: string

describe.skipIf(!available)('paths a container cannot change (adr-0173)', () => {
  beforeAll(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'adr0173-')))
    process.env.SITE_ROOT = root
    process.env.AGENT_IMAGE = IMAGE
    const main = path.join(root, 'code', 'projects', 'p1', 'w1')
    await fs.mkdir(path.join(main, '.git'), { recursive: true })
    await fs.writeFile(path.join(main, 'README.md'), 'main\n')
    await fs.mkdir(path.join(root, 'projects', 'p1', 'files'), { recursive: true })
    await prepareHarnessHome(KEY)
    await prepareRunStaging(KEY)
    await prepareOpenCodeConfigMounts(KEY)
    await fs.mkdir(path.join(runStagingFor(KEY), 'skills', 'conversation-c1', 'skills', 'agent-x'), { recursive: true })
    await fs.writeFile(path.join(runStagingFor(KEY), 'skills', 'conversation-c1', 'skills', 'agent-x', 'SKILL.md'), 'checked\n')
    for (const d of [root, path.join(root, 'projects'), path.join(root, 'projects', 'p1'), path.join(root, 'projects', 'p1', 'files')]) await fs.chmod(d, 0o777)

    const boundary = resolveBoundaryMount({ ownerType: 'project', ownerId: 'p1' }, getSiteRoot())
    const mounts: AgentMounts = {
      boundary, folders: [], locationMode: 'rw',
      readOnly: await codeWorkspaceMounts(boundary, { ownerType: 'project', ownerId: 'p1' }, [{ id: 'w1' }]),
    }
    spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' })
    const { args } = buildContainerRunCommand(KEY, { handle: 'a', runtime: 'opencode', sessionId: 's', credential: null }, NAME, mounts, 'none')
    const run = spawnSync('docker', args, { encoding: 'utf8' })
    if (run.status !== 0) throw new Error(`docker run failed: ${run.stderr}`)
  }, 120_000)

  afterAll(async () => {
    spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' })
    delete process.env.SITE_ROOT
    if (root) await fs.rm(root, { recursive: true, force: true })
  })

  it("main is read-only at its place in the boundary, and its mount point cannot be renamed or replaced", () => {
    expect(inContainer('cat /projects/p1/workspaces/w1/README.md').stdout).toBe('main\n')
    expect(inContainer('echo x > /projects/p1/workspaces/w1/README.md').status).not.toBe(0)
    expect(inContainer('mv /projects/p1/workspaces/w1 /projects/p1/moved').status).not.toBe(0)
    expect(inContainer('rm -rf /projects/p1/workspaces/w1 && ln -s / /projects/p1/workspaces/w1').status).not.toBe(0)
  })

  it('run staging is read-only at /run/staging, outside the home, and cannot be moved aside', () => {
    expect(inContainer('cat /run/staging/skills/conversation-c1/skills/agent-x/SKILL.md').stdout).toBe('checked\n')
    expect(inContainer('echo x > /run/staging/skills/conversation-c1/skills/agent-x/SKILL.md').status).not.toBe(0)
    expect(inContainer('mv /run/staging /run/elsewhere').status).not.toBe(0)
    expect(inContainer('mv /home/appuser/.claude /home/appuser/.claude-old && mkdir -p /home/appuser/.claude').status).toBe(0)
    expect(inContainer('cat /run/staging/skills/conversation-c1/skills/agent-x/SKILL.md').stdout).toBe('checked\n')
  })
})

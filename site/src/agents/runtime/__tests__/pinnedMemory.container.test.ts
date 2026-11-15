/**
 * A run's pinned memory, read from inside an agent container bound as a project's task runs are: the project's
 * own harness home, which the task runs of every member of the project share, and its staging folder bound again
 * read-only (containerRunArgs.ts). Nothing memory found about one run's person may be readable by another run
 * there; in a person's own home the file is read-only and gone once the run ends.
 *
 * Run with `npm run test:container` from site/ (vitest.container.config.ts). Needs Docker and the agent image
 * (AGENT_IMAGE, `agenthix-agent:latest` by default), and is skipped when either is missing. One container
 * (AGENT_PINNED_TEST_CONTAINER) with no network, removed at the end. Calls no model.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { RunMemory } from '@agenthix/core'
import { harnessHomeBind, prepareHarnessHome } from '../boundaryClaudeHome'
import { prepareRunStaging, runStagingBind } from '../runStaging'
import { runStagingFor } from '../harnessHomes'
import { homeIsShared, releasePinnedMemory, writePinnedMemory } from '../pinnedMemoryFiles'
import type { ContainerKey } from '../containerTypes'

const IMAGE = process.env.AGENT_IMAGE ?? 'agenthix-agent:latest'
const NAME = process.env.AGENT_PINNED_TEST_CONTAINER ?? 'agenthix-pinned-memory-test'
const available = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0

const KEY: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'rw', runner: { kind: 'project', projectId: 'p1' } }

/** As any run in the container: the harness user, with the shared home. */
function inContainer(script: string): { status: number | null; stdout: string } {
  return spawnSync('docker', ['exec', '-u', 'appuser', NAME, 'sh', '-c', script], { encoding: 'utf8', timeout: 30_000 })
}

let root: string
let home: { serverDir: string; visibleDir: string; shared: boolean }

describe.skipIf(!available)("a person's memory in a project's shared home @SC-2106", () => {
  beforeAll(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pinned-container-')))
    process.env.SITE_ROOT = root
    await prepareHarnessHome(KEY)
    await prepareRunStaging(KEY)
    home = { serverDir: runStagingFor(KEY), visibleDir: '/run/staging', shared: homeIsShared(KEY.runner) }
    spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' })
    const run = spawnSync('docker', [
      'run', '-d', '--name', NAME, '--network', 'none', '--memory', '512m', '--cpus', '1',
      '-v', harnessHomeBind(KEY), '-v', runStagingBind(KEY), IMAGE, 'tail', '-f', '/dev/null',
    ], { encoding: 'utf8' })
    if (run.status !== 0) throw new Error(`docker run failed: ${run.stderr}`)
  }, 120_000)

  afterAll(async () => {
    spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' })
    delete process.env.SITE_ROOT
    if (root) await fs.rm(root, { recursive: true, force: true })
  })

  it("writes none of a run's memory there, whatever it is sent (ADR-0188)", async () => {
    const memory: RunMemory = { items: [{ key: 'health', kind: 'fact', title: 'Health', body: 'First member: allergic to penicillin.' }], hinted: [] }
    expect(await writePinnedMemory(home, 'third', memory)).toBeNull()
    expect(inContainer('cat $(find /run/staging -type f) 2>/dev/null; true').stdout).not.toContain('penicillin')
    await releasePinnedMemory(home.serverDir, 'third')
  })
})

const OWN_KEY: ContainerKey = { scope: 'storage', ownerType: 'user', ownerId: 'u1', mode: 'rw', runner: { kind: 'person', userId: 'u1' } }
const OWN_NAME = `${NAME}-own`

function inOwnContainer(script: string): { status: number | null; stdout: string } {
  return spawnSync('docker', ['exec', '-u', 'appuser', OWN_NAME, 'sh', '-c', script], { encoding: 'utf8', timeout: 30_000 })
}

describe.skipIf(!available)("a run's memory in the person's own home (ADR-0188) @SC-2106", () => {
  let ownRoot: string
  let own: { serverDir: string; visibleDir: string; shared: boolean }

  beforeAll(async () => {
    ownRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'memory-container-')))
    process.env.SITE_ROOT = ownRoot
    await prepareHarnessHome(OWN_KEY)
    await prepareRunStaging(OWN_KEY)
    own = { serverDir: runStagingFor(OWN_KEY), visibleDir: '/run/staging', shared: homeIsShared(OWN_KEY.runner) }
    spawnSync('docker', ['rm', '-f', OWN_NAME], { stdio: 'ignore' })
    const run = spawnSync('docker', [
      'run', '-d', '--name', OWN_NAME, '--network', 'none', '--memory', '512m', '--cpus', '1',
      '-v', harnessHomeBind(OWN_KEY), '-v', runStagingBind(OWN_KEY), IMAGE, 'tail', '-f', '/dev/null',
    ], { encoding: 'utf8' })
    if (run.status !== 0) throw new Error(`docker run failed: ${run.stderr}`)
  }, 120_000)

  afterAll(async () => {
    spawnSync('docker', ['rm', '-f', OWN_NAME], { stdio: 'ignore' })
    delete process.env.SITE_ROOT
    if (ownRoot) await fs.rm(ownRoot, { recursive: true, force: true })
  })

  it('is written as a read-only file the run reads where its prompt says, and is gone when the run ends', async () => {
    const memory: RunMemory = {
      items: [{ key: 'tables', kind: 'rule', title: 'Comparing options', body: 'When comparing options, use a table.' }],
      hinted: [{ key: 'host', title: 'Preferred host' }],
    }
    const file = await writePinnedMemory(own, 'mine', memory)
    expect(file).toBe('/run/staging/pinned-memory/mine/pinned.md')
    const text = inOwnContainer(`cat ${file}`).stdout
    expect(text).toContain('When comparing options, use a table.')
    expect(text).toContain('Rule')
    expect(text).toContain('[`host`]')
    expect(inOwnContainer(`echo x > ${file}`).status).not.toBe(0)

    await releasePinnedMemory(own.serverDir, 'mine')
    expect(inOwnContainer('ls -A /run/staging/pinned-memory').stdout.trim()).toBe('')
  })
})

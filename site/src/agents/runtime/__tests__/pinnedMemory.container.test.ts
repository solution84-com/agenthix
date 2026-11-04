/**
 * A run's pinned memory, read from inside an agent container bound as a project's task runs are: the project's
 * own harness home, which the task runs of every member of the project share, and its staging folder bound again
 * read-only (containerRunArgs.ts). What one run was pinned about its person must not be readable by another run
 * there, and the file must be gone once the run ends.
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
import type { PinnedMemoryItem } from '@agenthix/core'
import { harnessHomeBind, prepareHarnessHome } from '../boundaryClaudeHome'
import { prepareRunStaging, runStagingBind } from '../runStaging'
import { runStagingFor } from '../harnessHomes'
import { homeIsShared, releasePinnedMemory, writePinnedMemory } from '../pinnedMemoryFiles'
import type { ContainerKey } from '../containerTypes'

const IMAGE = process.env.AGENT_IMAGE ?? 'agenthix-agent:latest'
const NAME = process.env.AGENT_PINNED_TEST_CONTAINER ?? 'agenthix-pinned-memory-test'
const available = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0

const KEY: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'rw', runner: { kind: 'project', projectId: 'p1' } }

const FIRST_PERSON: PinnedMemoryItem = { key: 'health', scope: 'person', title: 'Health', body: 'First member: allergic to penicillin.' }
const FIRST_AGENT_PERSON: PinnedMemoryItem = { key: 'tone', scope: 'agent_person', title: 'Tone', body: 'First member: short answers.' }
const PLACE: PinnedMemoryItem = { key: 'region', scope: 'agent_place', title: 'Region', body: 'Data stays in the EU.' }
const SECOND_PERSON: PinnedMemoryItem = { key: 'lang', scope: 'person', title: 'Language', body: 'Second member: writes in French.' }

/** As any run in the container: the harness user, with the shared home. */
function inContainer(script: string): { status: number | null; stdout: string } {
  return spawnSync('docker', ['exec', '-u', 'appuser', NAME, 'sh', '-c', script], { encoding: 'utf8', timeout: 30_000 })
}

let root: string
let home: { serverDir: string; visibleDir: string; shared: boolean }

describe.skipIf(!available)("a person's pinned memory in a project's shared home", () => {
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

  it("is not readable by another member's run, and is gone when the run ends", async () => {
    const first = await writePinnedMemory(home, 'first', [FIRST_PERSON, FIRST_AGENT_PERSON, PLACE])
    await writePinnedMemory(home, 'second', [SECOND_PERSON])

    // Everything any run in this container can find under the staging folder.
    const everything = inContainer('cat $(find /run/staging -type f) 2>/dev/null; true').stdout
    expect(everything).not.toContain('penicillin')
    expect(everything).not.toContain('short answers')
    expect(everything).not.toContain('French')
    // What the place's items are, the run still reads where its prompt says.
    expect(first).toBe('/run/staging/pinned-memory/first/pinned.md')
    expect(inContainer(`cat ${first}`).stdout).toContain('Data stays in the EU.')
    // And cannot change.
    expect(inContainer(`echo x > ${first}`).status).not.toBe(0)

    await releasePinnedMemory(home.serverDir, 'first')
    await releasePinnedMemory(home.serverDir, 'second')

    expect(inContainer('ls -A /run/staging/pinned-memory').stdout.trim()).toBe('')
  })
})

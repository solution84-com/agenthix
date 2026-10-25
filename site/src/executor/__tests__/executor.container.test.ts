/**
 * The executor's run against real executor containers: each step in a container of its own, with only its own
 * secrets, the snapshot read-only for a step with a secret, `/run/out` handed on, the version's own files run, and a
 * stop or a time limit removing the container. Masking and the scan are the site's fail-closed defaults, except where
 * a test passes a scan that finds nothing, as lane 2d's will when nothing is there.
 *
 * Run with `npm run test:container` from site/ (vitest.container.config.ts). Needs Docker and the executor image
 * (EXECUTOR_TEST_IMAGE, `imgtest/executor:dev` by default), and is skipped when either is missing. Containers are
 * named and labelled under HOST_NAMESPACE (`wf-lane-2b` by default), one at a time, removed at the end.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import type { WorkflowRunResult } from '@agenthix/core'

process.env.HOST_NAMESPACE ??= 'wf-lane-2b'
const IMAGE = process.env.EXECUTOR_TEST_IMAGE ?? 'imgtest/executor:dev'
const inspect = spawnSync('docker', ['image', 'inspect', '--format', '{{.Id}}', IMAGE], { encoding: 'utf8' })
const IMAGE_ID = inspect.status === 0 ? inspect.stdout.trim() : ''

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
vi.mock('../runEvents', () => ({ sendStepEvent: () => {}, sendResult: () => {} }))

import { executorDeps, getRun, resetExecutorForTests, startRun, stopRun } from '../run'
import { sweepExecutorLeftovers, listStepContainers } from '../runCleanup'
import { b64, CANARY, CANARY_B, definition, instruction, tempDir, writeTree } from './fixtures'

const original = { ...executorDeps }
let siteRoot: string
let ws: string

const CHECK = `#!/bin/bash
set -e
test "$(id -u)" = 1001
test -r /run/secrets/STAGING_DEPLOY_KEY
grep -q canary-7f3a9c1e /run/secrets/STAGING_DEPLOY_KEY
test ! -e /run/secrets/DB_PASSWORD
if touch "$PWD/written-by-a-secret-step" 2>/dev/null; then exit 11; fi
test "$(cat /run/out/handoff)" = from-step-1
test "$(cat /run/params/ref)" = main
test "$STAGING_HOST" = staging.example.com
test ! -e /var/run/docker.sock
if touch /etc/x 2>/dev/null; then exit 12; fi
if env | grep -q canary-; then exit 13; fi
grep -q '^CapEff:\\s*0*$' /proc/self/status
test -e README.md
`

async function run(over: Parameters<typeof instruction>[0] = {}, runId = 'run-c1'): Promise<WorkflowRunResult> {
  const ins = await instruction({ executorImageDigest: IMAGE_ID, ...over, runId })
  expect(await startRun(ins)).toEqual({ accepted: true })
  await vi.waitFor(async () => {
    const report = await getRun({ runId })
    expect(report?.result).toBeTruthy()
  }, { timeout: 120_000, interval: 250 })
  return (await getRun({ runId }))!.result!
}

describe.skipIf(!IMAGE_ID)('the executor, in real containers @SC-1343', () => {
  beforeAll(() => { executorDeps.resolveImage = async digest => (digest === IMAGE_ID ? IMAGE_ID : null) })

  beforeEach(async () => {
    resetExecutorForTests()
    db.runs.clear()
    siteRoot = await tempDir('executor-container-')
    process.env.SITE_ROOT = siteRoot
    ws = path.join(siteRoot, 'projects/proj-1/workspaces/ws-1')
    await writeTree(ws, { 'README.md': 'hello' })
    executorDeps.scanRunChanges = async () => ({ leaks: [] })
  })

  afterEach(async () => {
    Object.assign(executorDeps, { ...original, resolveImage: executorDeps.resolveImage })
    for (const name of await listStepContainers()) spawnSync('docker', ['rm', '-f', name])
    await fs.rm(siteRoot, { recursive: true, force: true })
  })

  it('runs each step with only its own secrets, and writes back what the steps without one built', async () => {
    const d = definition({
      steps: [
        { name: 'Build', run: 'echo built > built.txt && echo -n from-step-1 > /run/out/handoff && test ! -e /run/secrets/STAGING_DEPLOY_KEY', secrets: [], timeoutSeconds: null },
        { name: 'Upload', run: './deploy/upload.sh', secrets: ['STAGING_DEPLOY_KEY'], timeoutSeconds: 60 },
        { name: 'Migrate', run: 'grep -q canary-b21d /run/secrets/DB_PASSWORD && test ! -e /run/secrets/STAGING_DEPLOY_KEY', secrets: ['DB_PASSWORD'], timeoutSeconds: null },
      ],
    })
    const r = await run({ definition: d, files: [{ path: 'deploy/upload.sh', contentBase64: b64(CHECK), executable: true }] })
    expect(r.failure).toBeNull()
    expect(r.steps.map(s => s.state)).toEqual(['passed', 'passed', 'passed'])
    expect(r.writeBack?.changed).toEqual(['built.txt'])
    expect(await fs.readFile(path.join(ws, 'built.txt'), 'utf8')).toBe('built\n')
    await expect(fs.stat(path.join(ws, 'written-by-a-secret-step'))).rejects.toThrow()
    expect(JSON.stringify(r)).not.toContain(CANARY)
    expect(JSON.stringify(r)).not.toContain(CANARY_B)
    expect(await listStepContainers()).toEqual([])
    await vi.waitFor(async () => expect(await fs.readdir(path.join(siteRoot, 'executor/runs'))).toEqual([]))
  })

  it('runs the version\'s own file, never one of the same name the agent put in the workspace', async () => {
    await writeTree(ws, { 'deploy/upload.sh': '#!/bin/sh\nexit 0\n' })
    await fs.chmod(path.join(ws, 'deploy/upload.sh'), 0o755)
    const d = definition({ steps: [{ name: 'Upload', run: './deploy/upload.sh', secrets: [], timeoutSeconds: null }] })
    const r = await run({ definition: d, files: [{ path: 'deploy/upload.sh', contentBase64: b64('#!/bin/sh\nexit 7\n'), executable: true }] })
    expect(r.steps[0]).toMatchObject({ state: 'failed', exitCode: 7 })
  })

  it('stops a running step and writes nothing back (attack A18)', async () => {
    const d = definition({ files: [], steps: [{ name: 'Slow', run: 'echo x > half.txt; sleep 60', secrets: [], timeoutSeconds: null }] })
    const ins = await instruction({ executorImageDigest: IMAGE_ID, definition: d, files: [], runId: 'run-stop' })
    expect(await startRun(ins)).toEqual({ accepted: true })
    await vi.waitFor(async () => expect(await listStepContainers('run-stop')).toHaveLength(1), { timeout: 30_000, interval: 250 })
    expect(await stopRun({ runId: 'run-stop', reason: 'stopped' })).toEqual({ stopped: true })
    await vi.waitFor(async () => expect((await getRun({ runId: 'run-stop' }))?.result).toBeTruthy(), { timeout: 30_000, interval: 250 })
    const r = (await getRun({ runId: 'run-stop' }))!.result!
    expect(r.state).toBe('stopped')
    await expect(fs.stat(path.join(ws, 'half.txt'))).rejects.toThrow()
    expect(await listStepContainers()).toEqual([])
  })

  it('ends a step at its own time limit', async () => {
    const d = definition({ files: [], steps: [{ name: 'Slow', run: 'sleep 60', secrets: [], timeoutSeconds: 2 }, { name: 'Next', run: 'true', secrets: [], timeoutSeconds: null }] })
    const r = await run({ definition: d, files: [] }, 'run-timeout')
    expect(r.failure?.code).toBe('step_timeout')
    expect(r.steps.map(s => s.state)).toEqual(['failed', 'skipped'])
  })

  it('removes a step container a crash left behind, when the site starts', async () => {
    const name = `${process.env.HOST_NAMESPACE}-workflow-leftover-0`
    const started = spawnSync('docker', [
      'run', '-d', '--name', name, '--label', `${process.env.HOST_NAMESPACE}.workflow-run=leftover`,
      '--memory', '2g', '--cpus', '2', '--network', 'none', IMAGE_ID, 'sleep', '60',
    ])
    expect(started.status).toBe(0)
    await writeTree(siteRoot, { 'executor/runs/leftover/snapshot/x': 'left' })
    const swept = await sweepExecutorLeftovers()
    expect(swept.containers).toBe(1)
    expect(await listStepContainers()).toEqual([])
    await expect(fs.stat(path.join(siteRoot, 'executor/runs/leftover'))).rejects.toThrow()
  })
})

/**
 * Masking and the changed-file scan against real executor containers (attacks A1's masking and A5): a step prints a
 * canary in every form, and another commits one to git, and nothing of either leaves the site.
 *
 * Run with `npm run test:container` from site/. Needs Docker and the executor image (EXECUTOR_TEST_IMAGE,
 * `imgtest/executor:dev` by default), and is skipped when either is missing. Containers are named and labelled under
 * HOST_NAMESPACE (`wf-lane-2d` by default), one at a time, removed at the end.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import type { WorkflowRunResult } from '@agenthix/core'

process.env.HOST_NAMESPACE ??= 'wf-lane-2d'
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
vi.mock('../../runEvents', () => ({ sendStepEvent: () => {}, sendResult: () => {} }))

import { executorDeps, getRun, resetExecutorForTests, startRun } from '../../run'
import { listStepContainers } from '../../runCleanup'
import { CANARY, CANARY_B, definition, instruction, tempDir, writeTree } from '../../__tests__/fixtures'

const original = { ...executorDeps }
let siteRoot: string
let ws: string

const PRINT_EVERY_FORM = [
  'K=$(cat /run/secrets/STAGING_DEPLOY_KEY)',
  'echo "plain $K"',
  'for p in "" u us; do printf "%s%s:tail" "$p" "$K" | base64 -w0; echo; done',
  'printf "%s" "$K" | xxd -p -c 256',
  'printf "%s" "$K" | xxd -p -c 256 | tr a-f A-F',
  'printf "Authorization: Basic %s\\n" "$(printf "deploy:%s" "$K" | base64 -w0)"',
  'echo "twice: $K$K"',
].join('\n')

async function run(over: Parameters<typeof instruction>[0], runId: string): Promise<WorkflowRunResult> {
  const ins = await instruction({ executorImageDigest: IMAGE_ID, ...over, runId })
  expect(await startRun(ins)).toEqual({ accepted: true })
  await vi.waitFor(async () => expect((await getRun({ runId }))?.result).toBeTruthy(), { timeout: 120_000, interval: 250 })
  return (await getRun({ runId }))!.result!
}

describe.skipIf(!IMAGE_ID)('masking and the scan, in real containers', () => {
  beforeAll(() => { executorDeps.resolveImage = async digest => (digest === IMAGE_ID ? IMAGE_ID : null) })

  beforeEach(async () => {
    resetExecutorForTests()
    db.runs.clear()
    siteRoot = await tempDir('executor-masking-')
    process.env.SITE_ROOT = siteRoot
    ws = path.join(siteRoot, 'projects/proj-1/workspaces/ws-1')
    await writeTree(ws, { 'README.md': 'hello' })
  })

  afterEach(async () => {
    Object.assign(executorDeps, { ...original, resolveImage: executorDeps.resolveImage })
    for (const name of await listStepContainers()) spawnSync('docker', ['rm', '-f', name])
    await fs.rm(siteRoot, { recursive: true, force: true })
  })

  it('masks a secret printed in every form, and another secret of the place the run was not given (A1) @SC-1350', async () => {
    const d = definition({
      files: [],
      steps: [
        { name: 'Print', run: PRINT_EVERY_FORM, secrets: ['STAGING_DEPLOY_KEY'], timeoutSeconds: 60 },
        { name: 'Other', run: `echo "left behind: ${CANARY_B}"`, secrets: [], timeoutSeconds: 60 },
      ],
    })
    const r = await run({ definition: d, files: [] }, 'run-mask')
    expect(r.steps.map(s => s.state)).toEqual(['passed', 'passed'])
    const output = r.steps[0]!.output
    expect(output).toContain('plain ***')
    expect(output).toContain('Authorization: Basic ZGVwbG95Om***')
    expect(output).toContain('twice: ***\n')
    const hex = Buffer.from(CANARY).toString('hex')
    for (const leaked of [CANARY, hex, hex.toUpperCase(), Buffer.from(CANARY).toString('base64').slice(2, 30)]) {
      expect(output).not.toContain(leaked)
    }
    expect(output.match(/\*\*\*/g)!.length).toBeGreaterThanOrEqual(8)
    expect(r.steps[1]!.output).toBe('left behind: ***\n')
    expect(r.printedSecretNames).toEqual(['DB_PASSWORD', 'STAGING_DEPLOY_KEY'])
    expect(JSON.stringify(r)).not.toContain(CANARY)
    expect(JSON.stringify(r)).not.toContain(CANARY_B)
  })

  it('drops every change when a step commits a secret, and finds it in git\'s objects and in /run/out (A5) @SC-1352', async () => {
    const d = definition({
      files: [],
      steps: [
        { name: 'Hand on', run: 'cp /run/secrets/STAGING_DEPLOY_KEY /run/out/key', secrets: ['STAGING_DEPLOY_KEY'], timeoutSeconds: 60 },
        {
          name: 'Commit',
          run: [
            'git init -q repo && cd repo',
            'echo "token=$(cat /run/out/key)" > config.txt && echo fine > ok.txt',
            'git add . && git -c user.name=t -c user.email=t@example.com commit -qm add',
            'rm config.txt',
          ].join('\n'),
          secrets: [],
          timeoutSeconds: 60,
        },
      ],
    })
    const r = await run({ definition: d, files: [] }, 'run-commit')
    expect(r.state).toBe('failed')
    expect(r.failure?.code).toBe('secret_in_files')
    expect(r.writeBack).toBeNull()
    expect(r.leaks).toContainEqual({ path: '/run/out/key', secretName: 'STAGING_DEPLOY_KEY' })
    expect(r.leaks.some(l => /^repo\/\.git\/objects\/[0-9a-f]{2}\//.test(l.path) && l.secretName === 'STAGING_DEPLOY_KEY')).toBe(true)
    expect(r.leaks.every(l => !l.path.startsWith('repo/ok.txt'))).toBe(true)
    await expect(fs.stat(path.join(ws, 'repo'))).rejects.toThrow()
    expect(JSON.stringify(r)).not.toContain(CANARY)
    expect(await listStepContainers()).toEqual([])
  })
})

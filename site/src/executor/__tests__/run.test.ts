import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { WorkflowRunResult } from '@agenthix/core'

const db = vi.hoisted(() => ({
  runs: new Map<string, Record<string, unknown>>(),
  workspace: null as null | { id: string; ownerType: string; ownerId: string },
}))
vi.mock('#db', () => ({
  prisma: {
    workspace: { findUnique: async () => db.workspace },
    executorRun: {
      count: async ({ where }: { where: { id: string } }) => (db.runs.has(where.id) ? 1 : 0),
      create: async ({ data }: { data: Record<string, unknown> }) => { db.runs.set(data.id as string, { ...data, state: 'RUNNING' }) },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        db.runs.set(where.id, { ...db.runs.get(where.id), ...data })
      },
      findUnique: async ({ where }: { where: { id: string } }) => db.runs.get(where.id) ?? null,
    },
    executorSnapshot: { create: async () => {}, updateMany: async () => {} },
  },
}))
vi.mock('../../agents/runtime/containerLifecycle', async importOriginal => ({
  ...(await importOriginal<typeof import('../../agents/runtime/containerLifecycle')>()),
  dockerWithin: async () => ({ stdout: '', stderr: '' }),
}))
vi.mock('../runEvents', () => ({ sendStepEvent: () => {}, sendResult: () => {} }))

import { executorDeps, getRun, resetExecutorForTests, startRun, stopRun } from '../run'
import type { StepRunInput, StepOutcome } from '../stepRunner'
import { CANARY, definition, instruction, tempDir, writeTree } from './fixtures'

const original = { ...executorDeps }
let siteRoot: string
let ws: string
let results: WorkflowRunResult[]
let resultArrived: Promise<WorkflowRunResult>
const savedRoot = process.env.SITE_ROOT

/** A step container stand-in: does `act` to the snapshot, prints the canary, and exits with `code`. */
function step(act: (snapshot: string) => Promise<void>, code = 0) {
  return async (input: StepRunInput): Promise<StepOutcome> => {
    const snapshot = input.command.args.find(a => a.includes('/snapshot:'))!.split(':')[0]!
    await act(snapshot)
    const out = Buffer.concat([await input.maskers.stdout.push(Buffer.from(`printing ${CANARY}\n`)), await input.maskers.stdout.end()])
    return { end: 'exited', exitCode: code, output: out.toString(), outputTruncated: false, printed: input.maskers.stdout.printed() }
  }
}

beforeEach(async () => {
  resetExecutorForTests()
  db.runs.clear()
  siteRoot = await tempDir('executor-run-')
  process.env.SITE_ROOT = siteRoot
  ws = path.join(siteRoot, 'projects/proj-1/workspaces/ws-1')
  await writeTree(ws, { 'README.md': 'hello' })
  db.workspace = { id: 'ws-1', ownerType: 'project', ownerId: 'proj-1' }
  results = []
  let resolve!: (r: WorkflowRunResult) => void
  resultArrived = new Promise(r => { resolve = r })
  Object.assign(executorDeps, {
    resolveImage: async () => `sha256:${'e'.repeat(64)}`,
    sendStepEvent: () => {},
    sendResult: (r: WorkflowRunResult) => { results.push(r); resolve(r) },
    runStep: step(async () => {}),
  })
})

afterEach(async () => {
  Object.assign(executorDeps, original)
  process.env.SITE_ROOT = savedRoot
  await fs.rm(siteRoot, { recursive: true, force: true })
})

async function finished(): Promise<WorkflowRunResult> {
  const r = await resultArrived
  // The run's folders are removed just after the result is sent.
  await vi.waitFor(async () => expect(await getRun({ runId: r.runId })).toMatchObject({ result: expect.anything() }))
  return r
}

describe('starting a run', () => {
  it('refuses a version whose hash differs, before anything is written or started', async () => {
    const ins = await instruction()
    const answer = await startRun({ ...ins, versionHash: 'f'.repeat(64) })
    expect(answer).toMatchObject({ accepted: false, reason: 'hash_mismatch' })
    expect(db.runs.size).toBe(0)
    await expect(fs.stat(path.join(siteRoot, 'executor'))).rejects.toThrow()
  })

  it('refuses a workspace this site does not hold', async () => {
    db.workspace = null
    expect(await startRun(await instruction())).toMatchObject({ accepted: false, reason: 'workspace_missing' })
  })

  it('refuses an image it does not have', async () => {
    executorDeps.resolveImage = async () => null
    expect(await startRun(await instruction())).toMatchObject({ accepted: false, reason: 'image_missing' })
  })

  it('refuses a run whose hosts its network cannot have, before anything is made', async () => {
    const d = definition({ hosts: [{ host: 'ns.example.com', port: 53 }] })
    const answer = await startRun(await instruction({ definition: d }))
    expect(answer).toMatchObject({ accepted: false, reason: 'invalid_instruction', message: expect.stringContaining('port 53') })
  })

  it('refuses a run it already has', async () => {
    const ins = await instruction()
    expect(await startRun(ins)).toEqual({ accepted: true })
    expect(await startRun(ins)).toMatchObject({ accepted: false, reason: 'already_known' })
    await finished()
  })
})

describe('a run, end to end on this site', () => {
  it('writes nothing back when a step leaves a secret in a file, and says which file and secret (attack A5)', async () => {
    executorDeps.runStep = step(async s => { await fs.writeFile(path.join(s, 'README.md'), `key=${CANARY}`) })
    expect(await startRun(await instruction())).toEqual({ accepted: true })
    const r = await finished()
    expect(r.state).toBe('failed')
    expect(r.failure?.code).toBe('secret_in_files')
    expect(r.leaks).toEqual([{ path: 'README.md', secretName: 'STAGING_DEPLOY_KEY' }])
    expect(r.writeBack).toBeNull()
    expect(await fs.readFile(path.join(ws, 'README.md'), 'utf8')).toBe('hello')
  })

  it('writes nothing back when the scan finds a leak (attack A7)', async () => {
    executorDeps.scanRunChanges = async ({ changes }) => ({ leaks: changes.map(c => ({ path: c.path, secretName: 'STAGING_DEPLOY_KEY' })) })
    executorDeps.runStep = step(async s => { await fs.writeFile(path.join(s, 'leak.txt'), CANARY) })
    await startRun(await instruction())
    const r = await finished()
    expect(r.failure?.code).toBe('secret_in_files')
    await expect(fs.stat(path.join(ws, 'leak.txt'))).rejects.toThrow()
  })

  it('writes the changes back once the scan passes', async () => {
    executorDeps.scanRunChanges = async () => ({ leaks: [] })
    let n = 0
    executorDeps.runStep = step(async s => { if (n++ === 0) await fs.writeFile(path.join(s, 'built.txt'), 'built') })
    await startRun(await instruction())
    const r = await finished()
    expect(r.state).toBe('passed')
    expect(r.writeBack).toEqual({ changed: ['built.txt'], conflicts: [] })
    expect(await fs.readFile(path.join(ws, 'built.txt'), 'utf8')).toBe('built')
  })

  it('writes nothing back after a stop (attack A18)', async () => {
    executorDeps.scanRunChanges = async () => ({ leaks: [] })
    executorDeps.runStep = async (input: StepRunInput) => {
      const snapshot = input.command.args.find(a => a.includes('/snapshot:'))!.split(':')[0]!
      await fs.writeFile(path.join(snapshot, 'half.txt'), 'half done')
      await stopRun({ runId: 'run-1', reason: 'turned_off' })
      return { end: 'stopped', exitCode: null, output: '', outputTruncated: false, printed: [] }
    }
    await startRun(await instruction())
    const r = await finished()
    expect(r.state).toBe('stopped')
    expect(r.failure?.code).toBe('turned_off')
    await expect(fs.stat(path.join(ws, 'half.txt'))).rejects.toThrow()
  })

  it('sends no secret value back, and removes its folders when it ends', async () => {
    await startRun(await instruction())
    const r = await finished()
    expect(JSON.stringify(r)).not.toContain(CANARY)
    expect(JSON.stringify(db.runs.get('run-1'))).not.toContain(CANARY)
    expect(r.steps[0]!.output).toBe('printing ***\n')
    expect(r.printedSecretNames).toEqual(['STAGING_DEPLOY_KEY'])
    await vi.waitFor(async () => expect(await fs.readdir(path.join(siteRoot, 'executor/runs'))).toEqual([]))
  })

  it('fails without running anything when the workspace holds a hard link', async () => {
    await writeTree(siteRoot, { 'other/file.txt': 'elsewhere' })
    await fs.link(path.join(siteRoot, 'other/file.txt'), path.join(ws, 'hard.txt'))
    let ran = false
    executorDeps.runStep = async () => { ran = true; throw new Error('must not run') }
    await startRun(await instruction())
    const r = await finished()
    expect(ran).toBe(false)
    expect(r.failure).toMatchObject({ code: 'site_error', message: expect.stringContaining('hard link') })
  })

  it('answers workflow.get from the database once the run has ended', async () => {
    await startRun(await instruction())
    await finished()
    const report = await getRun({ runId: 'run-1' })
    expect(report).toMatchObject({ runId: 'run-1', state: 'passed' })
    expect(await getRun({ runId: 'unknown' })).toBeNull()
  })
})

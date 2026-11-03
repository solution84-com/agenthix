/**
 * A workflow run aimed at a live preview (core's `WorkflowRunInstruction.livePreview`; live preview spec section 4,
 * *Secrets*): refused unless this site holds the live preview running on the run's workspace; its steps work on the
 * live preview's copy; its secrets are handed to the app's container only after every step passed and the scan found
 * nothing, and never written into the copy or the workspace.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { WorkflowRunInstruction, WorkflowRunResult } from '@agenthix/core'

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

import { executorDeps, getRun, resetExecutorForTests, startRun } from '../run'
import type { StepRunInput, StepOutcome } from '../stepRunner'
import { CANARY, CANARY_B, instruction, tempDir, writeTree } from './fixtures'

const original = { ...executorDeps }
let siteRoot: string
let ws: string
let copy: string
let handed: WorkflowRunInstruction[]
let resultArrived: Promise<WorkflowRunResult>
const savedRoot = process.env.SITE_ROOT

function step(act: (snapshot: string) => Promise<void>, code = 0) {
  return async (input: StepRunInput): Promise<StepOutcome> => {
    const snapshot = input.command.args.find(a => a.includes('/snapshot:'))!.split(':')[0]!
    await act(snapshot)
    return { end: 'exited', exitCode: code, output: '', outputTruncated: false, printed: [] }
  }
}

const aimed = () => instruction({ livePreview: { livePreviewId: 'lp-1' } })

beforeEach(async () => {
  resetExecutorForTests()
  db.runs.clear()
  siteRoot = await tempDir('executor-lp-')
  process.env.SITE_ROOT = siteRoot
  ws = path.join(siteRoot, 'projects/proj-1/workspaces/ws-1')
  copy = path.join(siteRoot, 'projects/proj-1/clones/copy-1')
  await writeTree(ws, { 'README.md': 'workspace' })
  await writeTree(copy, { 'README.md': 'copy' })
  db.workspace = { id: 'ws-1', ownerType: 'project', ownerId: 'proj-1' }
  handed = []
  let resolve!: (r: WorkflowRunResult) => void
  resultArrived = new Promise(r => { resolve = r })
  Object.assign(executorDeps, {
    resolveImage: async () => `sha256:${'e'.repeat(64)}`,
    sendStepEvent: () => {},
    sendResult: (r: WorkflowRunResult) => resolve(r),
    scanRunChanges: async () => ({ leaks: [] }),
    runStep: step(async () => {}),
    resolveLivePreview: async (ins: WorkflowRunInstruction) => (ins.livePreview?.livePreviewId === 'lp-1'
      ? { livePreviewId: 'lp-1', hostDir: copy, containerDir: '/projects/proj-1/clones/copy-1' } : null),
    handOver: async (ins: WorkflowRunInstruction) => { handed.push(ins); return null },
  })
})

afterEach(async () => {
  Object.assign(executorDeps, original)
  process.env.SITE_ROOT = savedRoot
  await fs.rm(siteRoot, { recursive: true, force: true })
})

async function finished(): Promise<WorkflowRunResult> {
  const r = await resultArrived
  await vi.waitFor(async () => expect(await getRun({ runId: r.runId })).toMatchObject({ result: expect.anything() }))
  return r
}

async function holds(dir: string, value: string): Promise<boolean> {
  for (const entry of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && (await fs.readFile(path.join(entry.parentPath, entry.name), 'utf8')).includes(value)) return true
  }
  return false
}

describe('a run aimed at a live preview while the live preview is off @SC-1776', () => {
  it('is refused before anything is resolved or made, saying it is not available', async () => {
    const resolve = vi.fn(executorDeps.resolveLivePreview)
    executorDeps.resolveLivePreview = resolve
    const answer = await startRun(await aimed())
    expect(answer).toMatchObject({ accepted: false, reason: 'live_preview_unavailable', message: expect.stringMatching(/not available.*Nothing was changed\.$/) })
    expect(resolve).not.toHaveBeenCalled()
    expect(db.runs.size).toBe(0)
    expect(handed).toEqual([])
  })

  it('leaves a run on the workspace as it was', async () => {
    expect(await startRun(await instruction())).toEqual({ accepted: true })
    expect((await finished()).state).toBe('passed')
  })
})

withFeature('livePreview', () => {
  describe('a run aimed at a live preview @SC-1746', () => {
    it('is refused when this site does not have that live preview running on the workspace, and nothing is made', async () => {
      executorDeps.resolveLivePreview = async () => null
      const answer = await startRun(await aimed())
      expect(answer).toMatchObject({ accepted: false, reason: 'live_preview_unavailable', message: expect.stringContaining('Nothing was changed.') })
      expect(db.runs.size).toBe(0)
      expect(handed).toEqual([])
    })

    it('is refused for another site\'s live preview even when the workspace is here', async () => {
      const answer = await startRun(await instruction({ livePreview: { livePreviewId: 'lp-elsewhere' } }))
      expect(answer).toMatchObject({ accepted: false, reason: 'live_preview_unavailable' })
    })

    it('works on the live preview\'s copy, then hands the secrets over; neither the copy nor the workspace holds one', async () => {
      executorDeps.runStep = step(async s => { await fs.writeFile(path.join(s, 'built.txt'), 'built') })
      expect(await startRun(await aimed())).toEqual({ accepted: true })
      const r = await finished()
      expect(r.state).toBe('passed')
      expect(await fs.readFile(path.join(copy, 'built.txt'), 'utf8')).toBe('built')
      await expect(fs.stat(path.join(ws, 'built.txt'))).rejects.toThrow()
      expect(handed).toHaveLength(1)
      expect(handed[0]!.livePreview).toEqual({ livePreviewId: 'lp-1' })
      for (const value of [CANARY, CANARY_B]) {
        expect(await holds(copy, value)).toBe(false)
        expect(await holds(ws, value)).toBe(false)
      }
    })

    it('hands nothing over when a step fails', async () => {
      executorDeps.runStep = step(async () => {}, 1)
      await startRun(await aimed())
      const r = await finished()
      expect(r.state).toBe('failed')
      expect(handed).toEqual([])
    })

    it('hands nothing over when the scan finds a secret in the files', async () => {
      executorDeps.scanRunChanges = async () => ({ leaks: [{ path: 'leak.txt', secretName: 'STAGING_DEPLOY_KEY' }] })
      executorDeps.runStep = step(async s => { await fs.writeFile(path.join(s, 'leak.txt'), 'x') })
      await startRun(await aimed())
      const r = await finished()
      expect(r.failure?.code).toBe('secret_in_files')
      expect(handed).toEqual([])
    })

    it('fails, saying why, when the secrets could not be handed', async () => {
      executorDeps.handOver = async () => 'The run passed, but the live preview stopped or paused meanwhile, so its secrets were not handed to the app.'
      await startRun(await aimed())
      const r = await finished()
      expect(r).toMatchObject({ state: 'failed', failure: { code: 'site_error', message: expect.stringContaining('stopped or paused') } })
    })

    it('a run aimed at no live preview hands nothing over and works on the workspace', async () => {
      executorDeps.runStep = step(async s => { await fs.writeFile(path.join(s, 'built.txt'), 'built') })
      await startRun(await instruction())
      expect((await finished()).state).toBe('passed')
      expect(handed).toEqual([])
      expect(await fs.readFile(path.join(ws, 'built.txt'), 'utf8')).toBe('built')
    })
  })
})

import { describe, it, expect } from 'vitest'
import type { WorkflowStepEvent } from '@agenthix/core'
import { runSteps, type StepsContext } from '../runSteps'
import { createMasker } from '../seams'
import type { StepOutcome, StepRunInput } from '../stepRunner'
import { CANARY, CANARY_B, instruction } from './fixtures'

const folders = { root: '/r', workflow: '/r/workflow', out: '/r/out', snapshot: '/r/snapshot' }

async function context(results: Partial<StepOutcome>[], over: Partial<StepsContext> = {}) {
  const inputs: StepRunInput[] = []
  const events: WorkflowStepEvent[] = []
  const ctx: StepsContext = {
    ins: await instruction(),
    imageId: `sha256:${'d'.repeat(64)}`,
    folders,
    workdir: '/projects/proj-1/workspaces/ws-1',
    networkArgs: ['--network', 'none'],
    signal: new AbortController().signal,
    deadline: Date.now() + 600_000,
    stopReason: () => null,
    emit: e => events.push(e),
    runStep: async input => {
      inputs.push(input)
      const r = results[inputs.length - 1] ?? {}
      return { end: 'exited', exitCode: 0, output: '', outputTruncated: false, printed: [], ...r }
    },
    createMasker,
    ...over,
  }
  return { ctx, inputs, events }
}

describe('a run\'s steps', () => {
  it('gives each step only the secrets it names (attack A5)', async () => {
    const { ctx, inputs } = await context([])
    const out = await runSteps(ctx)
    expect(out.failure).toBeNull()
    expect(out.steps.map(s => s.state)).toEqual(['passed', 'passed', 'passed'])
    const has = (i: number, v: string) => inputs[i]!.stdin.includes(Buffer.from(v))
    expect([has(0, CANARY), has(0, CANARY_B)]).toEqual([false, false])
    expect([has(1, CANARY), has(1, CANARY_B)]).toEqual([true, false])
    expect([has(2, CANARY), has(2, CANARY_B)]).toEqual([false, true])
    for (const input of inputs) expect(JSON.stringify(input.command)).not.toMatch(/canary-/)
  })

  it('binds the snapshot read-only for steps with a secret only', async () => {
    const { ctx, inputs } = await context([])
    await runSteps(ctx)
    const mode = (i: number) => inputs[i]!.command.args.find(a => a.startsWith('/r/snapshot:'))!.split(':')[2]
    expect([mode(0), mode(1), mode(2)]).toEqual(['rw', 'ro', 'ro'])
  })

  it('runs the version\'s file for ./ steps, never the workspace\'s', async () => {
    const { ctx, inputs } = await context([])
    await runSteps(ctx)
    expect(inputs[1]!.command.args.at(-1)).toBe('/run/workflow/deploy/upload.sh')
    expect(inputs[2]!.command.args.at(-1)).toBe('/run/workflow/deploy/upload.sh --migrate')
  })

  it('ends the run at the first failure and skips the rest', async () => {
    const { ctx, inputs, events } = await context([{ exitCode: 0 }, { exitCode: 3 }])
    const out = await runSteps(ctx)
    expect(inputs).toHaveLength(2)
    expect(out.steps.map(s => s.state)).toEqual(['passed', 'failed', 'skipped'])
    expect(out.failure).toMatchObject({ code: 'step_failed' })
    expect(events.filter(e => e.index === 2).map(e => e.state)).toEqual(['skipped'])
  })

  it('tells a step\'s time limit from the run\'s', async () => {
    const step = await context([{}, { end: 'timeout', exitCode: null }])
    expect((await runSteps(step.ctx)).failure).toMatchObject({ code: 'step_timeout' })
    expect(step.inputs[1]!.timeoutMs).toBe(60_000)

    const run = await context([{ end: 'timeout', exitCode: null }], { deadline: Date.now() + 5_000 })
    expect((await runSteps(run.ctx)).failure).toMatchObject({ code: 'run_timeout' })
  })

  it('marks a stopped step stopped and the rest stopped too', async () => {
    let reason: 'stopped' | null = null
    const { ctx } = await context([{ end: 'stopped', exitCode: null }], { stopReason: () => reason })
    const original = ctx.runStep
    ctx.runStep = async input => { reason = 'stopped'; return original(input) }
    const out = await runSteps(ctx)
    expect(out.failure).toMatchObject({ code: 'stopped' })
    expect(out.steps.map(s => s.state)).toEqual(['stopped', 'skipped', 'skipped'])
  })

  it('reports a step as it starts and ends', async () => {
    const { ctx, events } = await context([])
    await runSteps(ctx)
    expect(events.filter(e => e.index === 0).map(e => e.state)).toEqual(['running', 'passed'])
  })

  it('masks every secret of the place in output with the site\'s masker (attack A1)', async () => {
    const m = createMasker((await instruction()).masking)
    const out = Buffer.concat([await m.push(Buffer.from(`a ${CANARY} b ${CANARY_B} c`)), await m.end()]).toString()
    expect(out).toBe('a *** b *** c')
    expect(m.printed()).toEqual(['DB_PASSWORD', 'STAGING_DEPLOY_KEY'])
    expect((await m.end()).length).toBe(0)
  })
})

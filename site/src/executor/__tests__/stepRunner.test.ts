import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../agents/runtime/containerLifecycle', async importOriginal => ({
  ...(await importOriginal<typeof import('../../agents/runtime/containerLifecycle')>()),
  dockerWithin: async () => ({ stdout: '', stderr: '' }),
}))

import { createFormMasker } from '../masking/masker'
import { material } from '../masking/__tests__/material'
import type { Masker } from '../seams'
import { runStepContainer, type StepRunInput } from '../stepRunner'

const CANARY = 'canary-5e0c1d-step-runner'

/** A `docker run` stand-in: prints each chunk on its stream in turn, then closes. */
function fakeDocker(chunks: { stream: 'stdout' | 'stderr'; text: string }[]) {
  const child = new EventEmitter() as ChildProcess
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  Object.assign(child, { stdout, stderr, stdin: new Writable({ write: (_c, _e, done) => done() }), kill: () => true })
  const paused: boolean[] = []
  setImmediate(async () => {
    for (const c of chunks) {
      ;(c.stream === 'stdout' ? stdout : stderr).write(c.text)
      await new Promise(r => setTimeout(r, 1))
      paused.push(stdout.isPaused())
    }
    stdout.end()
    stderr.end()
    let open = 2
    for (const s of [stdout, stderr]) s.on('close', () => { if (--open === 0) child.emit('close', 0) })
  })
  return { spawn: () => child, paused }
}

/** A masker that takes longer on early chunks than late ones, so out-of-order finishing would show. */
function slowMasker(inner: Masker): Masker {
  let n = 0
  return {
    push: async chunk => {
      const wait = Math.max(0, 20 - 5 * n++)
      const out = inner.push(chunk)
      await new Promise(r => setTimeout(r, wait))
      return out
    },
    end: () => inner.end(),
    printed: () => inner.printed(),
  }
}

function input(spawnDocker: StepRunInput['spawnDocker'], maskers: StepRunInput['maskers']): StepRunInput {
  return {
    command: { args: [], clientEnv: {} },
    containerName: 'wf-step-test',
    stdin: Buffer.alloc(0),
    maskers,
    timeoutMs: 60_000,
    signal: new AbortController().signal,
    onOutput: () => {},
    spawnDocker,
  }
}

describe('runStepContainer', () => {
  it('masks each stream in order, a secret split across chunks included, and names it', async () => {
    const mat = material({ DEPLOY_KEY: CANARY })
    const docker = fakeDocker([
      { stream: 'stdout', text: 'one ' },
      { stream: 'stdout', text: CANARY.slice(0, 9) },
      { stream: 'stdout', text: `${CANARY.slice(9)} two ` },
      { stream: 'stdout', text: 'three\n' },
    ])
    const outcome = await runStepContainer(input(docker.spawn, {
      stdout: slowMasker(createFormMasker(mat)),
      stderr: createFormMasker(mat),
    }))
    expect(outcome.output).toBe('one *** two three\n')
    expect(outcome.printed).toEqual(['DEPLOY_KEY'])
  })

  it('pauses a stream while its chunk is masked', async () => {
    const mat = material({ DEPLOY_KEY: CANARY })
    const docker = fakeDocker([{ stream: 'stdout', text: 'a\n' }, { stream: 'stdout', text: 'b\n' }])
    await runStepContainer(input(docker.spawn, { stdout: slowMasker(createFormMasker(mat)), stderr: createFormMasker(mat) }))
    expect(docker.paused[0]).toBe(true)
  })

  it('fails the step when masking fails, and lets nothing more out', async () => {
    const mat = material({ DEPLOY_KEY: CANARY })
    const broken: Masker = { push: async () => { throw new Error('masking broke') }, end: async () => new Uint8Array(0), printed: () => [] }
    const docker = fakeDocker([{ stream: 'stdout', text: `x ${CANARY}\n` }])
    const seen: string[] = []
    const run = runStepContainer({ ...input(docker.spawn, { stdout: broken, stderr: createFormMasker(mat) }), onOutput: o => seen.push(o) })
    await expect(run).rejects.toThrow('masking broke')
    expect(seen.join('')).not.toContain(CANARY)
  })
})

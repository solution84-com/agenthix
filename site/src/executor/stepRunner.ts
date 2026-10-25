/**
 * Running one step's container to its end (workflows spec part 2, *Steps and progress*): the values written to its
 * standard input, its output read through a masker — one per stream, so a secret split between standard output and
 * standard error chunks is still found whole in each — and the container removed before the step is reported done.
 * A stop or a time limit removes the container at once (`docker rm -f`), which ends the attached `docker run`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { WORKFLOW_STEP_OUTPUT_MAX } from '@agenthix/core'
import { dockerWithin } from '../agents/runtime/containerLifecycle'
import type { Masker } from './seams'
import type { StepRunCommand } from './stepContainer'

const REMOVE_TIMEOUT_MS = 30_000

export type StepEnd = 'exited' | 'timeout' | 'stopped'

export type StepOutcome = {
  end: StepEnd
  exitCode: number | null
  output: string
  outputTruncated: boolean
  printed: string[]
}

export type StepRunInput = {
  command: StepRunCommand
  containerName: string
  stdin: Buffer
  maskers: { stdout: Masker; stderr: Masker }
  /** Milliseconds this step may run; it is removed when they are up. */
  timeoutMs: number
  signal: AbortSignal
  onOutput: (output: string, truncated: boolean) => void
  spawnDocker?: (args: string[], env: NodeJS.ProcessEnv) => ChildProcess
}

const defaultSpawn = (args: string[], env: NodeJS.ProcessEnv) => spawn('docker', args, { env, stdio: ['pipe', 'pipe', 'pipe'] })

/** Removes a container and returns once it is gone, also when another removal of it is already under way. */
export async function removeContainer(name: string): Promise<void> {
  try {
    await dockerWithin(['rm', '-f', name], REMOVE_TIMEOUT_MS)
    return
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/no such container/i.test(message)) return
    if (!/already in progress/i.test(message)) throw err
  }
  const until = Date.now() + REMOVE_TIMEOUT_MS
  while (Date.now() < until) {
    const gone = await dockerWithin(['container', 'inspect', '--format', '{{.Id}}', name], REMOVE_TIMEOUT_MS).then(() => false, () => true)
    if (gone) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`${name} was still there ${REMOVE_TIMEOUT_MS / 1000} s after its removal began.`)
}

export function runStepContainer(input: StepRunInput): Promise<StepOutcome> {
  const spawnDocker = input.spawnDocker ?? defaultSpawn
  return new Promise<StepOutcome>((resolve, reject) => {
    let output = ''
    let truncated = false
    let end: StepEnd = 'exited'
    const decoders = { stdout: new TextDecoder('utf-8'), stderr: new TextDecoder('utf-8') }
    const append = (text: string) => {
      if (!text) return
      output += text
      if (output.length > WORKFLOW_STEP_OUTPUT_MAX) {
        output = output.slice(output.length - WORKFLOW_STEP_OUTPUT_MAX)
        truncated = true
      }
      input.onOutput(output, truncated)
    }
    const take = (stream: 'stdout' | 'stderr', masked: Uint8Array, last = false) =>
      append(decoders[stream].decode(masked, { stream: !last }))

    // The site's own environment reaches only the docker client; the container gets only what `-e` names.
    const child = spawnDocker(input.command.args, { ...process.env, ...input.command.clientEnv })
    let removal: Promise<void> | null = null
    const kill = (why: StepEnd) => {
      if (end !== 'exited') return
      end = why
      removal = removeContainer(input.containerName)
      removal.catch(() => child.kill('SIGKILL'))
    }
    const timer = setTimeout(() => kill('timeout'), input.timeoutMs)
    const onAbort = () => kill('stopped')
    if (input.signal.aborted) onAbort()
    else input.signal.addEventListener('abort', onAbort, { once: true })

    // Each stream is paused while its chunk is masked, so docker's pipe, not the site, holds what the step prints
    // meanwhile; each stream's chunks are masked and let out in order.
    let failed: unknown = null
    const masking = { stdout: Promise.resolve(), stderr: Promise.resolve() }
    for (const name of ['stdout', 'stderr'] as const) {
      const stream = child[name]
      stream?.on('data', (chunk: Buffer) => {
        stream.pause()
        masking[name] = masking[name]
          .then(() => input.maskers[name].push(chunk))
          .then(masked => take(name, masked), err => { failed ??= err; kill('stopped') })
          .finally(() => stream.resume())
      })
    }
    child.stdin?.on('error', () => {})
    child.stdin?.end(input.stdin)

    child.on('error', err => {
      clearTimeout(timer)
      input.signal.removeEventListener('abort', onAbort)
      reject(new Error(`docker could not be started: ${err.message}`))
    })
    child.on('close', code => {
      clearTimeout(timer)
      input.signal.removeEventListener('abort', onAbort)
      const ended = Promise.all((['stdout', 'stderr'] as const).map(name =>
        masking[name].then(() => input.maskers[name].end()).then(masked => take(name, masked, true))))
      ended.then(() => {
        if (failed) throw failed
        const printed = [...new Set([...input.maskers.stdout.printed(), ...input.maskers.stderr.printed()])].sort()
        return (removal ?? removeContainer(input.containerName)).then(
          () => resolve({ end, exitCode: end === 'exited' ? code : null, output, outputTruncated: truncated, printed }))
      }).catch(err => (removal ?? removeContainer(input.containerName)).finally(() => reject(err)))
    })
  })
}

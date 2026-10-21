/**
 * Commands a fleet admin started from the API, so a screen can follow one that takes minutes. Held in memory, for an
 * hour after each ends; only the person who started a command reads its answer. An export's key exists once, in the
 * host service's sealed answer (operations.ts), so it is handed over on the first read and then forgotten.
 */
import { randomUUID } from 'node:crypto'
import type { HostRequest, HostResult } from '@agenthix/core'

const KEEP_MS = 60 * 60_000

export type CommandRun = {
  id: string
  userId: string
  fingerprint: string
  op: HostRequest['op']
  state: 'pending' | 'done' | 'failed'
  result: HostResult | null
  problem: string | null
  startedAt: string
}

export class CommandRuns {
  private readonly runs = new Map<string, CommandRun>()
  private readonly finished = new Map<string, Promise<void>>()

  start(userId: string, fingerprint: string, op: HostRequest['op'], answer: Promise<HostResult>): CommandRun {
    const run: CommandRun = {
      id: randomUUID(), userId, fingerprint, op, state: 'pending', result: null, problem: null, startedAt: new Date().toISOString(),
    }
    this.runs.set(run.id, run)
    const finished = answer
      .then(result => { run.state = 'done'; run.result = result })
      .catch(err => { run.state = 'failed'; run.problem = err instanceof Error ? err.message : 'The command failed.' })
      .finally(() => {
        setTimeout(() => { this.runs.delete(run.id); this.finished.delete(run.id) }, KEEP_MS).unref?.()
      })
    this.finished.set(run.id, finished)
    return run
  }

  /** The run as its starter reads it; null for anyone else. */
  read(id: string, userId: string): CommandRun | null {
    const run = this.runs.get(id)
    if (!run || run.userId !== userId) return null
    const copy = { ...run }
    if (run.result?.ok && run.result.op === 'backup.export') {
      run.result = { ...run.result, result: { ...run.result.result, key: '' } } as HostResult
    }
    return copy
  }

  /** Waits for the run to end, up to `ms`. */
  async settle(run: CommandRun, ms: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const waited = new Promise<void>(resolve => { timer = setTimeout(resolve, ms) })
    await Promise.race([this.finished.get(run.id) ?? Promise.resolve(), waited])
    clearTimeout(timer)
  }
}

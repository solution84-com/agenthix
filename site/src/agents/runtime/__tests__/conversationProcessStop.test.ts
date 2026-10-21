import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const h = vi.hoisted(() => ({ dockerWithin: vi.fn() }))
vi.mock('../containerLifecycle', () => ({ dockerWithin: h.dockerWithin }))

import {
  STOP_PROCESSES_SCRIPT,
  parseStopProcessesOutput,
  stopConversationProcesses,
  stopConversationProcessesArgs,
} from '../conversationProcessStop'

describe('the stop command', () => {
  it('runs as the image user, with the id, the text and the pass limit as arguments', () => {
    expect(stopConversationProcessesArgs('agent-c1', 'conv-1', 'npm run dev')).toEqual(
      ['exec', '-u', 'appuser', 'agent-c1', 'sh', '-c', STOP_PROCESSES_SCRIPT, 'agenthix-stop-processes', 'conv-1', 'npm run dev', '50'],
    )
    expect(STOP_PROCESSES_SCRIPT).not.toContain('conv-1')
    expect(STOP_PROCESSES_SCRIPT).not.toContain('npm run dev')
  })

  it('reads the answer', () => {
    expect(parseStopProcessesOutput('done 0\n')).toEqual({ kind: 'stopped', stopped: [] })
    expect(parseStopProcessesOutput('stopped 12 npm run dev \nstopped 13 node vite \ndone 1\n'))
      .toEqual({ kind: 'stopped', stopped: [{ pid: 12, command: 'npm run dev' }, { pid: 13, command: 'node vite' }] })
    expect(parseStopProcessesOutput('stopped 12 x\ngave-up 14\n')).toEqual({ kind: 'gave-up', stopped: [{ pid: 12, command: 'x' }], remaining: [14] })
    expect(parseStopProcessesOutput('')).toEqual({ kind: 'failed', error: 'unexpected answer: ""' })
  })

  it('refuses an id it cannot tag and text over one line, without running anything', async () => {
    await expect(stopConversationProcesses('c1', 'bad id', '')).resolves.toEqual(expect.objectContaining({ kind: 'failed' }))
    await expect(stopConversationProcesses('c1', 'conv-1', 'a\nb')).resolves.toEqual(expect.objectContaining({ kind: 'failed' }))
    await expect(stopConversationProcesses('c1', 'conv-1', 'x'.repeat(201))).resolves.toEqual(expect.objectContaining({ kind: 'failed' }))
    expect(h.dockerWithin).not.toHaveBeenCalled()
  })

  it('passes a deadline, and reports a failed exec without throwing', async () => {
    h.dockerWithin.mockResolvedValueOnce({ stdout: 'done 0\n', stderr: '' })
    await expect(stopConversationProcesses('c1', 'conv-1', 'vite', { timeoutMs: 999 })).resolves.toEqual({ kind: 'stopped', stopped: [] })
    expect(h.dockerWithin).toHaveBeenLastCalledWith(expect.arrayContaining(['c1', 'conv-1', 'vite']), 999)
    h.dockerWithin.mockRejectedValueOnce(new Error('docker exec timed out'))
    await expect(stopConversationProcesses('c1', 'conv-1', '')).resolves.toEqual({ kind: 'failed', error: 'docker exec timed out' })
  })
})

/**
 * The script itself, run by /bin/sh over a process table written to a
 * temporary folder (its `$4`), with `kill` replaced by a function that records
 * each signal and removes a killed process from the table. No real process is
 * signalled.
 */
describe('the stop script', () => {
  let root: string
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-')) })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  type Proc = { pid: number; ppid: number; env: string[]; cmd: string[] }
  const command = (conv: string, extra: string[] = []) => [`SITE_SESSION=${conv}`, 'HOME=/home/agent', 'PATH=/usr/bin', ...extra]

  function table(procs: Proc[]): void {
    for (const p of procs) {
      const dir = path.join(root, String(p.pid))
      fs.mkdirSync(dir)
      fs.writeFileSync(path.join(dir, 'environ'), p.env.map(e => `${e}\0`).join(''))
      fs.writeFileSync(path.join(dir, 'cmdline'), p.cmd.map(c => `${c}\0`).join(''))
      fs.writeFileSync(path.join(dir, 'status'), `Name:\t${p.cmd[0]}\nPPid:\t${p.ppid}\n`)
    }
  }

  const stubs = `
kill() {
  sig=$1; shift; echo "$sig $*" >> "$ROOT/.signals"
  [ "$sig" = -KILL ] || return 0
  for p in "$@"; do rm -rf "$ROOT/$p"; done
}`

  function run(conv: string, match: string): { out: string; signals: string[]; left: number[] } {
    const out = execFileSync('/bin/sh', ['-c', `${stubs}\n${STOP_PROCESSES_SCRIPT}`, 'x', conv, match, '5', root], {
      encoding: 'utf8', env: { PATH: process.env.PATH, ROOT: root }, timeout: 10_000,
    })
    const file = path.join(root, '.signals')
    const signals = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : []
    const left = fs.readdirSync(root).filter(n => /^\d+$/.test(n)).map(Number).sort((a, b) => a - b)
    return { out: out.trim().split('\n').map(l => l.trimEnd()).join('\n'), signals, left }
  }

  const harness: Proc = { pid: 10, ppid: 0, env: ['SITE_SESSION=conv-1', 'HOME=/home/appuser'], cmd: ['node', '/usr/local/bin/claude'] }
  const server: Proc = { pid: 11, ppid: 0, env: ['HOME=/home/appuser', 'OPENCODE_SERVER_PASSWORD=x'], cmd: ['opencode', 'serve'] }
  const devServer: Proc = { pid: 20, ppid: 1, env: command('conv-1'), cmd: ['npm', 'run', 'dev'] }
  const devWorker: Proc = { pid: 21, ppid: 20, env: command('conv-1'), cmd: ['node', 'vite'] }
  const watcher: Proc = { pid: 30, ppid: 1, env: command('conv-1'), cmd: ['tsc', '--watch'] }
  const otherConv: Proc = { pid: 40, ppid: 1, env: command('conv-2'), cmd: ['npm', 'run', 'dev'] }
  const prefixConv: Proc = { pid: 41, ppid: 1, env: command('conv-10'), cmd: ['npm', 'run', 'dev'] }
  const untagged: Proc = { pid: 50, ppid: 1, env: ['HOME=/home/agent'], cmd: ['npm', 'run', 'dev'] }

  beforeEach(() => table([harness, server, devServer, devWorker, watcher, otherConv, prefixConv, untagged]))

  it('stops what matches, with what it started, freezing all of them before killing any', () => {
    const { out, signals, left } = run('conv-1', 'run dev')
    expect(out.split('\n')).toEqual(['stopped 20 npm run dev', 'stopped 21 node vite', 'done 1'])
    expect(signals).toEqual(['-STOP 20', '-STOP 21', '-KILL 20 21'])
    expect(left).toEqual([10, 11, 30, 40, 41, 50])
  })

  it('never reaches another conversation\'s processes, one whose id it prefixes, or an untagged one', () => {
    const { left } = run('conv-1', '')
    expect(left).toEqual([10, 11, 40, 41, 50])
  })

  it('never reaches the harness: the claude process carries the tag but not the command home, the server neither', () => {
    const { out } = run('conv-1', 'claude')
    expect(out).toBe('done 0')
    expect(run('conv-1', 'opencode').out).toBe('done 0')
    expect(run('conv-1', '').left).toEqual(expect.arrayContaining([10, 11]))
  })

  it('matches the text literally', () => {
    expect(run('conv-1', 'run.dev').out).toBe('done 0')
    expect(run('conv-1', '--watch').out.split('\n')).toEqual(['stopped 30 tsc --watch', 'done 1'])
  })
})

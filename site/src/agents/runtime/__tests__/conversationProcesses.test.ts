import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const h = vi.hoisted(() => ({ dockerWithin: vi.fn() }))
vi.mock('../containerLifecycle', () => ({ dockerWithin: h.dockerWithin }))

import {
  CONVERSATION_PROCESS_TAG,
  END_PROCESSES_SCRIPT,
  conversationProcessTag,
  endConversationProcesses,
  endConversationProcessesArgs,
  parseEndProcessesOutput,
} from '../conversationProcesses'

describe('the conversation process tag', () => {
  it('is SITE_SESSION=<conversation id>', () => {
    expect(CONVERSATION_PROCESS_TAG).toBe('SITE_SESSION')
    expect(conversationProcessTag('cm1abc-9_Z')).toEqual({ SITE_SESSION: 'cm1abc-9_Z' })
  })

  it.each(['', 'a b', 'a;b', 'a$(x)', 'a.b', '*', 'x'.repeat(129)])('refuses the id %j', (id) => {
    expect(() => conversationProcessTag(id)).toThrow(/unexpected conversation id/)
  })
})

describe('the finder command', () => {
  it('runs as the image user, with the id and the pass limit as arguments', () => {
    expect(endConversationProcessesArgs('agent-c1', 'conv-1')).toEqual(
      ['exec', '-u', 'appuser', 'agent-c1', 'sh', '-c', END_PROCESSES_SCRIPT, 'agenthix-end-processes', 'conv-1', '50'],
    )
    expect(END_PROCESSES_SCRIPT).not.toContain('conv-1')
    expect(endConversationProcessesArgs('c', 'conv-1')).not.toContain('root')
  })

  it('matches the whole environment entry literally, over every process, and freezes before it kills', () => {
    expect(END_PROCESSES_SCRIPT).toContain('grep -l -a -x -F "SITE_SESSION=$id" /proc/[0-9]*/environ')
    expect(END_PROCESSES_SCRIPT.indexOf('kill -STOP $pids')).toBeLessThan(END_PROCESSES_SCRIPT.indexOf('kill -KILL $pids'))
  })

  it('reads the answer', () => {
    expect(parseEndProcessesOutput('cleared 0\n')).toEqual({ kind: 'cleared', passes: 0 })
    expect(parseEndProcessesOutput('cleared 2\n')).toEqual({ kind: 'cleared', passes: 2 })
    expect(parseEndProcessesOutput('gave-up 12 13\n')).toEqual({ kind: 'gave-up', remaining: [12, 13] })
    expect(parseEndProcessesOutput('')).toEqual({ kind: 'failed', error: 'unexpected answer: ""' })
  })

  it('passes a deadline, and reports a failed or timed-out exec without throwing', async () => {
    h.dockerWithin.mockResolvedValueOnce({ stdout: 'cleared 1\n', stderr: '' })
    await expect(endConversationProcesses('c1', 'conv-1', { timeoutMs: 999 })).resolves.toEqual({ kind: 'cleared', passes: 1 })
    expect(h.dockerWithin).toHaveBeenLastCalledWith(expect.arrayContaining(['c1', 'conv-1']), 999)
    h.dockerWithin.mockRejectedValueOnce(new Error('docker exec timed out'))
    await expect(endConversationProcesses('c1', 'conv-1')).resolves.toEqual({ kind: 'failed', error: 'docker exec timed out' })
    await expect(endConversationProcesses('c1', 'bad id')).resolves.toEqual(expect.objectContaining({ kind: 'failed' }))
  })
})

/**
 * The loop itself, run here by /bin/sh with `grep` and `kill` replaced by
 * functions over a state file: each line is a pid "found" by the next pass.
 * `KILLED` maps a killed pid to what it forked before it died. No real
 * process is signalled.
 */
describe('the finder loop', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finder-')) })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  const stubs = `
grep() {
  case "$1" in
    -l) while read -r p; do [ -n "$p" ] && echo "/proc/$p/environ"; done < "$DIR/state" ;;
    *) command grep "$@" ;;
  esac
}
kill() {
  sig=$1; shift; echo "$sig $*" >> "$DIR/signals"
  [ "$sig" = -KILL ] || return 0
  : > "$DIR/next"
  for p in "$@"; do command grep -x "$p .*" "$DIR/forks" 2>/dev/null | cut -d' ' -f2- | tr ' ' '\\n' >> "$DIR/next"; done
  mv "$DIR/next" "$DIR/state"
}`

  function run(state: string[], forks: Record<string, string[]>, max: number): { out: string; signals: string[] } {
    fs.writeFileSync(path.join(dir, 'state'), state.join('\n') + '\n')
    fs.writeFileSync(path.join(dir, 'forks'), Object.entries(forks).map(([p, kids]) => `${p} ${kids.join(' ')}`).join('\n') + '\n')
    const out = execFileSync('/bin/sh', ['-c', `${stubs}\n${END_PROCESSES_SCRIPT}`, 'x', 'conv-1', String(max)], {
      encoding: 'utf8', env: { PATH: process.env.PATH, DIR: dir }, timeout: 10_000,
    })
    const signals = fs.existsSync(path.join(dir, 'signals')) ? fs.readFileSync(path.join(dir, 'signals'), 'utf8').trim().split('\n') : []
    return { out: out.trim(), signals }
  }

  it('reports cleared at once when nothing carries the tag', () => {
    expect(run([], {}, 5)).toEqual({ out: 'cleared 0', signals: [] })
  })

  it('freezes then kills, and passes again until a pass finds none', () => {
    const { out, signals } = run(['101', '102'], { 101: ['201'] }, 5)
    expect(out).toBe('cleared 2')
    expect(signals).toEqual(['-STOP 101 102', '-KILL 101 102', '-STOP 201', '-KILL 201'])
  })

  it('gives up after the pass limit, naming what is left', () => {
    const { out } = run(['1'], { 1: ['2'], 2: ['3'], 3: ['4'] }, 2)
    expect(out).toBe('gave-up 3')
  })
})

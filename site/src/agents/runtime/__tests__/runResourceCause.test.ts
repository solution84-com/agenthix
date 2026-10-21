import { describe, it, expect, vi } from 'vitest'
import { parseCounters, runResourceCause, type ContainerCounters } from '../runResourceCause'

const GIB = 1024 ** 3

/** A Docker that answers the counter read with `counters` and the inspect with `inspect`; null throws, as for a container gone. */
function fakeDocker(counters: string | null, inspect: string | null = 'false 4294967296 2048') {
  return vi.fn(async (args: string[]) => {
    const answer = args[0] === 'exec' ? counters : inspect
    if (answer === null) throw new Error('No such container')
    return { stdout: answer, stderr: '' }
  })
}

const v2 = (oom: number, max: number) =>
  `low 0\nhigh 0\nmax 0\noom 0\noom_kill ${oom}\noom_group_kill 0\n`.replace('max 0\n', '') + `max ${max}\n`

const at = (c: ContainerCounters) => Promise.resolve(c)
const plenty = async () => 100 * GIB

describe('reading the container counters', () => {
  it('reads cgroup v2 and v1 files alike', () => {
    expect(parseCounters('low 0\nhigh 0\noom 1\noom_kill 2\nmax 5\n')).toEqual({ oomKills: 2, pidsRefused: 5 })
    expect(parseCounters('oom_kill_disable 0\nunder_oom 0\noom_kill 1\nmax 0\n')).toEqual({ oomKills: 1, pidsRefused: 0 })
    expect(parseCounters('')).toBeNull()
  })
})

describe('why a run failed, when it was for lack of resources', () => {
  it('ran out of memory: a process was killed for memory during the run, with the limit it hit', async () => {
    const docker = fakeDocker(v2(1, 0))
    expect(await runResourceCause(
      { error: 'Claude Code process exited with code 137', containerName: 'c1', baseline: at({ oomKills: 0, pidsRefused: 0 }) },
      { docker, freeBytes: plenty },
    )).toEqual({ cause: 'memory', limit: 4 * GIB })
  })

  it('a kill for memory before this run started is not this run\'s', async () => {
    expect(await runResourceCause(
      { error: 'exited with code 1', containerName: 'c1', baseline: at({ oomKills: 3, pidsRefused: 0 }) },
      { docker: fakeDocker(v2(3, 0)), freeBytes: plenty },
    )).toBeNull()
  })

  it('a container that died for memory says so through Docker', async () => {
    expect(await runResourceCause(
      { error: 'process ended during the turn', containerName: 'c1', baseline: at({ oomKills: 0, pidsRefused: 0 }) },
      { docker: fakeDocker(null, 'true 8589934592 4096'), freeBytes: plenty },
    )).toEqual({ cause: 'memory', limit: 8 * GIB })
  })

  it('reached the process limit: a fork refused during the run, with the limit', async () => {
    expect(await runResourceCause(
      { error: 'exited with code 1', containerName: 'c1', baseline: at({ oomKills: 0, pidsRefused: 0 }) },
      { docker: fakeDocker(v2(0, 4)), freeBytes: plenty },
    )).toEqual({ cause: 'processes', limit: 2048 })
  })

  it('reached the process limit, as the error says it', async () => {
    expect(await runResourceCause(
      { error: 'Error: spawn EAGAIN', containerName: null, baseline: null },
      { docker: fakeDocker(null, null), freeBytes: plenty },
    )).toMatchObject({ cause: 'processes' })
  })

  it('the disk filled, from the error', async () => {
    expect(await runResourceCause(
      { error: "ENOSPC: no space left on device, write '/workspace/node_modules/x'", containerName: 'c1', baseline: null },
      { docker: fakeDocker(v2(0, 0)), freeBytes: plenty },
    )).toEqual({ cause: 'disk', limit: null })
  })

  it('the disk filled, from the site having no room left', async () => {
    expect(await runResourceCause(
      { error: 'exited with code 1', containerName: 'c1', baseline: at({ oomKills: 0, pidsRefused: 0 }) },
      { docker: fakeDocker(v2(0, 0)), freeBytes: async () => 10 * 1024 ** 2 },
    )).toEqual({ cause: 'disk', limit: null })
  })

  it('any other failure is not put down to resources', async () => {
    expect(await runResourceCause(
      { error: '529 overloaded', containerName: 'c1', baseline: at({ oomKills: 0, pidsRefused: 0 }) },
      { docker: fakeDocker(v2(0, 0)), freeBytes: plenty },
    )).toBeNull()
  })

  it('a baseline that could not be read puts nothing down to memory', async () => {
    expect(await runResourceCause(
      { error: 'exited with code 137', containerName: 'c1', baseline: Promise.resolve(null) },
      { docker: fakeDocker(v2(2, 0)), freeBytes: plenty },
    )).toBeNull()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))
vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn() },
}))

import { startPreviewProcess, stopPreviewProcess, type DockerFn } from '../previewProcess'

const RUNNING = { stdout: 'true\n', stderr: '' }
const NOT_RUNNING = { stdout: 'false\n', stderr: '' }
const RW = 'agenthix-dev-agent-project-p1-user-u1-rw'

const INPUT = {
  previewId: 'pv1',
  command: 'npm run dev',
  port: 5173,
  cwd: '/projects/p1/files',
  location: { ownerType: 'project' as const, ownerId: 'p1' },
  runner: { kind: 'person' as const, userId: 'u1' },
}

describe('a preview process', () => {
  let docker: ReturnType<typeof vi.fn> & DockerFn
  beforeEach(() => { docker = vi.fn() as any })

  const verbs = () => docker.mock.calls.map(c => (c[0] as string[])[0])
  const call = (verb: string) => docker.mock.calls.map(c => c[0] as string[]).find(a => a[0] === verb)

  it("runs inside the boundary's already-running container and never creates one", async () => {
    docker.mockImplementation(async (args: string[]) => {
      if (args[0] === 'inspect') return args.includes(RW) ? RUNNING : NOT_RUNNING
      return { stdout: '', stderr: '' }
    })

    const result = await startPreviewProcess(INPUT, { docker, probe: async () => true })

    expect(result.container).toBe(RW)
    expect(verbs()).not.toContain('run')
    expect(verbs()).not.toContain('create')
    expect(verbs()).toContain('exec')
  })

  it('falls back to the read-only container when that is the one up', async () => {
    docker.mockImplementation(async (args: string[]) => {
      if (args[0] === 'inspect') return args.includes(RW) ? NOT_RUNNING : RUNNING
      return { stdout: '', stderr: '' }
    })

    const result = await startPreviewProcess(INPUT, { docker, probe: async () => true })

    expect(result.container).toBe('agenthix-dev-agent-project-p1-user-u1-ro')
  })

  it("never falls back to another runner's container in the same project", async () => {
    // Bob's and the project's own containers are up; the session's runner (u1)
    // has none. A preview there would run with another person's harness home.
    docker.mockImplementation(async (args: string[]) => {
      if (args[0] === 'inspect') return args.some(a => a.includes('-user-u1-')) ? NOT_RUNNING : RUNNING
      return { stdout: '', stderr: '' }
    })

    await expect(startPreviewProcess(INPUT, { docker, probe: async () => true }))
      .rejects.toThrow(/no running container/i)
    const inspected = docker.mock.calls.map(c => c[0] as string[]).filter(a => a[0] === 'inspect').map(a => a[a.length - 1])
    expect(inspected).toEqual(['agenthix-dev-agent-project-p1-user-u1-rw', 'agenthix-dev-agent-project-p1-user-u1-ro'])
    expect(verbs()).not.toContain('exec')
  })

  it('refuses with a reason when the boundary has no running container', async () => {
    docker.mockResolvedValue(NOT_RUNNING)

    await expect(startPreviewProcess(INPUT, { docker, probe: async () => true }))
      .rejects.toThrow(/no running container/i)
    expect(verbs()).not.toContain('run')
  })

  it("execs the command detached, from the run's own working directory", async () => {
    docker.mockImplementation(async (args: string[]) => (args[0] === 'inspect' ? RUNNING : { stdout: '', stderr: '' }))

    await startPreviewProcess(
      { ...INPUT, cwd: '/projects/acme/workspaces/site' },
      { docker, probe: async () => true },
    )

    const exec = call('exec')!
    expect(exec).toContain('-d')
    expect(exec).toContain('-w')
    expect(exec[exec.indexOf('-w') + 1]).toBe('/projects/acme/workspaces/site')
  })

  it("surfaces the command's own output when the port never opens", async () => {
    docker.mockImplementation(async (args: string[]) => {
      if (args[0] === 'inspect') return RUNNING
      if (args[0] === 'exec' && args.includes('cat')) return { stdout: 'Error: missing dependency\n', stderr: '' }
      return { stdout: '', stderr: '' }
    })

    await expect(startPreviewProcess(INPUT, {
      docker, probe: async () => false, readyTries: 2, readyIntervalMs: 1,
    })).rejects.toThrow(/missing dependency/)
  })

  it('stops the process it started when the port never opens', async () => {
    docker.mockImplementation(async (args: string[]) => (args[0] === 'inspect' ? RUNNING : { stdout: '', stderr: '' }))

    await expect(startPreviewProcess(INPUT, {
      docker, probe: async () => false, readyTries: 1, readyIntervalMs: 1,
    })).rejects.toThrow()

    const killed = docker.mock.calls.map(c => c[0] as string[])
      .some(a => a[0] === 'exec' && a.some(part => part.includes('pkill')))
    expect(killed).toBe(true)
  })

  it('kills only its own session on stop, and never the container', async () => {
    docker.mockResolvedValue({ stdout: '', stderr: '' })

    await stopPreviewProcess({ container: 'c1', previewId: 'pv1' }, { docker })

    expect(verbs()).toContain('exec')
    expect(verbs()).not.toContain('rm')
    expect(verbs()).not.toContain('stop')
    expect(verbs()).not.toContain('kill')
  })

  it('kills by the session the launch recorded, never by a pattern over the command line', async () => {
    docker.mockResolvedValue({ stdout: '', stderr: '' })

    await stopPreviewProcess({ container: 'c1', previewId: 'pv1' }, { docker })

    const script = (call('exec') as string[]).at(-1)!
    // busybox `sh -lc` execs a single simple command away, so nothing the
    // launch wrote into the command line survives into the dev server's argv —
    // and `pkill -f <marker>` run from a shell whose OWN argv holds the marker
    // matches itself. The session id is the only handle that survives both.
    expect(script).toContain('pkill -s')
    expect(script).not.toContain('pkill -f')
  })

  it('launches under setsid, which is what makes the session id a session id', async () => {
    docker.mockImplementation(async (args: string[]) => (args[0] === 'inspect' ? RUNNING : { stdout: '', stderr: '' }))

    await startPreviewProcess(INPUT, { docker, probe: async () => true })

    const exec = call('exec')!
    // Without setsid the recorded `$$` is an ordinary pid, `pkill -s` matches
    // nothing, and no preview can ever be stopped — a total loss of the
    // feature that no other assertion here would notice.
    expect(exec).toContain('setsid')
    expect(exec[exec.indexOf('setsid') + 1]).toBe('sh')
  })

  it('kills the session the launch wrote, at the path the launch wrote it to', async () => {
    docker.mockImplementation(async (args: string[]) => (args[0] === 'inspect' ? RUNNING : { stdout: '', stderr: '' }))
    await startPreviewProcess(INPUT, { docker, probe: async () => true })
    const launch = (call('exec') as string[]).at(-1)!

    docker.mockClear()
    docker.mockResolvedValue({ stdout: '', stderr: '' })
    await stopPreviewProcess({ container: RW, previewId: INPUT.previewId }, { docker })
    const stop = (call('exec') as string[]).at(-1)!

    // Tied to each other, not to a literal: a path edited on one side and not
    // the other leaves a preview nothing can kill, and two tests against the
    // same literal would both still pass.
    const written = /> (\S+\.sid)/.exec(launch)?.[1]
    const read = /cat (\S+\.sid)/.exec(stop)?.[1]
    expect(written).toBeDefined()
    expect(read).toBe(written)
  })

  it('leaves the session file alone when it found none, so it cannot race a launch', async () => {
    docker.mockResolvedValue({ stdout: '', stderr: '' })
    await stopPreviewProcess({ container: 'c1', previewId: 'pv1' }, { docker })

    const script = (call('exec') as string[]).at(-1)!
    // The `rm -f` belongs INSIDE the arm that found a session id. Outside it,
    // a stop arriving a moment before the launch writes the file deletes the
    // only handle by which that process could ever be killed.
    //
    // Asserted as containment in that arm and absence after `esac`, not as a
    // position: `rm -f` on its own line below `esac` comes after `pkill -s`
    // too, so an ordering check passes for exactly the arrangement this test
    // exists to forbid.
    const [beforeEsac, afterEsac] = script.split('esac')
    const arm = beforeEsac.split('\n').find(line => line.trim().startsWith('*)'))
    expect(arm).toBeDefined()
    expect(arm).toContain('pkill -s')
    expect(arm).toContain('rm -f')
    expect(afterEsac).not.toContain('rm -f')
    expect(afterEsac).not.toContain('pkill')
  })

  it('tells the caller which container it resolved before it starts anything in it', async () => {
    docker.mockImplementation(async (args: string[]) => (args[0] === 'inspect' ? RUNNING : { stdout: '', stderr: '' }))
    const seen: { container: string; execsSoFar: number }[] = []

    await startPreviewProcess(INPUT, {
      docker,
      probe: async () => true,
      onContainerResolved: (container) => {
        seen.push({ container, execsSoFar: verbs().filter(v => v === 'exec').length })
      },
    })

    // Before the first exec — the caller has to be able to hold the container
    // for the whole of the readiness wait, not from the end of it.
    expect(seen).toEqual([{ container: RW, execsSoFar: 0 }])
  })

  it('tells the caller nothing when there was no container to resolve', async () => {
    docker.mockResolvedValue(NOT_RUNNING)
    const onContainerResolved = vi.fn()

    await expect(startPreviewProcess(INPUT, { docker, probe: async () => true, onContainerResolved }))
      .rejects.toThrow(/no running container/i)
    expect(onContainerResolved).not.toHaveBeenCalled()
  })

  it('is quiet when the container has already gone', async () => {
    docker.mockRejectedValue(new Error('No such container: c1'))
    await expect(stopPreviewProcess({ container: 'c1', previewId: 'pv1' }, { docker })).resolves.toBeUndefined()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
const { execFile } = await import('node:child_process')
const mockExecFile = vi.mocked(execFile)
const {
  agentNetworkName, allocateSubnet, ensureAgentNetwork, releaseAgentNetwork, sweepAgentNetworks,
} = await import('../containerNetwork')

type Reply = { err?: Error; stdout?: string }
function mockDocker(handler: (args: string[]) => Reply) {
  mockExecFile.mockImplementation(((_cmd: string, args: string[], cb: any) => {
    const r = handler(args)
    cb(r.err ?? null, r.stdout ?? '', r.err ? String(r.err.message) : '')
  }) as any)
}
const calls = () => mockExecFile.mock.calls.map(c => (c[1] as string[]).join(' '))

beforeEach(() => {
  mockExecFile.mockReset()
  delete process.env.SITE_CONTAINER_NAME
  delete process.env.AGENT_NETWORK_RANGE
  process.env.HOST_NAMESPACE = 'agenthix-test'
})

describe('agentNetworkName', () => {
  it('derives the network from the container name', () => {
    expect(agentNetworkName('agenthix-agent-project-p1-rw')).toBe('agenthix-agent-project-p1-rw-net')
  })
})

describe('allocateSubnet', () => {
  it('takes the first /29 of the range when nothing is used', () => {
    expect(allocateSubnet(new Set(), '10.213.0.0/16')).toBe('10.213.0.0/29')
  })
  it('skips blocks already in use', () => {
    expect(allocateSubnet(new Set(['10.213.0.0/29', '10.213.0.8/29']), '10.213.0.0/16')).toBe('10.213.0.16/29')
  })
  it('refuses a range too small to hold a /29', () => {
    expect(() => allocateSubnet(new Set(), '10.213.0.0/30')).toThrow(/AGENT_NETWORK_RANGE/)
  })
  it('refuses a malformed range', () => {
    expect(() => allocateSubnet(new Set(), 'not-a-range')).toThrow(/AGENT_NETWORK_RANGE/)
  })
  it('says so when the range is full', () => {
    expect(() => allocateSubnet(new Set(['10.0.0.0/29']), '10.0.0.0/29')).toThrow(/no free/)
  })
  it('defaults to 10.213.0.0/16', () => {
    expect(allocateSubnet(new Set())).toBe('10.213.0.0/29')
  })
})

describe('ensureAgentNetwork', () => {
  it('creates a labelled network with an allocated subnet when none exists', async () => {
    mockDocker(args => {
      if (args[0] === 'network' && args[1] === 'inspect' && args[2] === 'c1-net') return { err: new Error('No such network') }
      if (args[0] === 'network' && args[1] === 'ls') return { stdout: 'abc\n' }
      if (args[0] === 'network' && args[1] === 'inspect') return { stdout: '10.213.0.0/29 \n' }
      return {}
    })
    await expect(ensureAgentNetwork('c1')).resolves.toBe('c1-net')
    const create = calls().find(c => c.startsWith('network create'))!
    expect(create).toContain('--subnet 10.213.0.8/29')
    expect(create).toContain('--label agenthix-test.network=agent')
    // IPv4 only, whatever the daemon's default-network-opts say: the agent protections match IPv4 sources.
    expect(create).toContain('--ipv6=false')
    expect(create).toContain('--label com.docker.compose.project=agenthix-test-agents')
    expect(create.endsWith(' c1-net')).toBe(true)
    releaseAgentNetwork('c1')
  })

  it('reuses an existing network without creating one', async () => {
    mockDocker(() => ({}))
    await ensureAgentNetwork('c2')
    expect(calls().some(c => c.startsWith('network create'))).toBe(false)
    releaseAgentNetwork('c2')
  })

  it('tries the next block when docker reports an overlapping pool', async () => {
    let creates = 0
    mockDocker(args => {
      if (args[1] === 'inspect' && args[2] === 'c3-net') return { err: new Error('No such network') }
      if (args[1] === 'ls') return { stdout: '' }
      if (args[1] === 'create') {
        creates++
        return creates === 1 ? { err: new Error('Pool overlaps with other one on this address space') } : {}
      }
      return {}
    })
    await ensureAgentNetwork('c3')
    const subnets = calls().filter(c => c.startsWith('network create')).map(c => /--subnet (\S+)/.exec(c)![1])
    expect(subnets).toEqual(['10.213.0.0/29', '10.213.0.8/29'])
    releaseAgentNetwork('c3')
  })

  it('connects the site container when the site runs in one, never as its way out, which stays its own network\'s', async () => {
    process.env.SITE_CONTAINER_NAME = 'agenthix-site'
    mockDocker(() => ({}))
    await ensureAgentNetwork('c4')
    // The agent network's gateway as the site's default route would send the site's own traffic out from an agent
    // address, where the agents' protections drop it.
    expect(calls()).toContain('network connect --gw-priority -1 c4-net agenthix-site')
    releaseAgentNetwork('c4')
  })

  it('connects without a gateway priority on an engine that has none', async () => {
    process.env.SITE_CONTAINER_NAME = 'agenthix-site'
    mockDocker(args => args.includes('--gw-priority')
      ? { err: new Error('"gw-priority" requires API version 1.48, but the Docker daemon API version is 1.45') }
      : {})
    await expect(ensureAgentNetwork('c6')).resolves.toBe('c6-net')
    expect(calls()).toContain('network connect c6-net agenthix-site')
    releaseAgentNetwork('c6')
  })

  it('treats an already-connected site as success', async () => {
    process.env.SITE_CONTAINER_NAME = 'agenthix-site'
    mockDocker(args => args[1] === 'connect'
      ? { err: new Error('endpoint with name agenthix-site already exists in network c5-net') }
      : {})
    await expect(ensureAgentNetwork('c5')).resolves.toBe('c5-net')
    releaseAgentNetwork('c5')
  })

  it('clears its own pending mark on failure, so a leftover network is still swept', async () => {
    // A real connect failure (not "already exists") — ensure() must reject,
    // but without leaving the container name stuck in `pending` forever: a
    // caller who throws before reaching `_start`'s try/finally never calls
    // releaseAgentNetwork itself, so ensure() has to clean up after itself.
    process.env.SITE_CONTAINER_NAME = 'agenthix-site'
    mockDocker(args => args[1] === 'connect'
      ? { err: new Error('network not found') }
      : {})
    await expect(ensureAgentNetwork('c7')).rejects.toThrow(/network not found/)

    // No releaseAgentNetwork('c7') here — that call is exactly what a caller
    // whose ensureAgentNetwork rejected never reaches. If the pending mark
    // survived the failure, this sweep would find 'c7-net' pending and skip it.
    mockDocker(args => {
      if (args[1] === 'ls') return { stdout: 'c7-net\n' }
      if (args[0] === 'container') return { err: new Error('No such container') }
      return {}
    })
    await expect(sweepAgentNetworks()).resolves.toBe(1)
    expect(calls()).toContain('network rm c7-net')
  })
})

describe('sweepAgentNetworks', () => {
  it('removes a network whose container is gone and keeps one whose container exists', async () => {
    mockDocker(args => {
      if (args[1] === 'ls') return { stdout: 'gone-net\nlive-net\n' }
      if (args[0] === 'container' && args[2] === 'gone') return { err: new Error('No such container') }
      return {}
    })
    await expect(sweepAgentNetworks()).resolves.toBe(1)
    expect(calls()).toContain('network rm gone-net')
    expect(calls()).not.toContain('network rm live-net')
  })

  it('gives up on a docker that never answers, and does not hold the queue for the next sweep', async () => {
    vi.useFakeTimers()
    try {
      mockExecFile.mockImplementation((() => { /* never calls back: a wedged daemon */ }) as any)
      const hung = expect(sweepAgentNetworks()).rejects.toThrow(/did not finish/)
      await vi.advanceTimersByTimeAsync(120_000)
      await hung

      mockDocker(args => (args[1] === 'ls' ? { stdout: '' } : {}))
      await expect(sweepAgentNetworks()).resolves.toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('lists only this install\'s agent networks', async () => {
    mockDocker(args => (args[1] === 'ls' ? { stdout: '' } : {}))
    await sweepAgentNetworks()
    const ls = calls().find(c => c.startsWith('network ls'))!
    expect(ls).toContain('--filter label=agenthix-test.network=agent')
    expect(ls).toContain('--filter label=com.docker.compose.project=agenthix-test-agents')
  })

  it('leaves a pending network alone even with no container yet', async () => {
    mockDocker(args => {
      if (args[1] === 'ls') return { stdout: 'c6-net\n' }
      if (args[0] === 'container') return { err: new Error('No such container') }
      return {}
    })
    await ensureAgentNetwork('c6')
    await expect(sweepAgentNetworks()).resolves.toBe(0)
    releaseAgentNetwork('c6')
    await expect(sweepAgentNetworks()).resolves.toBe(1)
  })

  it('disconnects the site from a swept network before removing it, when the site runs in a container', async () => {
    process.env.SITE_CONTAINER_NAME = 'agenthix-site'
    mockDocker(args => {
      if (args[1] === 'ls') return { stdout: 'gone-net\n' }
      if (args[0] === 'container') return { err: new Error('No such container') }
      return {}
    })
    await expect(sweepAgentNetworks()).resolves.toBe(1)
    const c = calls()
    const disconnect = c.indexOf('network disconnect --force gone-net agenthix-site')
    expect(disconnect).toBeGreaterThanOrEqual(0)
    expect(c.indexOf('network rm gone-net')).toBeGreaterThan(disconnect)
  })

  it('warns rather than failing silently when a swept network cannot be removed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mockDocker(args => {
        if (args[1] === 'ls') return { stdout: 'stuck-net\n' }
        if (args[0] === 'container') return { err: new Error('No such container') }
        if (args[1] === 'rm') return { err: new Error('network has active endpoints') }
        return {}
      })
      await expect(sweepAgentNetworks()).resolves.toBe(0)
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/could not remove stuck-net/))
    } finally {
      warn.mockRestore()
    }
  })

  it('never takes a network from an ensure still in flight when the sweep was queued behind it', async () => {
    process.env.SITE_CONTAINER_NAME = 'agenthix-site'
    let releaseConnect!: () => void
    const connectHeld = new Promise<void>(r => { releaseConnect = r })
    mockExecFile.mockImplementation(((_cmd: string, args: string[], cb: any) => {
      const line = args.join(' ')
      const answer = (err: Error | null, stdout = '') => cb(err, stdout, err ? err.message : '')
      if (line === 'network connect --gw-priority -1 c8-net agenthix-site') { connectHeld.then(() => answer(null)); return }
      if (args[1] === 'ls') return answer(null, 'c8-net\n')
      if (args[0] === 'container') return answer(new Error('No such container'))
      answer(null)
    }) as any)

    const ensuring = ensureAgentNetwork('c8')
    const sweeping = sweepAgentNetworks()
    await new Promise(r => setTimeout(r, 0))
    expect(calls().some(c => c.startsWith('network ls'))).toBe(false)
    releaseConnect()
    await expect(ensuring).resolves.toBe('c8-net')
    await expect(sweeping).resolves.toBe(0)
    expect(calls()).not.toContain('network disconnect --force c8-net agenthix-site')
    expect(calls()).not.toContain('network rm c8-net')
    releaseAgentNetwork('c8')
  })

  it('holds an ensure that arrives mid-sweep until the sweep is done, so the sweep cannot undo its connect', async () => {
    process.env.SITE_CONTAINER_NAME = 'agenthix-site'
    let releaseInspect!: () => void
    const inspectHeld = new Promise<void>(r => { releaseInspect = r })
    let networkExists = true
    mockExecFile.mockImplementation(((_cmd: string, args: string[], cb: any) => {
      const answer = (err: Error | null, stdout = '') => cb(err, stdout, err ? err.message : '')
      if (args[0] === 'container') { inspectHeld.then(() => answer(new Error('No such container'))); return }
      if (args[1] === 'ls') return answer(null, args.includes('--filter') ? 'c9-net\n' : '')
      if (args[1] === 'rm') { networkExists = false; return answer(null) }
      if (args[1] === 'inspect' && args[2] === 'c9-net') return answer(networkExists ? null : new Error('No such network'))
      if (args[1] === 'create') { networkExists = true; return answer(null) }
      answer(null)
    }) as any)

    const sweeping = sweepAgentNetworks()
    await new Promise(r => setTimeout(r, 0))
    const ensuring = ensureAgentNetwork('c9')
    await new Promise(r => setTimeout(r, 0))
    expect(calls().some(c => c.startsWith('network connect'))).toBe(false)
    releaseInspect()
    await expect(sweeping).resolves.toBe(1)
    await expect(ensuring).resolves.toBe('c9-net')
    const c = calls()
    expect(c.indexOf('network connect --gw-priority -1 c9-net agenthix-site')).toBeGreaterThan(c.indexOf('network rm c9-net'))
    expect(c.some(x => x.startsWith('network create'))).toBe(true)
    releaseAgentNetwork('c9')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// The default docker call is the deadline-bearing one; the tests below that
// inject their own `docker` never touch it.
const lifecycle = vi.hoisted(() => ({ docker: vi.fn(), dockerWithin: vi.fn() }))
vi.mock('../../../agents/runtime/containerLifecycle', () => lifecycle)

import { runtimeCheck } from '../runtimeCheck'

const docker = vi.fn()

describe('runtimeCheck', () => {
  // A block body, deliberately: `mockReset()` returns the mock itself (for
  // chaining), and a mock is a function — a `beforeEach` that RETURNS one is
  // read by vitest as a teardown callback, and calling it with no arguments
  // after the test is exactly the extra, argument-less `docker()` call that
  // broke this suite the first time it was written.
  beforeEach(() => { docker.mockReset() })

  it('reports the runtime available and the image present when docker answers', async () => {
    docker.mockImplementation(async (args: string[]) =>
      args[0] === 'version' ? { stdout: '28.1.1\n', stderr: '' } : { stdout: 'agenthix-agent:latest\n', stderr: '' })
    const result = await runtimeCheck({ docker, siteRoot: '/srv/site', image: 'agenthix-agent' })
    expect(result.containerRuntime).toBe('available')
    expect(result.imagePresent).toBe(true)
    expect(result).not.toHaveProperty('credentialsPath')
    expect(result.agentImage).toBe('agenthix-agent')
  })

  it('looks the image up with inspect, which also finds a digest-pinned name', async () => {
    docker.mockImplementation(async (args: string[]) => {
      if (args[0] === 'version') return { stdout: '28.1.1\n', stderr: '' }
      if (args[0] === 'image' && args[1] === 'inspect') return { stdout: 'sha256:abc\n', stderr: '' }
      return { stdout: '', stderr: '' }
    })
    const result = await runtimeCheck({ docker, image: 'agenthix-agent@sha256:451f' })
    expect(result.imagePresent).toBe(true)
  })

  it('reports unavailable with the reason rather than throwing when docker is absent', async () => {
    docker.mockRejectedValue(new Error('spawn docker ENOENT'))
    const result = await runtimeCheck({ docker, siteRoot: '/srv/site', image: 'agenthix-agent' })
    expect(result.containerRuntime).toBe('unavailable')
    expect(result.detail).toContain('ENOENT')
    expect(result.imagePresent).toBe(false)
    expect(result).not.toHaveProperty('credentialsPath')
  })

  it('separates "docker works" from "the image is here"', async () => {
    docker.mockImplementation(async (args: string[]) =>
      args[0] === 'version' ? { stdout: '28.1.1\n', stderr: '' } : { stdout: '', stderr: '' })
    const result = await runtimeCheck({ docker, siteRoot: '/srv/site', image: 'agenthix-agent' })
    expect(result.containerRuntime).toBe('available')
    expect(result.imagePresent).toBe(false)
  })

  it('falls back to the default image when none is given', async () => {
    delete process.env.AGENT_IMAGE
    docker.mockImplementation(async (args: string[]) =>
      args[0] === 'version' ? { stdout: '28.1.1\n', stderr: '' } : { stdout: '', stderr: '' })
    const result = await runtimeCheck({ docker })
    expect(result.agentImage).toBe('agenthix-agent')
  })

  it('runs its own docker calls under a deadline, so a wedged daemon cannot hold the boot', async () => {
    lifecycle.dockerWithin.mockReset()
    lifecycle.dockerWithin.mockImplementation(async (args: string[]) =>
      args[0] === 'version' ? { stdout: '28.1.1\n', stderr: '' } : { stdout: 'id\n', stderr: '' })
    await runtimeCheck({ siteRoot: '/srv/site', image: 'agenthix-agent' })
    expect(lifecycle.dockerWithin).toHaveBeenCalledTimes(2)
    for (const call of lifecycle.dockerWithin.mock.calls) expect(call[1]).toEqual(expect.any(Number))
    expect(lifecycle.docker).not.toHaveBeenCalled()
  })

  it('reports unavailable when the daemon does not answer within the deadline', async () => {
    lifecycle.dockerWithin.mockReset()
    lifecycle.dockerWithin.mockRejectedValue(new Error('docker version did not finish within 10s'))
    const result = await runtimeCheck({ siteRoot: '/srv/site', image: 'agenthix-agent' })
    expect(result.containerRuntime).toBe('unavailable')
    expect(result.detail).toContain('did not finish')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { buildDockerSpawnFn } from '../DockerSpawner'
const { spawn } = await import('node:child_process')
const mockSpawn = vi.mocked(spawn)

const CONTAINER = 'agenthix-agent-coder'
const fakePath = '/usr/local/bin:/usr/bin'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PATH = fakePath
  mockSpawn.mockReturnValue({
    stdin: {},
    stdout: {},
    killed: false,
    exitCode: null,
    kill: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
  } as any)
})

describe('buildDockerSpawnFn @SC-118', () => {
  it('returns a function', () => {
    const fn = buildDockerSpawnFn(CONTAINER)
    expect(typeof fn).toBe('function')
  })

  it('spawns docker exec -i <container> <command> <args>', () => {
    const spawnFn = buildDockerSpawnFn(CONTAINER)
    const signal = new AbortController().signal

    spawnFn({
      command: 'claude',
      args: ['--print', '--model', 'claude-sonnet-4-6'],
      cwd: '/kernel/agents/coder',
      env: { DATABASE_URL: 'postgres://...', ANTHROPIC_API_KEY: 'sk-secret' },
      signal,
    })

    expect(mockSpawn).toHaveBeenCalledWith(
      'docker',
      ['exec', '-i', '-w', '/kernel/agents/coder', CONTAINER, 'claude', '--print', '--model', 'claude-sonnet-4-6'],
      expect.objectContaining({
        env: { PATH: fakePath },  // app env is discarded; only PATH for docker CLI
        signal,
      })
    )
  })

  it('does not pass app env vars into the container', () => {
    const spawnFn = buildDockerSpawnFn(CONTAINER)
    spawnFn({
      command: 'claude',
      args: [],
      cwd: '/kernel/agents/coder',
      env: { DATABASE_URL: 'postgres://secret', SECRET_KEY: 'abc123' },
      signal: new AbortController().signal,
    })

    const [, , spawnOpts] = mockSpawn.mock.calls[0]
    expect((spawnOpts as any).env).not.toHaveProperty('DATABASE_URL')
    expect((spawnOpts as any).env).not.toHaveProperty('SECRET_KEY')
  })

  // The extra variables include the run's bearer token, and an argv element is
  // readable by every user on the host: the command line names the variables
  // and the docker client's environment carries the values.
  it('names extra variables on the command line and hands their values over in the client environment', () => {
    const spawnFn = buildDockerSpawnFn(CONTAINER, { SITE_MCP_KEY: 'run-token-value', AGENT_HANDLE: 'coder' })
    spawnFn({ command: 'claude', args: ['--print'], cwd: '/w', env: {}, signal: new AbortController().signal })

    const [, argv, spawnOpts] = mockSpawn.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }]
    expect(argv.some(a => a.includes('run-token-value'))).toBe(false)
    expect(argv).toEqual(['exec', '-i', '-w', '/w', '-e', 'SITE_MCP_KEY', '-e', 'AGENT_HANDLE', CONTAINER, 'claude', '--print'])
    expect(spawnOpts.env).toEqual({ PATH: fakePath, SITE_MCP_KEY: 'run-token-value', AGENT_HANDLE: 'coder' })
  })

  it('returns the spawned process', () => {
    const spawnFn = buildDockerSpawnFn(CONTAINER)
    const result = spawnFn({
      command: 'claude',
      args: [],
      cwd: '/kernel/agents/coder',
      env: {},
      signal: new AbortController().signal,
    })
    expect(result).toBeDefined()
    expect(result.stdin).toBeDefined()
    expect(result.stdout).toBeDefined()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))
vi.mock('../../../server/hq/hqConnection', () => ({ hqConnectionManager: { sendEvent: vi.fn() } }))

import { buildContainerRunCommand } from '../containerRunArgs'
import type { AgentMounts, ContainerContext, ContainerKey } from '../containerTypes'

const SITE_ROOT = '/site'
const KEY: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-alpha', mode: 'rw', runner: { kind: 'project', projectId: 'proj-alpha' } }
const CTX: ContainerContext = { handle: 'coder', runtime: 'opencode', sessionId: 'sess-1', credential: null }
const MOUNTS: AgentMounts = {
  boundary: { hostDir: `${SITE_ROOT}/projects/proj-alpha`, containerDir: '/projects/proj-alpha' },
  folders: [],
  locationMode: 'rw',
}
const HOME = `${SITE_ROOT}/homes/projects/proj-alpha`
const CONFIG = `${SITE_ROOT}/harness/opencode-config`

beforeEach(() => {
  process.env.SITE_ROOT = SITE_ROOT
  process.env.HOST_NAMESPACE = 'agenthix'
  delete process.env.AGENT_CONTAINER_MEMORY
  delete process.env.AGENT_CONTAINER_PIDS_LIMIT
  delete process.env.AGENT_CONTAINER_CPUS
  delete process.env.AGENT_IMAGE
})

describe('the agent image a container starts from', () => {
  const imageOf = () => {
    const { args } = buildContainerRunCommand(KEY, CTX, 'c', MOUNTS, 'net-1')
    return args[args.indexOf('--init') + 1]
  }

  it('is the one the host service passes in AGENT_IMAGE, pinned and checked, never another of the same name', () => {
    process.env.AGENT_IMAGE = 'ghcr.io/example/agent@sha256:' + 'a'.repeat(64)
    expect(imageOf()).toBe('ghcr.io/example/agent@sha256:' + 'a'.repeat(64))
  })

  it('is the local build only when AGENT_IMAGE is not set', () => {
    expect(imageOf()).toBe('agenthix-agent')
    process.env.AGENT_IMAGE = '  '
    expect(imageOf()).toBe('agenthix-agent')
  })

  it('is the same image the runtime check and the sandbox check look at', async () => {
    const { agentImageName } = await import('../agentImage')
    process.env.AGENT_IMAGE = 'registry.example/agent:0.2.0'
    expect(imageOf()).toBe(agentImageName())
  })
})

describe('buildContainerRunCommand', () => {
  it('starts under docker init, with OpenCode’s configuration folders read-only, and nothing else added', () => {
    const { args, clientEnv } = buildContainerRunCommand(KEY, CTX, 'agenthix-agent-project-proj-alpha-project-rw', MOUNTS, 'net-1')
    expect(clientEnv).toBeUndefined()
    expect(args).toEqual([
      'run', '-d',
      '--name', 'agenthix-agent-project-proj-alpha-project-rw',
      '--network', 'net-1',
      '--add-host', 'host.docker.internal:host-gateway',
      '--label', 'com.docker.compose.project=agenthix-agents',
      '--label', 'com.docker.compose.service=agent',
      '--label', 'agenthix.owner=project:proj-alpha',
      '--label', 'agenthix.runner=project:proj-alpha',
      '--label', 'agenthix.session=sess-1',
      '--label', 'agenthix.agent=coder',
      '-v', `${HOME}:/home/appuser`,
      '-v', `${HOME}/.claude/.tmp:/home/appuser/.claude/.tmp:ro`,
      '-v', `${CONFIG}:/home/appuser/.config/opencode:ro`,
      '-v', `${CONFIG}:/home/appuser/.opencode:ro`,
      '-v', `${SITE_ROOT}/projects/proj-alpha:/projects/proj-alpha:rw`,
      '--memory', expect.any(String),
      '--pids-limit', expect.any(String),
      '--cpus', expect.any(String),
      '--restart', 'no',
      '--init',
      'agenthix-agent',
      'tail', '-f', '/dev/null',
    ])
  })

  it('puts no API key in the container’s environment', () => {
    const { args, clientEnv } = buildContainerRunCommand(KEY, { ...CTX, runtime: 'claude-sdk', credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-secret' } }, 'c', MOUNTS, 'net-1')
    expect(clientEnv).toBeUndefined()
    expect(args.join(' ')).not.toContain('ANTHROPIC_API_KEY')
    expect(args.join(' ')).not.toContain('sk-secret')
  })
})

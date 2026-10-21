/**
 * Upgrades against the real registry and the built image (`npm run test:container`, which needs the network). Build
 * the image first, at the repository root: `docker build -f host/docker/Dockerfile -t agenthix-host .` (or name
 * another with HOST_IMAGE). It starts the image with a temporary state folder and no Docker socket, so it upgrades
 * nothing: it checks the registry is read without credentials, and that the image says what it would do. Its
 * container carries a namespace of its own for the run, recorded in the state folder, and every docker command goes
 * through the guard (`containerGuard.ts`), so it touches nothing of a real install beside it.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claimNames, guardedDocker, recordNamespace, testNamespace } from '../../__tests__/containerGuard'
import { registryTags } from '../versions'

const IMAGE = process.env.HOST_IMAGE || 'agenthix-host'
const NS = testNamespace('upgrades')
const NAME = claimNames(NS).hostContainer
let state: string

const docker = guardedDocker(NS)
function cli(...args: string[]): { out: string; err: string; code: number } {
  try {
    return { out: docker('exec', NAME, 'agenthix', ...args), err: '', code: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return { out: String(e.stdout ?? ''), err: String(e.stderr ?? ''), code: e.status ?? 1 }
  }
}

beforeAll(async () => {
  state = fs.mkdtempSync(path.join(os.tmpdir(), 'host-state-'))
  recordNamespace(state, NS)
  docker('run', '-d', '--name', NAME, '-v', `${state}:/state`, IMAGE)
  for (let i = 0; i < 50; i++) {
    if (cli('status').code === 0) break
    await new Promise(r => setTimeout(r, 200))
  }
})

afterAll(() => {
  docker.quiet('exec', NAME, 'sh', '-c', 'rm -rf /state/* /state/.[!.]*')
  docker.quiet('rm', '-f', NAME)
  fs.rmSync(state, { recursive: true, force: true })
})

describe('the published versions @SC-836', () => {
  it('are read from the registry without credentials, or the reason is given', async () => {
    // While the repository's images are private, the registry refuses an anonymous reader: that is the fail-closed case.
    const read = await registryTags('solution84-com/agenthix-host').then(tags => ({ tags }), (err: Error) => ({ problem: err.message }))
    if ('tags' in read) expect(read.tags.every(t => typeof t === 'string')).toBe(true)
    else expect(read.problem).toMatch(/registry|HTTP|fetch/i)
  })
})

describe('the image', () => {
  it('shows automatic fixes on by default, and their window @SC-837', () => {
    const r = cli('upgrades')
    expect(r.code).toBe(0)
    expect(r.out).toContain('Automatic fixes  on')
    expect(r.out.replace(/\s+/g, ' ')).toContain('Sunday 02:00–04:00')
  })

  it('refuses to upgrade what is not installed, in words', () => {
    const r = cli('hq', 'upgrade', '0.9.9', '--yes')
    expect(r.code).toBe(1)
    expect(r.err).toContain('No HQ here')
  })

  it('lists upgrade among the commands', () => {
    expect(cli('help').out).toContain('hq upgrade')
  })
})

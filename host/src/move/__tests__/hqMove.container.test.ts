/**
 * hq's move to a new machine, as far as one Docker host can check it (`npm run test:container`): the built image
 * carries the two commands and refuses them in words where they do not apply. The move itself needs two machines,
 * each with its own host service, and is checked by hand on two machines and in the cross-app suite. Build the image
 * first, at the repository root: `docker build -f host/docker/Dockerfile -t agenthix-host .` (or name another with
 * HOST_IMAGE). It starts the image with a temporary state folder and no Docker socket, so it installs nothing. Its
 * container carries a namespace of its own for the run, recorded in the state folder, and every docker command goes
 * through the guard (`containerGuard.ts`), so it touches nothing of a real install beside it.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claimNames, guardedDocker, recordNamespace, testNamespace } from '../../__tests__/containerGuard'

const IMAGE = process.env.HOST_IMAGE || 'agenthix-host'
const NS = testNamespace('hqmove')
const NAME = claimNames(NS).hostContainer
let state: string

const docker = guardedDocker(NS)

/** The CLI's words and its exit code, from stdout and stderr alike. */
function cli(...args: string[]): { code: number; text: string } {
  try {
    return { code: 0, text: docker('exec', NAME, 'agenthix', ...args) }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, text: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

beforeAll(async () => {
  state = fs.mkdtempSync(path.join(os.tmpdir(), 'host-hqmove-'))
  recordNamespace(state, NS)
  docker('run', '-d', '--name', NAME, '-v', `${state}:/state`, IMAGE)
  for (let i = 0; i < 50; i++) {
    try {
      docker('exec', NAME, 'test', '-S', '/run/host/owner.sock')
      break
    } catch {
      await new Promise(r => setTimeout(r, 200))
    }
  }
})

afterAll(() => {
  docker.quiet('exec', NAME, 'sh', '-c', 'rm -rf /state/* /state/.[!.]*')
  docker.quiet('rm', '-f', NAME)
  fs.rmSync(state, { recursive: true, force: true })
})

describe("the image's commands for moving HQ @SC-859", () => {
  it('lists them in help', () => {
    expect(cli('help', 'hq', 'console-code').text).toContain('--no-machines')
    expect(cli('help', 'site', 'schedule').text.replace(/\s+/g, ' ')).toContain('hq schedule move --at <time> [--address <new address>]')
  })

  it('refuses them, in words, on a machine that runs no HQ', () => {
    const noMachines = cli('hq', 'console-code', '--no-machines', '--yes')
    expect(noMachines.code).not.toBe(0)
    expect(noMachines.text).toMatch(/No HQ here/)
    const move = cli('hq', 'schedule', 'move', '--at', 'tomorrow 02:00')
    expect(move.code).not.toBe(0)
    expect(move.text).toMatch(/No HQ here/)
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Docker, type RunOptions } from '../../docker/docker'
import { StateFolder } from '../../state/folder'
import type { Context } from '../../service/context'
import { fetchImages } from '../images'
import { checkSignature } from '../signatures'
import { childEnv, registryEnv, registryLogin } from '../registryAuth'
import { signerFor } from '../published'

const DIGEST = `sha256:${'ab'.repeat(32)}`
const PINNED = `ghcr.io/solution84-com/agenthix-host@${DIGEST}`
// Obviously fake values.
const CREDENTIAL = { REGISTRY_USERNAME: 'fake-user', REGISTRY_TOKEN: 'fake-token-not-real' }

let dir: string
let state: StateFolder
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-auth-'))
  state = new StateFolder(path.join(dir, 'state'))
  state.prepare()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('the registry credential of a machine that pulls private images @SC-820 @SC-1053', () => {
  it('writes a Docker client configuration of its own, for the registry only, readable by its owner only', () => {
    const env = registryEnv(state, CREDENTIAL)
    expect(env).toEqual({ DOCKER_CONFIG: state.path('registry', 'docker') })
    const file = path.join(env!.DOCKER_CONFIG, 'config.json')
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
      auths: { 'ghcr.io': { auth: Buffer.from('fake-user:fake-token-not-real').toString('base64') } },
    })
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    expect(fs.statSync(env!.DOCKER_CONFIG).mode & 0o777).toBe(0o700)
    expect(env!.DOCKER_CONFIG.startsWith(os.homedir())).toBe(false)
  })

  it('does nothing unless both are set, and removes a configuration an earlier start wrote', () => {
    expect(registryEnv(state, { REGISTRY_USERNAME: 'fake-user' })).toBeUndefined()
    expect(registryEnv(state, { REGISTRY_TOKEN: 'fake-token-not-real' })).toBeUndefined()
    expect(fs.existsSync(state.path('registry'))).toBe(false)
    registryEnv(state, CREDENTIAL)
    expect(registryEnv(state, {})).toBeUndefined()
    expect(fs.existsSync(state.path('registry', 'docker'))).toBe(false)
  })

  it('gives the pull the configuration, and the signature check too', async () => {
    const pulls: { args: string[]; options?: RunOptions }[] = []
    const docker = new Docker(async (args, options) => { pulls.push({ args, options }); return { code: 0, stdout: '', stderr: '' } })
    const env = registryEnv(state, CREDENTIAL)
    await docker.pull(PINNED, env)
    expect(pulls[0].args).toEqual(['pull', '--quiet', PINNED])
    expect(pulls[0].options?.env).toEqual(env)

    let cosignEnv: unknown = 'not called'
    await checkSignature(async (_args, _t, e) => { cosignEnv = e; return { code: 1, stdout: '', stderr: 'no signatures found' } }, PINNED, signerFor('1.0.0-beta.1'), env)
    expect(cosignEnv).toEqual(env)
  })

  it('fetches with the machine’s configuration when it has one, and without when it has none', async () => {
    const seen: (unknown)[] = []
    const docker = new Docker(async (args, options) => {
      if (args[0] === 'image') return { code: 1, stdout: '', stderr: 'No such image' }
      seen.push(options?.env)
      return { code: 0, stdout: '', stderr: '' }
    })
    const ctx = { docker, registryEnv: () => registryEnv(state, CREDENTIAL) } as unknown as Context
    await fetchImages(ctx, [PINNED])
    await fetchImages({ docker } as unknown as Context, [PINNED])
    expect(seen).toEqual([{ DOCKER_CONFIG: state.path('registry', 'docker') }, undefined])
  })

  it('never lets a command it starts inherit the credential itself', () => {
    const env = childEnv({ PATH: '/bin', ...CREDENTIAL, TZ: 'UTC' }, { DOCKER_CONFIG: '/state/registry/docker' })
    expect(env).toEqual({ PATH: '/bin', TZ: 'UTC', DOCKER_CONFIG: '/state/registry/docker' })
    expect(JSON.stringify(env)).not.toContain('fake-token-not-real')
  })

  it("gives the host service's own registry requests the same login, only when both are set", () => {
    expect(registryLogin(CREDENTIAL)).toBe(Buffer.from('fake-user:fake-token-not-real').toString('base64'))
    expect(registryLogin({ REGISTRY_USERNAME: 'fake-user' })).toBeUndefined()
    expect(registryLogin({})).toBeUndefined()
  })
})

/**
 * The host service's version comes from the image reference its container was started from, never from its build:
 * a trusted publisher's host image by a published version's tag is that version once its signature for that version
 * passes and the container runs the signed content; anything else is a development build.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ImageInfo, InspectedContainer } from '../../docker/containers'
import { StateFolder } from '../../state/folder'
import { checkedVersion, ownVersion, type OwnVersionEnv } from '../ownVersion'
import { hostVersionOf, parseReference, signerFor, versionedRef } from '../published'
import type { SignatureCheck } from '../signatures'

const REPO = 'ghcr.io/solution84-com/agenthix-host'
const DIGEST = `sha256:${'d'.repeat(64)}`
const IMAGE_ID = `sha256:${'a'.repeat(64)}`
const CONTAINER = 'c'.repeat(64)
const MOUNTINFO = `512 500 0:40 /docker/containers/${CONTAINER}/hostname /etc/hostname rw - ext4 /dev/vda1 rw\n`

let dir: string
let state: StateFolder
let reference: string
let image: ImageInfo | null
let signature: SignatureCheck
let asked: [string, string][]

function env(over: Partial<OwnVersionEnv> = {}): OwnVersionEnv {
  const self: InspectedContainer = {
    id: CONTAINER, name: 'agenthix-host', image: IMAGE_ID, reference, running: true, env: [], mounts: [], network: 'host', capAdd: [], restart: 'unless-stopped',
  }
  return {
    containers: { inspect: async id => (id === CONTAINER ? self : null), image: async id => (id === IMAGE_ID ? image : null) },
    state,
    mountinfo: MOUNTINFO,
    hasDocker: true,
    check: async (ref, signer) => { asked.push([ref, signer.identity]); return signature },
    now: () => new Date('2026-10-24T09:00:00Z'),
    ...over,
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-version-'))
  state = new StateFolder(dir)
  state.prepare()
  reference = `${REPO}:0.3.0`
  image = { id: IMAGE_ID, env: [], repoDigests: [`${REPO}@${DIGEST}`] }
  signature = { kind: 'signed', digest: DIGEST }
  asked = []
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('the version an image reference names @SC-1256', () => {
  it('is the tag of a trusted host image by a published version, with or without a digest after it', () => {
    expect(hostVersionOf(`${REPO}:0.3.0`)).toBe('0.3.0')
    expect(hostVersionOf(`${REPO}:1.0.0-rc.2@${DIGEST}`)).toBe('1.0.0-rc.2')
  })

  it('is none for another repository, another part, a bare digest, a local name, an id, or a tag that is no version', () => {
    for (const ref of [
      'ghcr.io/elsewhere/agenthix-host:0.3.0',
      'ghcr.io/solution84-com/agenthix-site-server:0.3.0',
      `${REPO}@${DIGEST}`,
      'agenthix-host',
      'agenthix-host:0.3.0',
      IMAGE_ID,
      `${REPO}:latest`,
      `${REPO}:dev`,
      `${REPO}:build-abc123`,
    ]) expect(hostVersionOf(ref), ref).toBeNull()
  })

  it('reads a registry with a port, and puts a version in front of a pinned digest', () => {
    expect(parseReference('localhost:5000/x/y')).toEqual({ name: 'localhost:5000/x/y', tag: null, digest: null })
    expect(parseReference(`localhost:5000/x/y:1.0.0@${DIGEST}`)).toEqual({ name: 'localhost:5000/x/y', tag: '1.0.0', digest: DIGEST })
    expect(versionedRef(`${REPO}@${DIGEST}`, '0.3.0')).toBe(`${REPO}:0.3.0@${DIGEST}`)
    expect(() => versionedRef(`${REPO}:0.3.0`, '0.3.0')).toThrow('not fixed by a digest')
  })
})

describe('the host service’s own version, at start @SC-1256', () => {
  it('is dev outside a container, and asks nothing', async () => {
    expect(await ownVersion(env({ mountinfo: '' }))).toBe('dev')
    expect(asked).toEqual([])
  })

  it('is dev without the Docker socket, which starts no image, and asks nothing', async () => {
    expect(await ownVersion(env({ hasDocker: false }))).toBe('dev')
    expect(asked).toEqual([])
  })

  it('is dev for a local build’s name, a bare digest or an untrusted repository, and asks nothing', async () => {
    for (const ref of ['agenthix-host', `${REPO}@${DIGEST}`, 'ghcr.io/elsewhere/agenthix-host:0.3.0', IMAGE_ID]) {
      reference = ref
      expect(await ownVersion(env()), ref).toBe('dev')
    }
    expect(asked).toEqual([])
  })

  it('is the tag’s version once that version’s signature passes, checked by tag', async () => {
    expect(await ownVersion(env())).toBe('0.3.0')
    expect(asked).toEqual([[`${REPO}:0.3.0`, signerFor('0.3.0').identity]])
    expect(checkedVersion(state, IMAGE_ID)).toBe('0.3.0')
  })

  it('checks the digest a tag-and-digest reference names, for the tag’s version', async () => {
    reference = `${REPO}:0.3.0@${DIGEST}`
    expect(await ownVersion(env())).toBe('0.3.0')
    expect(asked).toEqual([[`${REPO}@${DIGEST}`, signerFor('0.3.0').identity]])
  })

  it('accepts an image whose id is the signed digest, as Docker’s containerd store holds it', async () => {
    image = { id: DIGEST, env: [], repoDigests: [] }
    const containers = { inspect: async () => ({ ...(await env().containers.inspect(CONTAINER))!, image: DIGEST }), image: async () => image }
    expect(await ownVersion(env({ containers }))).toBe('0.3.0')
  })

  it('stops, saying why, when the signature does not pass, and records nothing', async () => {
    for (const [check, says] of [
      [{ kind: 'unsigned' }, 'carries no signature'],
      [{ kind: 'wrongSigner' }, 'not signed by Agenthix\'s publishing workflow for version 0.3.0'],
      [{ kind: 'missing' }, 'the registry has no such image'],
      [{ kind: 'unchecked', reason: 'no network' }, 'could not be checked (no network)'],
    ] as [SignatureCheck, string][]) {
      signature = check
      await expect(ownVersion(env())).rejects.toThrow(says)
    }
    expect(checkedVersion(state, IMAGE_ID)).toBe('dev')
  })

  it('stops when the image the container runs is not the content that was signed, as a local image under the tag', async () => {
    image = { id: IMAGE_ID, env: [], repoDigests: [] }
    await expect(ownVersion(env())).rejects.toThrow('is not the one Agenthix\'s publishing workflow signed for version 0.3.0')
    expect(checkedVersion(state, IMAGE_ID)).toBe('dev')
  })

  it('stops when Docker cannot say what its own container is, rather than run as a development build', async () => {
    await expect(ownVersion(env({ containers: { inspect: async () => null, image: async () => image } }))).rejects.toThrow('cannot tell which version')
    await expect(ownVersion(env({ containers: { inspect: async () => { throw new Error('Docker is not answering') }, image: async () => image } }))).rejects.toThrow('not answering')
  })

  it('trusts the same image again without asking, as at a start without network, but asks again for another', async () => {
    await ownVersion(env())
    signature = { kind: 'unchecked', reason: 'no network' }
    expect(await ownVersion(env())).toBe('0.3.0')
    expect(asked).toHaveLength(1)
    reference = `${REPO}:0.3.1`
    await expect(ownVersion(env())).rejects.toThrow('could not be checked')
  })
})

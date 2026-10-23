import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { digestOf, fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import type { Progress } from '../../sockets/lineServer'
import { install } from '../../install/install'

let m: FakeMachine
beforeEach(() => { m = fakeMachine() })
afterEach(() => m.cleanup())

const progress: Progress[] = []
const run = () => install(m.ctx, { address: 'https://hq.acme.example' }, p => progress.push(p))
const pulls = () => m.calls.filter(c => c[0] === 'pull').map(c => c[c.length - 1])
const REGISTRY = 'ghcr.io/solution84-com'
const SIGNER = 'https://github.com/solution84-com/agenthix/.github/workflows/publish-images.yml@refs/tags/v0.2.0'
const published = (part: string) => `${REGISTRY}/agenthix-${part}:0.2.0`
const pinned = (part: string) => `${REGISTRY}/agenthix-${part}@${digestOf(published(part))}`

describe('a release build of the host service @SC-820', () => {
  beforeEach(() => { progress.length = 0 })

  it('checks every image against the publishing workflow at that version’s tag, before it fetches any', async () => {
    const check = m.ctx.signatures
    m.ctx.signatures = async (ref, signer) => { m.calls.push(['cosign', ref]); return check(ref, signer) }
    await run()
    expect(m.checked).toEqual(['hq-server', 'hq-web', 'site-server', 'agent', 'console'].map(p => [published(p), SIGNER]))
    const lastCheck = m.calls.map(c => c[0]).lastIndexOf('cosign')
    const firstImage = m.calls.findIndex(c => c[0] === 'image' || c[0] === 'pull')
    expect(lastCheck).toBeLessThan(firstImage)
    expect(progress[0]).toEqual({ event: 'step', step: 'Checking the images are signed by Agenthix' })
    expect(progress[1]).toEqual({ event: 'stepDone', outcome: 'passes' })
    expect(progress[2]).toEqual({ event: 'step', step: 'Pulling HQ 0.2.0 (3 images)' })
    expect(progress[4]).toEqual({ event: 'step', step: 'Pulling the site 0.2.0 and the agent image' })
  })

  it('fetches and runs each image by the digest its signature covers', async () => {
    await run()
    const hq = JSON.parse(fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8'))
    const site = JSON.parse(fs.readFileSync(m.ctx.state.path('site', 'compose.json'), 'utf8'))
    expect(hq.services['hq-server'].image).toBe(pinned('hq-server'))
    const fleetConsole = JSON.parse(fs.readFileSync(m.ctx.state.path('console', 'compose.json'), 'utf8'))
    expect(fleetConsole.services.console.image).toBe(pinned('console'))
    expect(hq.services['hq-web'].image).toBe(pinned('hq-web'))
    expect(site.services.site.image).toBe(pinned('site-server'))
    expect(site.services.site.environment.AGENT_IMAGE).toBe(pinned('agent'))
    const inspected = m.calls.filter(c => c[0] === 'image').map(c => c[c.length - 1])
    expect(inspected).toEqual(expect.arrayContaining([pinned('hq-server'), pinned('hq-web'), pinned('site-server'), pinned('agent')]))
    expect(inspected.some(ref => ref.endsWith(':0.2.0'))).toBe(false)
  })

  it('pulls an image the machine lacks by its digest, never by its tag', async () => {
    const exists = m.ctx.docker.imageExists.bind(m.ctx.docker)
    m.ctx.docker.imageExists = async ref => ref !== pinned('site-server') && exists(ref)
    await run()
    expect(pulls()).toEqual([pinned('site-server')])
  })

  for (const [kind, words] of [
    ['unsigned', /carries no signature/],
    ['wrongSigner', /signed, but not by Agenthix's publishing workflow for version 0\.2\.0/],
  ] as const) {
    it(`refuses an image that is ${kind === 'unsigned' ? 'unsigned' : 'signed by someone else'}, fetching and writing nothing`, async () => {
      m.signatures.set(published('hq-web'), { kind })
      await expect(run()).rejects.toMatchObject({ code: 'unsigned_image', message: expect.stringMatching(words) })
      await expect(run()).rejects.toThrow(published('hq-web'))
      expect(pulls()).toEqual([])
      expect(m.calls.some(c => c[0] === 'compose')).toBe(false)
      expect(fs.existsSync(m.ctx.state.path('hq', 'settings.json'))).toBe(false)
    })
  }

  it('fails closed when a signature cannot be checked, naming the next step', async () => {
    m.signatures.set(published('agent'), { kind: 'unchecked', reason: 'no such host' })
    await expect(run()).rejects.toMatchObject({ code: 'failed', message: expect.stringMatching(/could not be checked \(no such host\).*internet connection/) })
    expect(pulls()).toEqual([])
  })

  it('says when the version is not in the registry', async () => {
    m.signatures.set(published('hq-server'), { kind: 'missing' })
    await expect(run()).rejects.toThrow(/not in the registry, so version 0\.2\.0 cannot be installed/)
  })

  it('refuses images built on a machine', async () => {
    m.ctx.state.writeJson(['hq', 'settings.json'], { address: 'https://hq.acme.example', bind: '127.0.0.1', port: 4100, trustedProxies: 2, version: 'dev', installedAt: 'x' })
    await expect(run()).rejects.toMatchObject({ code: 'unsigned_image', message: expect.stringMatching(/only Agenthix's published, signed images, and agenthix-hq-server is a build made on a machine/) })
    expect(m.checked).toEqual([])
    expect(pulls()).toEqual([])
  })
})

describe('a development build of the host service @SC-820', () => {
  beforeEach(() => {
    progress.length = 0
    m.ctx.machine.hostServiceVersion = 'dev'
  })

  it('runs the images built on the machine, unchecked, and says so', async () => {
    await run()
    expect(m.checked).toEqual([])
    const hq = JSON.parse(fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8'))
    expect(hq.services['hq-server'].image).toBe('agenthix-hq-server')
    expect(progress[1]).toEqual({ event: 'stepDone', outcome: 'not checked: images built here (development build)' })
  })

  it('never fetches an image built on a machine, and says how to get it', async () => {
    m.missingImages.add('agenthix-agent')
    await expect(run()).rejects.toThrow(/agenthix-agent is not on this machine.*build agenthix-agent on this machine/)
    expect(pulls()).toEqual([])
  })

  it('still checks a published image', async () => {
    m.ctx.state.writeJson(['hq', 'settings.json'], { address: 'https://hq.acme.example', bind: '127.0.0.1', port: 4100, trustedProxies: 2, version: '0.2.0', installedAt: 'x' })
    m.signatures.set(published('hq-server'), { kind: 'unsigned' })
    await expect(run()).rejects.toMatchObject({ code: 'unsigned_image' })
  })
})

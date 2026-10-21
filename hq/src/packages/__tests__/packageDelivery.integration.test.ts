import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Duplex } from 'node:stream'
import { SITE_PROTOCOL_VERSION, type RunPackages } from '@agenthix/core'
import { ensureExecutionSite } from '../../test/factories'

// Delivering a run's packages (ADR-0072) with hq's own package tables real (ADR-0094). The site channel and the
// content stream are the site's side of the wire, not hq's data path, so they are stubbed: what hq asks the
// site and what it streams to it are the behaviour checked.

const h = vi.hoisted(() => ({ request: vi.fn(), open: vi.fn() }))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await vi.importActual<typeof import('../../sites/channel/pendingRequests')>('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request: h.request }, ChannelRequestFailed }
})
vi.mock('../../sites/content', async () => {
  const { ContentStreamFailed } = await vi.importActual<typeof import('../../sites/content/contentStream')>('../../sites/content/contentStream')
  return { openContentStream: h.open, ContentStreamFailed }
})

import { deliverPackages, PackageDeliveryError } from '../packageDelivery'
import { resolveRunPackages } from '../runPackages'
import { writeAgentContent } from '../agentPackageService'
import { writePackage, computePackageDigest } from '../packageStore'
import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'
import { ContentStreamFailed } from '../../sites/content/contentStream'
import { SiteUnreachableError } from '../../storage/workspaceStore'

let packages: RunPackages
const agent = () => packages.agent

/** A stream that records what hq writes and answers the way a site would once hq ends its half. */
function siteStream(answer: 'ok' | Error) {
  const written: Buffer[] = []
  const stream = new Duplex({
    read() {},
    write(chunk: Buffer, _enc, cb) { written.push(chunk); cb() },
    final(cb) {
      cb()
      setImmediate(() => (answer === 'ok' ? stream.push(null) : stream.destroy(answer)))
    },
  })
  return { stream, written }
}
const transferOf = (site: { written: Buffer[] }) => JSON.parse(Buffer.concat(site.written).toString())
const content = (instructions: string) => ({ instructions, skillFiles: [] })

beforeEach(async () => {
  vi.resetAllMocks()
  await writePackage({ kind: 'platform', key: 'platform', files: [], updatedById: null })
  await writeAgentContent('a1', content('Be thorough.'), 'u1')
  packages = await resolveRunPackages('a1')
})

describe('deliverPackages @SC-446', () => {
  // ADR-0072's delivery promise, against a site that caches by digest: content crosses once per site per
  // change, the unchanged definition is reused from the cache, and an edit — a new digest — is fetched on
  // the next run with nothing published.
  it('a site fetches a definition once, reuses its cache while unchanged, and fetches again after an edit', async () => {
    const cached = new Set<string>()
    const puts: string[] = []
    h.request.mockImplementation(async (_site: string, _method: string, { refs }: { refs: Array<{ digest: string }> }) => ({
      missing: refs.map(r => r.digest).filter(d => !cached.has(d)),
    }))
    h.open.mockImplementation(async (_site: string, _method: string, { ref }: { ref: { digest: string } }) => {
      puts.push(ref.digest)
      cached.add(ref.digest)
      return siteStream('ok').stream
    })

    await deliverPackages('s1', packages)
    expect(puts).toEqual([agent().digest, packages.platform.digest])

    await deliverPackages('s1', packages)
    await deliverPackages('s1', packages)
    expect(puts).toHaveLength(2)

    await writeAgentContent('a1', content('Be brief.'), 'u2')
    const next = await resolveRunPackages('a1')
    await deliverPackages('s1', next)
    expect(puts).toEqual([agent().digest, packages.platform.digest, next.agent.digest])
  })

  it('opens no stream when the site already holds every package\'s content', async () => {
    h.request.mockResolvedValue({ missing: [] })
    await deliverPackages('s1', packages)
    expect(h.request).toHaveBeenCalledWith('s1', 'packages.missing', { refs: [agent(), packages.platform] })
    expect(h.open).not.toHaveBeenCalled()
  })

  it('streams each missing package as a transfer of the stored content and waits for the site to end', async () => {
    h.request.mockResolvedValue({ missing: [agent().digest] })
    const site = siteStream('ok')
    h.open.mockResolvedValue(site.stream)
    await deliverPackages('s1', packages)
    expect(h.open).toHaveBeenCalledOnce()
    expect(h.open).toHaveBeenCalledWith('s1', 'packages.put', { ref: agent() })
    const transfer = transferOf(site)
    expect(transfer.ref).toEqual(agent())
    expect(Buffer.from(transfer.data['instructions.md'], 'base64').toString()).toBe('Be thorough.')
    expect(computePackageDigest(transfer.contents)).toBe(agent().digest)
  })

  // The owner's rule (ADR-0072): a run uses the definition as it was when it started; an edit applies from the
  // next run. A save between a run's start and its delivery must never fail the run nor change what it is sent.
  it('an edit between a run\'s start and its delivery still delivers the start-time content, named by its digest', async () => {
    h.request.mockImplementation(async (_s: string, _m: string, { refs }: { refs: Array<{ digest: string }> }) => ({ missing: refs.map(r => r.digest) }))
    const sites: Array<{ written: Buffer[] }> = []
    h.open.mockImplementation(async () => { const s = siteStream('ok'); sites.push(s); return s.stream })
    await writeAgentContent('a1', content('Be brief.'), 'u2')

    await expect(deliverPackages('s1', packages)).resolves.toBeUndefined()

    const agentPut = sites.map(transferOf).find(t => t.ref.digest === agent().digest)
    expect(Buffer.from(agentPut.data['instructions.md'], 'base64').toString()).toBe('Be thorough.')
  })

  it('the next run gets the edited content', async () => {
    h.request.mockImplementation(async (_s: string, _m: string, { refs }: { refs: Array<{ digest: string }> }) => ({ missing: refs.map(r => r.digest) }))
    const sites: Array<{ written: Buffer[] }> = []
    h.open.mockImplementation(async () => { const s = siteStream('ok'); sites.push(s); return s.stream })
    await writeAgentContent('a1', content('Be brief.'), 'u2')
    const next = await resolveRunPackages('a1')

    expect(next.agent.digest).not.toBe(agent().digest)
    await deliverPackages('s1', next)
    const agentPut = sites.map(transferOf).find(t => t.ref.digest === next.agent.digest)
    expect(Buffer.from(agentPut.data['instructions.md'], 'base64').toString()).toBe('Be brief.')
  })

  it('reports a site that refused the content as package_delivery_failed', async () => {
    h.request.mockResolvedValue({ missing: [agent().digest] })
    h.open.mockResolvedValue(siteStream(new ContentStreamFailed('Package digest does not match its contents', 'handler_failed')).stream)
    const err = await deliverPackages('s1', packages).catch(e => e)
    expect(err).toBeInstanceOf(PackageDeliveryError)
    expect(err.code).toBe('package_delivery_failed')
    expect(err.message).toMatch(/digest does not match/)
  })

  it('reports content hq no longer holds as a failed run start rather than sending nothing', async () => {
    h.request.mockResolvedValue({ missing: ['e'.repeat(64)] })
    const gone = { ...packages, agent: { ...agent(), digest: 'e'.repeat(64) } }
    await expect(deliverPackages('s1', gone)).rejects.toThrow(/no longer holds/)
    expect(h.open).not.toHaveBeenCalled()
  })

  it('treats a site that cannot be reached on either connection as unreachable, so held tasks work as before', async () => {
    h.request.mockRejectedValue(new ChannelRequestFailed('gone', 'offline'))
    await expect(deliverPackages('s1', packages)).rejects.toBeInstanceOf(SiteUnreachableError)

    h.request.mockResolvedValue({ missing: [agent().digest] })
    h.open.mockRejectedValue(new ContentStreamFailed('no content connection', 'offline'))
    await expect(deliverPackages('s1', packages)).rejects.toBeInstanceOf(SiteUnreachableError)
  })

  it('a site recorded on another major surfaces as unreachable with its version mismatch, from the channel call', async () => {
    await ensureExecutionSite({ siteId: 's1', label: 'Old Box', status: 'VERSION_MISMATCH', protocolVersion: '7.3' })
    h.request.mockRejectedValue(new ChannelRequestFailed('refused', 'offline'))

    const err = await deliverPackages('s1', packages).catch(e => e)

    expect(err).toBeInstanceOf(SiteUnreachableError)
    expect(err.reason).toBe('version_mismatch')
  })

  it('names the site by its label when it is unreachable', async () => {
    await ensureExecutionSite({ siteId: 's1', label: 'Laptop', status: 'ONLINE', protocolVersion: SITE_PROTOCOL_VERSION })
    h.request.mockRejectedValue(new ChannelRequestFailed('gone', 'offline'))
    const err = await deliverPackages('s1', packages).catch(e => e)
    expect(err).toBeInstanceOf(SiteUnreachableError)
    expect(err.message).toContain('Laptop')
  })

  // sendAndAwaitEnd must not stall the full PACKAGE_PUT_TIMEOUT_MS on an outcome that has already happened.
  describe('a stream that never reaches a clean end', () => {
    it('a stream already destroyed with an error by the time hq sends it rejects with that error immediately, not after the timeout', async () => {
      h.request.mockResolvedValue({ missing: [agent().digest] })
      const stream = new Duplex({ read() {}, write(_c, _e, cb) { cb() }, final(cb) { cb() } })
      // The real ContentStream always carries this safety listener from construction; a bare test Duplex needs
      // it added, or Node treats the already-scheduled 'error' emission as unhandled.
      stream.on('error', () => {})
      stream.destroy(new Error('mux already gone'))
      h.open.mockResolvedValue(stream)

      const err = await deliverPackages('s1', packages).catch(e => e)

      expect(err).toBeInstanceOf(PackageDeliveryError)
      expect(err.code).toBe('package_delivery_failed')
      expect(err.message).toMatch(/mux already gone/)
    })

    it('a close with no prior error and no end (the site hung up silently) is treated as unreachable, not timed out', async () => {
      h.request.mockResolvedValue({ missing: [agent().digest] })
      const stream = new Duplex({
        read() {},
        write(_c, _e, cb) { cb() },
        final(cb) { cb(); setImmediate(() => stream.destroy()) }, // no push(null), no error
      })
      h.open.mockResolvedValue(stream)

      await expect(deliverPackages('s1', packages)).rejects.toBeInstanceOf(SiteUnreachableError)
    })
  })
})

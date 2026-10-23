// The site's model relay, run in this test process from the site's own code, for a call the harness cannot make
// from an agent container: this tier has no container runtime, and a relay token is issued only to a container the
// site started (claude/claudeProcess.ts, OpenCodeRuntime.ts) and held in the site's memory.
//
// Everything after the token is the site's: the relay adds the turn's key, streams the call to the provider and
// measures it (modelRelayApi.ts, callMeter.ts), and its report is kept in the site's own outbox folder
// (usageOutbox.ts) under the SITE_ROOT the running site uses. The running site delivers it to hq at its next start,
// as it does any report an earlier run left waiting. Only two things are the harness's: the token is issued and
// pointed here rather than by a container's start, and the request's source is not checked against a container's
// address.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { SITE_ROOT_DIR } from './env'

// Before any site module is loaded: their paths are read from it, and nothing may land under a developer's own root.
process.env.SITE_ROOT = SITE_ROOT_DIR

const relayApi = await import('../../../site/src/server/modelRelay/modelRelayApi')
const tokens = await import('../../../site/src/server/modelRelay/relayTokens')
const access = await import('../../../site/src/server/modelRelay/runAccess')
const outboxModule = await import('../../../site/src/server/modelRelay/usageOutbox')

export const USAGE_REPORTS_DIR = join(SITE_ROOT_DIR, 'usage-reports')

type Descriptor = Parameters<typeof access.siteCredentialOf>[0]

export class InProcessRelay {
  private constructor(private readonly server: Server, readonly baseUrl: string, private readonly kept: Promise<void>[]) {}

  static async start(): Promise<InProcessRelay> {
    const kept: Promise<void>[] = []
    // Never sends: the running site is the one that delivers, from the same folder.
    const outbox = new outboxModule.UsageOutbox({
      dir: USAGE_REPORTS_DIR,
      send: async () => { throw new Error('The in-process relay leaves delivery to the running site') },
      log: () => {},
    })
    const handler = relayApi.createModelRelayHandler({
      checkSource: async () => true,
      upstreamBase: (await import('../../../site/src/server/modelRelay/relayProviders')).upstreamBase,
      log: () => {},
      // No proxy from the developer's shell: the stand-in vendor is on this machine.
      env: {},
      report: report => {
        kept.push(outbox.add(report).then(() => outbox.stop()))
      },
    })
    const server = createServer((req, res) => { void handler(req, res) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    return new InProcessRelay(server, `http://127.0.0.1:${port}`, kept)
  }

  /** A turn of `runId` with the provider hq described, as a container's start points one; returns its token. */
  openTurn(runId: string, descriptor: Descriptor, billingProfileId: string | null): string {
    const credential = access.siteCredentialOf(descriptor)
    if (!credential || !access.isRelayed(credential)) throw new Error('That descriptor is not one the relay sends on')
    const token = tokens.issueRelayToken('cross-app-stand-in-container', `cross-app-${runId}`)
    tokens.pointRelayToken(token, runId, [credential], billingProfileId)
    return token
  }

  closeTurn(token: string): void {
    tokens.revokeRelayToken(token)
  }

  /** Waits until `count` calls' reports are in the site's outbox folder; a report is made just after its answer ends. */
  async reportsKept(count: number, ms = 15_000): Promise<void> {
    const end = Date.now() + ms
    while (this.kept.length < count) {
      if (Date.now() > end) throw new Error(`The relay made ${this.kept.length} of ${count} usage reports`)
      await new Promise(r => setTimeout(r, 100))
    }
    await Promise.all(this.kept)
  }

  /** The relay's address for a provider, as a harness in a container is given it. */
  providerUrl(provider: string): string {
    return `${this.baseUrl}/api/v1/model-relay/${provider}`
  }

  close(): Promise<void> {
    return new Promise(resolve => this.server.close(() => resolve()))
  }
}

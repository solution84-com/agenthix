/**
 * `/api/v1/model-relay/:provider/…`, every method — the site's model relay
 * (spec §6, "The key never enters the container"). A harness in an agent
 * container sends its provider's requests here; the relay adds the turn's key
 * and streams each request to the provider and the answer back, so no model
 * key is ever in a container.
 *
 * No route-level authentication (app.ts), like every endpoint an agent
 * container reaches: authenticated here. In order, a request is refused, and
 * the provider never contacted, unless:
 *
 * 1. the provider is one Agenthix offers (404) and the path cannot leave its
 *    upstream (400);
 * 2. its relay token names a running turn (relayTokens.ts): 401 for a token
 *    the site never issued or has revoked, 403 for one whose harness is
 *    between turns — never 401 there, which would make Claude Code run its
 *    `apiKeyHelper` again and spend the process's one ticket;
 * 3. it comes from that turn's container (403; relaySource.ts);
 * 4. the turn has a credential for the provider (403), and for Inworld, its
 *    models are on (`inworldLanguageModels`, 403);
 * 5. for Agenthix Cloud, hq gives its Cloud token (503 while it does not).
 *
 * Every upstream call is measured as it passes (callMeter.ts): a call id of its
 * own, the vendor's usage read from the answer, the upstream status and the
 * kind of failure. Its report goes to hq through the outbox (usageOutbox.ts),
 * for the ledger and for the provider's health. A run from an hq that names no
 * provider id is not reported.
 *
 * A bare `GET` or `HEAD` of a provider's base is answered here without any of
 * that and without contacting the provider: Claude Code sends one, without
 * its key, to check the address.
 *
 * No body parser is mounted on this route (`main.ts`), so a body streams
 * through unread and uncapped. The relay sets no deadline on a whole call,
 * since a streamed answer can run for minutes, but it does on silence: an
 * upstream that sends nothing for `UPSTREAM_IDLE_TIMEOUT_MS` (under OpenCode's
 * own 300 s between chunks) is cut off, a 504 naming the provider when nothing
 * has been sent yet. A closed client request aborts the upstream one; an
 * unreachable upstream is a 502. The site's proxy environment is honoured (relayProxy.ts):
 * an `https:` upstream goes through a `CONNECT` tunnel, an `http:` one direct.
 * One line is logged per request, never a key, a token or
 * a body.
 */
import http from 'node:http'
import https from 'node:https'
import type { ConnectionOptions as TlsOptions } from 'node:tls'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { UsageReport } from '@agenthix/core'
import type { ApiHandler } from '../http/apiHandler'
import { Logger } from '../utils/logger'
import { isSiteFeatureOn } from '../features/siteFeatures'
import { MODEL_RELAY_PATH, cloudKeyHeaders, isRelayProvider, providerKeyHeaders, upstreamBase } from './relayProviders'
import { CallMeter } from './callMeter'
import { cloudToken } from './cloudToken'
import type { CloudTokenAnswer } from './usageReportClient'
import { usageOutbox } from './usageOutbox'
import { usageApiFor } from './usageReader'
import { ModelSniffer, downstreamResponseHeaders, relayTokenOf, relayedPath, upstreamRequestHeaders, upstreamUrl } from './relayRequest'
import { TunnelAgent, describeRoute, proxyDecision } from './relayProxy'
import { checkRelaySource, type SourceCheck } from './relaySource'
import { isLiveRelayToken, resolveRelayToken, trackRelayRequest } from './relayTokens'

const logger = new Logger('modelRelay')

/** How long an upstream may send nothing before the call is cut off. */
export const UPSTREAM_IDLE_TIMEOUT_MS = 240_000

const agents = { http: new http.Agent({ keepAlive: true }), https: new https.Agent({ keepAlive: true }) }

/** One keep-alive pool per proxy, so tunnels are reused as direct connections are. */
const tunnels = new Map<string, TunnelAgent>()

export type ModelRelayDeps = {
  checkSource: SourceCheck
  upstreamBase: typeof upstreamBase
  log: (line: string) => void
  /** The proxy settings, read at each request; the site's own environment. */
  env?: NodeJS.ProcessEnv
  /** TLS options for a tunnelled connection to the provider; tests trust their stand-in's certificate here. */
  tls?: TlsOptions
  /** hq's Agenthix Cloud token, for a provider reached through Cloud's gateway. */
  cloudToken?: () => Promise<CloudTokenAnswer>
  /** Where each call's usage report goes. */
  report?: (report: UsageReport) => void
  /** How long an upstream may stay silent; tests shorten it. */
  idleTimeoutMs?: number
}

const defaultDeps: ModelRelayDeps = {
  checkSource: checkRelaySource,
  upstreamBase,
  log: line => logger.info(line),
  cloudToken,
  report: report => { void usageOutbox().add(report).catch(err => logger.warn(`A usage report could not be kept: ${err instanceof Error ? err.message : String(err)}`)) },
}

function refuse(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ error: { type: 'agenthix_relay', message } }))
}

export function createModelRelayHandler(deps: ModelRelayDeps = defaultDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const started = performance.now()
    const url = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? ''
    const provider = /^\/api\/v1\/model-relay\/([^/?]+)/.exec(url)?.[1] ?? ''
    const note = (status: number, extra = '') => deps.log(`provider=${provider || '-'} method=${req.method} status=${status}${extra}`)
    // Whatever is refused, the body is drained, never read.
    const turnAway = (status: number, message: string) => {
      req.resume()
      refuse(res, status, message)
      note(status, ` refused="${message}"`)
    }

    if (!isRelayProvider(provider)) return turnAway(404, 'Not a provider this site relays')
    const relayed = relayedPath(url, `${MODEL_RELAY_PATH}/${provider}`)
    if (!relayed) return turnAway(400, 'The request path is not one the relay forwards')
    if ((req.method === 'GET' || req.method === 'HEAD') && (relayed.path === '' || relayed.path === '/') && !relayed.query) {
      req.resume()
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : '{}')
      return note(200, ' base=true')
    }

    const token = relayTokenOf(req.headers)
    const turn = resolveRelayToken(token)
    if (!turn) return turnAway(isLiveRelayToken(token) ? 403 : 401, 'No turn is running for this request')
    if (!(await deps.checkSource(turn.containerName, req.socket.remoteAddress))) {
      return turnAway(403, 'The request did not come from its turn\'s container')
    }
    const credential = turn.credentials.get(provider)
    if (!credential) return turnAway(403, `This turn has no ${provider} credential`)
    // Decided here with this site's own build, whatever hq sent (adr-0172).
    if (provider === 'inworld' && !isSiteFeatureOn('inworldLanguageModels', turn.features)) {
      return turnAway(403, 'Models through Inworld are not on for this organisation')
    }
    const base = deps.upstreamBase(credential)
    const target = base ? upstreamUrl(base, relayed) : null
    if (!target) return turnAway(400, 'The request path is not one the relay forwards')

    const meter = credential.providerId ? new CallMeter({ runId: turn.runId, providerId: credential.providerId, api: usageApiFor(provider) }) : null
    let keyHeaders: Record<string, string>
    if (credential.kind === 'cloud') {
      const answer = await (deps.cloudToken ?? cloudToken)()
      if (!answer.ok) return turnAway(503, `Agenthix Cloud is not available to this run (${answer.refusal})`)
      const billing = meter && isSiteFeatureOn('usageBilling', turn.features) ? { callId: meter.callId, billingProfileId: turn.billingProfileId } : null
      keyHeaders = cloudKeyHeaders(credential, answer.token.token, billing)
    } else {
      keyHeaders = providerKeyHeaders(credential)
    }

    const sniffer = new ModelSniffer(relayed.path)
    let bytesIn = 0
    let bytesOut = 0
    let status = 0
    let headersAt: number | null = null
    let firstByteAt: number | null = null
    let logged = false
    let untrack = () => {}
    const ms = (t: number | null) => (t === null ? '-' : (t - started).toFixed(1))
    const finish = (outcome: string) => {
      if (logged) return
      logged = true
      untrack()
      if (meter && deps.report && outcome !== 'proxy-setting-invalid') {
        const report = deps.report
        void meter.report(sniffer.model, outcome === 'upstream-error' || outcome === 'upstream-timeout', outcome === 'turn-ended' || outcome === 'client-closed').then(report, () => {})
      }
      deps.log(
        `conversation=${turn.conversationId} run=${turn.runId} provider=${provider} model=${sniffer.model ?? '-'} ` +
        `method=${req.method} status=${status || '-'} bytesIn=${bytesIn} bytesOut=${bytesOut} ` +
        `msHeaders=${ms(headersAt)} msFirstByte=${ms(firstByteAt)} msTotal=${ms(performance.now())} proxy=${describeRoute(route)} outcome=${outcome}`,
      )
    }

    const route = proxyDecision(target, deps.env ?? process.env)
    if (route.kind === 'invalid') {
      req.resume()
      refuse(res, 502, 'The site\'s proxy setting is not a usable address')
      status = 502
      return finish('proxy-setting-invalid')
    }
    let agent: http.Agent = target.protocol === 'https:' ? agents.https : agents.http
    if (route.kind === 'tunnel') {
      // The address is the map's key and is never logged: it may carry the proxy's credentials.
      const key = route.proxy.href
      let tunnel = tunnels.get(key)
      if (!tunnel) tunnels.set(key, tunnel = new TunnelAgent(route.proxy, deps.tls))
      agent = tunnel
    }
    const upstream = (target.protocol === 'https:' ? https : http).request(target, {
      method: req.method,
      headers: upstreamRequestHeaders(req.headers, keyHeaders),
      agent,
      timeout: deps.idleTimeoutMs ?? UPSTREAM_IDLE_TIMEOUT_MS,
    })
    upstream.on('timeout', () => {
      upstream.destroy()
      if (!res.headersSent) {
        status = 504
        refuse(res, 504, `The ${provider} provider did not answer in time`)
        finish('upstream-timeout')
      } else {
        res.destroy()
        finish('upstream-timeout')
      }
    })
    untrack = trackRelayRequest(token, () => {
      upstream.destroy()
      res.destroy()
      finish('turn-ended')
    })

    upstream.on('response', answer => {
      status = answer.statusCode ?? 502
      headersAt = performance.now()
      res.writeHead(status, downstreamResponseHeaders(answer.headers))
      res.flushHeaders()
      meter?.answer(status, answer.headers['content-type'], answer.headers['content-encoding'])
      answer.on('data', (chunk: Buffer) => {
        firstByteAt ??= performance.now()
        bytesOut += chunk.length
        meter?.chunk(chunk)
      })
      answer.on('end', () => finish('done'))
      answer.on('error', () => {
        res.destroy()
        finish('upstream-error')
      })
      answer.pipe(res)
    })
    upstream.on('error', err => {
      if (!res.headersSent) {
        status = 502
        refuse(res, 502, 'The provider could not be reached')
        finish(`unreachable (${(err as NodeJS.ErrnoException).code ?? 'error'})`)
      } else {
        res.destroy()
        finish('upstream-error')
      }
    })
    // A cancelled turn closes the harness's request; the provider's ends with it.
    res.on('close', () => {
      if (res.writableFinished) return
      upstream.destroy()
      finish('client-closed')
    })
    req.on('data', (chunk: Buffer) => {
      bytesIn += chunk.length
      sniffer.push(chunk)
    })
    req.pipe(upstream)
  }
}

export const modelRelayHandler: ApiHandler = createModelRelayHandler()

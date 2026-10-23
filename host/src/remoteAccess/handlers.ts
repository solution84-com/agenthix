/**
 * Remote access to the Fleet Console on a machine Agenthix Cloud runs (pre-release spec B9, ADR-0132): the four
 * Cloud-only operations. Reached only through `cloud/dispatch.ts` — Cloud's pinned controller, on a machine enrolled
 * with Cloud — so on an organisation's own machine nothing here can be asked, and the Fleet Console's own rule
 * (`mayTurnOnRemoteAccess`) is untouched.
 *
 * The Fleet Console holds the key, the chain, the allow list and the authenticators, and ends TLS itself
 * (console/src/net/remoteAccess.ts); this host service checks what Cloud sent, hands it over, and publishes the one
 * port on every address while it is on — unpublishing it at `until` (`resumeRemoteAccess` at start, and a timer),
 * and at `off`, whether or not the Fleet Console answers.
 */
import {
  checkRemoteAccessOn, checkRemoteAuthenticator, isRemoteAccessName,
} from '@agenthix/core'
import { Refusal } from '../owner/results'
import type { CloudOnlyHandlers } from '../cloud/handlers'
import type { Context } from '../service/context'
import { askConsoleRemote } from './consoleRemote'
import { checkPorts, EVERY_ADDRESS } from '../install/portCheck'
import { republishConsole } from './publish'
import { forgetRemoteAccess, keepRemoteAccess, keptRemoteAccess } from './state'

const malformed = (what: string): never => {
  throw new Refusal('malformed', `The request's ${what} is missing or not valid.`)
}
const text = (v: unknown, what: string, max: number): string => (typeof v === 'string' && v.length <= max ? v : malformed(what))

let endTimer: NodeJS.Timeout | null = null

/** Sets the timer for the end kept, or ends it now when it has passed. At start, `main.ts` calls it once. */
export function resumeRemoteAccess(ctx: Context): void {
  if (endTimer) clearTimeout(endTimer)
  endTimer = null
  const kept = keptRemoteAccess(ctx)
  if (!kept) return
  const ms = Date.parse(kept.until) - ctx.now().getTime()
  if (ms <= 0) {
    void endRemoteAccess(ctx)
    return
  }
  endTimer = setTimeout(() => void endRemoteAccess(ctx), Math.min(ms, 2 ** 31 - 1))
  endTimer.unref()
}

/** At `until`: the port is no longer published. The Fleet Console has stopped listening by itself at the same time. */
export async function endRemoteAccess(ctx: Context): Promise<void> {
  const kept = keptRemoteAccess(ctx)
  if (!kept) return
  if (Date.parse(kept.until) > ctx.now().getTime()) return resumeRemoteAccess(ctx)
  forgetRemoteAccess(ctx)
  await republishConsole(ctx).catch(err => {
    console.warn(`[host] remote access ended, but the Fleet Console's port could not be closed: ${err instanceof Error ? err.message : err}`)
  })
}

/** Off from Cloud, or from the machine's own command line: the starting state, always reachable. */
export async function turnRemoteAccessOff(ctx: Context): Promise<{ on: false }> {
  // The port closes even when the Fleet Console does not answer.
  await askConsoleRemote(ctx, 'remote-off', {}).catch(() => undefined)
  const published = keptRemoteAccess(ctx) !== null
  forgetRemoteAccess(ctx)
  resumeRemoteAccess(ctx)
  if (published) await republishConsole(ctx)
  return { on: false }
}

export const remoteAccessHandlers: CloudOnlyHandlers = {
  'remoteAccess.csr': {
    parse: r => (isRemoteAccessName(r.name) ? { op: 'remoteAccess.csr', name: r.name } : malformed('name')),
    run: async (ctx, r) => {
      const answer = await askConsoleRemote(ctx, 'remote-csr', { name: r.name })
      if (typeof answer.csr !== 'string' || !answer.csr.startsWith('-----BEGIN CERTIFICATE REQUEST-----')) {
        throw new Refusal('failed', `The Fleet Console on ${ctx.machine.name} gave no certificate request.`)
      }
      return { csr: answer.csr }
    },
  },

  'remoteAccess.on': {
    parse: r => ({
      op: 'remoteAccess.on', name: text(r.name, 'name', 253), port: typeof r.port === 'number' ? r.port : malformed('port'),
      certificate: text(r.certificate, 'certificate', 64 * 1024), until: text(r.until, 'end time', 64),
      allow: Array.isArray(r.allow) && r.allow.length <= 64 ? r.allow.map(a => text(a, 'allow list', 64)) : malformed('allow list'),
    }),
    run: async (ctx, r) => {
      const checked = checkRemoteAccessOn(r, ctx.now())
      if (!checked.ok) throw new Refusal('malformed', checked.message)
      const { op: _op, ...request } = checked.value
      // Before the Fleet Console is told anything: a port another holds would only fail once it is republished.
      await checkPorts(ctx, [{ port: request.port, part: 'remote-access', bind: EVERY_ADDRESS }])
      const answer = await askConsoleRemote(ctx, 'remote-on', request)
      if (answer.on !== true) throw new Refusal('failed', `The Fleet Console on ${ctx.machine.name} did not say remote access is on.`)
      keepRemoteAccess(ctx, { port: request.port, until: request.until })
      try {
        await republishConsole(ctx)
      } catch (err) {
        forgetRemoteAccess(ctx)
        await askConsoleRemote(ctx, 'remote-off', {}).catch(() => undefined)
        await republishConsole(ctx).catch(() => undefined)
        throw new Refusal('failed', `Port ${request.port} could not be opened for the Fleet Console on ${ctx.machine.name} (${err instanceof Error ? err.message : err}). Remote access is off.`)
      }
      resumeRemoteAccess(ctx)
      return { on: true, until: request.until }
    },
  },

  'remoteAccess.off': {
    parse: () => ({ op: 'remoteAccess.off' }),
    run: turnRemoteAccessOff,
  },

  'remoteAccess.authenticator.add': {
    parse: r => ({
      op: 'remoteAccess.authenticator.add', id: text(r.id, 'id', 64), secret: text(r.secret, 'secret', 256),
      recoveryCodeHashes: Array.isArray(r.recoveryCodeHashes) && r.recoveryCodeHashes.length <= 16
        ? r.recoveryCodeHashes.map(h => text(h, 'recovery codes', 64)) : malformed('recovery codes'),
      claimBefore: text(r.claimBefore, 'time to claim it by', 64),
    }),
    run: async (ctx, r) => {
      const checked = checkRemoteAuthenticator(r, ctx.now())
      if (!checked.ok) throw new Refusal('malformed', checked.message)
      const { op: _op, ...request } = checked.value
      const answer = await askConsoleRemote(ctx, 'remote-authenticator-add', request)
      if (typeof answer.added !== 'boolean') throw new Refusal('failed', `The Fleet Console on ${ctx.machine.name} gave no answer.`)
      return { added: answer.added }
    },
  },
}

/**
 * What this host service keeps of remote access on a machine Cloud runs: the port it publishes for the Fleet Console
 * and when that ends. The rest — the key, the chain, the allow list — is the Fleet Console's own. Past `until` it is
 * as if nothing were kept, so a compose file written after the end publishes nothing, even before the end is noticed.
 */
import fs from 'node:fs'
import type { Context } from '../service/context'

export type RemoteAccessKept = { port: number; until: string }

const FILE = ['remote-access', 'state.json'] as const

export function keptRemoteAccess(ctx: Context): RemoteAccessKept | null {
  const k = ctx.state.readJson(...FILE) as Partial<RemoteAccessKept> | null
  return k && typeof k.port === 'number' && typeof k.until === 'string' ? { port: k.port, until: k.until } : null
}

/** The port to publish now, or null. */
export function remoteAccessPort(ctx: Context): number | null {
  const k = keptRemoteAccess(ctx)
  return k && Date.parse(k.until) > ctx.now().getTime() ? k.port : null
}

export function keepRemoteAccess(ctx: Context, kept: RemoteAccessKept): void {
  ctx.state.writeJson([...FILE], kept)
}

export function forgetRemoteAccess(ctx: Context): void {
  fs.rmSync(ctx.state.path(...FILE), { force: true })
}

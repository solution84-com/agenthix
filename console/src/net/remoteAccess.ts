/**
 * Remote access to this Fleet Console on a machine Agenthix Cloud runs (pre-release spec B9, ADR-0132). Only the host
 * service asks for it, through the control socket, and only for Cloud's pinned controller on a machine enrolled with
 * Cloud; on an organisation's own machine nothing asks, and remote access through Cloud's relay keeps its own rule.
 *
 * - `csr` makes a key here, in the state folder at 0600 — it never leaves — and answers a request for that name.
 *   It is the next key: one in use keeps serving until a certificate for the new one arrives.
 * - `on` listens on `port` with the chain Cloud had issued for one of those keys, answers only the addresses in
 *   `allow`, and stops by itself at `until`, also after a restart (`start` reads what was kept). Asked again while
 *   on, it replaces all of it. Each time is announced in hq to the fleet admins and organisation admins.
 * - `off` stops now. Ending, either way, ends every session that came through it.
 */
import fs from 'node:fs'
import { createPrivateKey, X509Certificate } from 'node:crypto'
import type http from 'node:http'
import { BRANDING, checkRemoteAccessOn, isRemoteAccessName, type RemoteAccessOnRequest } from '@agenthix/core'
import type { Activity } from '../activity'
import type { StateFolder } from '../state/folder'
import { allowList } from './allowList'
import { certificateRequest, makeRemoteKey } from './csr'
import { startRemoteListener, type RemoteListener } from './remoteListener'

const DIR = 'remote-access'
const KEY = 'key.pem'
const NEXT_KEY = 'key.next.pem'
const STATE = 'state.json'

type Kept = Omit<RemoteAccessOnRequest, 'op'> & { startedAt: string }

export type RemoteAccessStatus = { on: false } | { on: true; name: string; port: number; until: string; allow: string[] }

export type RemoteAccessDeps = {
  state: StateFolder
  activity: Activity
  machineName: string
  now?: () => number
  /** Every session that came through remote access ends with it. */
  ended?: () => void
}

export class RemoteAccessError extends Error {}

export class RemoteAccess {
  private listener: RemoteListener | null = null
  private timer: NodeJS.Timeout | null = null
  private serving: { app: http.RequestListener; host: string } | null = null
  private readonly now: () => number

  constructor(private readonly deps: RemoteAccessDeps) {
    this.now = deps.now ?? Date.now
  }

  /** At start, once the app is ready: what was on before a restart comes back, unless its time has passed. */
  async start(app: http.RequestListener, host: string): Promise<void> {
    this.serving = { app, host }
    const kept = this.kept()
    if (!kept) return
    if (Date.parse(kept.until) <= this.now()) {
      this.forget()
      this.deps.ended?.()
      await this.deps.activity.record(null, 'remoteAccess.ended', this.endedSubject(), false)
      return
    }
    try {
      await this.listen(kept)
    } catch (err) {
      console.error(`[console] remote access did not come back after a restart: ${err instanceof Error ? err.message : err}`)
      this.forget()
      this.deps.ended?.()
    }
  }

  /** The process is stopping: the listener closes, and what was kept stays for the next start. */
  async stop(): Promise<void> {
    await this.stopListening()
  }

  status(): RemoteAccessStatus {
    const kept = this.listener ? this.kept() : null
    return kept ? { on: true, name: kept.name, port: kept.port, until: kept.until, allow: kept.allow } : { on: false }
  }

  csr(name: unknown): { csr: string } {
    if (!isRemoteAccessName(name)) throw new RemoteAccessError('The name is not a DNS name.')
    const key = makeRemoteKey()
    this.deps.state.writePrivate([DIR, NEXT_KEY], key)
    return { csr: certificateRequest(key, name) }
  }

  async on(raw: Record<string, unknown>): Promise<{ on: true; until: string }> {
    if (!this.serving) throw new RemoteAccessError('The Fleet Console is still starting.')
    const checked = checkRemoteAccessOn(raw, new Date(this.now()))
    if (!checked.ok) throw new RemoteAccessError(checked.message)
    const { op: _op, ...request } = checked.value
    this.takeKeyFor(request)
    const kept: Kept = { ...request, startedAt: new Date(this.now()).toISOString() }
    await this.stopListening()
    this.forget()
    await this.listen(kept)
    this.deps.state.writeJson([DIR, STATE], kept)
    await this.deps.activity.record(null, 'remoteAccess.on', this.onSubject(kept), true)
    return { on: true, until: kept.until }
  }

  async off(): Promise<{ on: false }> {
    const wasOn = this.listener !== null || this.kept() !== null
    await this.stopListening()
    this.forget()
    this.deps.ended?.()
    if (wasOn) await this.deps.activity.record(null, 'remoteAccess.off', `Remote access to the Fleet Console on ${this.deps.machineName} was turned off by ${BRANDING.displayName} Cloud.`, false)
    return { on: false }
  }

  /** The certificate must be for a key made here, name this name, and last until remote access ends. */
  private takeKeyFor(r: Omit<RemoteAccessOnRequest, 'op'>): void {
    let leaf: X509Certificate
    try {
      leaf = new X509Certificate(r.certificate)
    } catch {
      throw new RemoteAccessError('The certificate cannot be read.')
    }
    const now = this.now()
    if (Date.parse(leaf.validTo) <= now || Date.parse(leaf.validFrom) > now + 5 * 60_000) throw new RemoteAccessError('The certificate is not valid now.')
    if (Date.parse(leaf.validTo) < Date.parse(r.until)) throw new RemoteAccessError('The certificate ends before remote access would.')
    if (leaf.checkHost(r.name, { wildcards: false }) !== r.name) throw new RemoteAccessError(`The certificate is not for ${r.name}.`)
    const matches = (file: string) => {
      const pem = this.deps.state.readText(DIR, file)
      return pem !== null && leaf.checkPrivateKey(createPrivateKey(pem))
    }
    if (matches(NEXT_KEY)) {
      fs.renameSync(this.deps.state.path(DIR, NEXT_KEY), this.deps.state.path(DIR, KEY))
      return
    }
    if (!matches(KEY)) throw new RemoteAccessError('The certificate is not for the key made on this machine.')
  }

  private async listen(kept: Kept): Promise<void> {
    const key = this.deps.state.readText(DIR, KEY)
    if (!key || !this.serving) throw new RemoteAccessError('No key was made on this machine for remote access.')
    this.listener = await startRemoteListener({
      host: this.serving.host, port: kept.port, name: kept.name, key, certificate: kept.certificate,
      allow: allowList(kept.allow), app: this.serving.app,
    })
    // At most 8 hours away, well inside what a timer holds.
    this.timer = setTimeout(() => void this.endByItself(), Math.max(0, Date.parse(kept.until) - this.now()))
    this.timer.unref()
  }

  private async endByItself(): Promise<void> {
    await this.stopListening()
    this.forget()
    this.deps.ended?.()
    await this.deps.activity.record(null, 'remoteAccess.ended', this.endedSubject(), false)
  }

  private async stopListening(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const listener = this.listener
    this.listener = null
    await listener?.close()
  }

  private kept(): Kept | null {
    const k = this.deps.state.readJson(DIR, STATE) as Kept | null
    return k && typeof k.until === 'string' && typeof k.port === 'number' && typeof k.name === 'string' &&
      typeof k.certificate === 'string' && Array.isArray(k.allow) ? k : null
  }

  private forget(): void {
    fs.rmSync(this.deps.state.path(DIR, STATE), { force: true })
  }

  private onSubject(k: Kept): string {
    return `Remote access to the Fleet Console on ${this.deps.machineName} was turned on by ${BRANDING.displayName} Cloud, ` +
      `at https://${k.name}:${k.port}, until ${k.until}, for ${k.allow.join(', ')}. Signing in through it needs an HQ login of a fleet admin and an authenticator code.`
  }

  private endedSubject(): string {
    return `Remote access to the Fleet Console on ${this.deps.machineName} ended at the time it was set to end.`
  }
}

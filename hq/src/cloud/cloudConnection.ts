/**
 * hq's connection to Agenthix Cloud (spec part C, C1): asking for one and waiting on its approval, the record of the
 * connection once made, access tokens signed for as they are needed and to check in hourly, and disconnecting.
 *
 * - **Its key** is made the first time a connection is asked for, kept with hq's encrypted secrets, and destroyed
 *   when the connection ends, so a key that was revoked is never offered again: the next connection has a new one.
 * - **A request waiting on approval** lives in this process only, with the device code it is polled with. hq polls at
 *   the interval Cloud gave and slows down when told to. A restart forgets it, and the admin asks again.
 * - **Access tokens** are kept in memory until shortly before they lapse, and never stored.
 * - **While connected, hq checks in**: it signs for a token whenever 55 minutes pass without one, which Cloud reads as
 *   hq being alive, so a quiet hq is not taken for one that stopped, and one Cloud disconnected learns it within the
 *   hour. At start-up a stored connection checks in at once.
 * - **hq's address** is the only place Cloud sends a sign-in back to (core/src/cloud/hqAddress.ts). It goes with the
 *   connection request, or with the key on a machine Cloud runs; at a check-in, hq tells Cloud its address whenever it
 *   is not the one it last registered in this process, so a restart with a new `HQ_URL` moves sign-ins with it.
 * - **hq never calls Cloud** unless it is asking for a connection or is connected.
 * - **On a machine Cloud runs**, Cloud makes the connection with no code to approve (adr-0135): it asks for the key
 *   and registers it itself, and hq keeps the connection only once its key signs for a token.
 *
 * Every change runs one at a time, so an approval arriving while an admin disconnects cannot bring the connection back.
 */
import {
  CLOUD_CHECK_IN_INTERVAL_S, CLOUD_CHECK_IN_RETRY_S, cloudHqAddressOf,
  type CloudConnectEnded, type CloudConnecting, type CloudDowntimeNotice, type CloudOrganisationConnection, type CloudPledgeStatus, type HqCloudState,
} from '@agenthix/core'
import { cloudClientIdOf, type CloudConnectionKeys } from '@agenthix/core/cloud-crypto'
import { CloudBusyError, CloudCallError, CloudProtocolError, type CloudClientApi, type CloudCodeExchange, type CloudCodeOutcome } from './cloudClient'

export type StoredCloudConnection = CloudOrganisationConnection & { clientId: string }

export type CloudConnectionStore = {
  read(): Promise<StoredCloudConnection | null>
  write(connection: StoredCloudConnection): Promise<void>
  clear(): Promise<void>
}

export type CloudKeyStore = {
  read(): Promise<CloudConnectionKeys | null>
  create(): Promise<CloudConnectionKeys>
  clear(): Promise<void>
}

export type CloudConnectionDeps = {
  client: CloudClientApi
  connections: CloudConnectionStore
  keys: CloudKeyStore
  /** The address people open hq at, and the organisation's name, which Cloud shows on its approval page. */
  about: () => Promise<{ organisationName: string; address: string }>
  /** Told once a connection is made or ended, for the fleet's record; never given a secret. */
  /** `byUserId` null: Cloud made it, on a machine it runs. */
  onConnected?: (connection: CloudOrganisationConnection, byUserId: string | null) => Promise<void>
  onDisconnected?: (connection: CloudOrganisationConnection, byUserId: string | null) => Promise<void>
  /**
   * Told as the connection ends, before it is revoked when an admin ends it (after, when Cloud did), so the people who
   * sign in with Cloud hear first. A failure here never stops the disconnect.
   */
  onEnding?: () => Promise<void>
  now?: () => number
  schedule?: (run: () => void, ms: number) => () => void
}

/** A refusal for a person: already connected, or Cloud did not answer as it should. */
export class CloudConnectionError extends Error {}

type Waiting = {
  deviceCode: string
  /** The address the request carried, which Cloud registers on approval. */
  address: string
  connecting: CloudConnecting
  expiresAt: number
  intervalMs: number
  byUserId: string | null
  failedLastPoll: boolean
  cancel: () => void
}

/** A token is used only while it has more than this left, so a call made with it does not fail midway. */
const TOKEN_MARGIN_MS = 60_000
/** At most this long passes without a token signed for while connected; Cloud reads each as hq checking in. */
export const CHECK_IN_MS = CLOUD_CHECK_IN_INTERVAL_S * 1000
const CHECK_IN_RETRY_MS = CLOUD_CHECK_IN_RETRY_S * 1000
const BAD_ADDRESS = 'HQ\'s address (HQ_URL) is not one Agenthix Cloud can send people back to after they sign in: it must be http or https, with no query.'

const defaultSchedule = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms)
  timer.unref?.()
  return () => clearTimeout(timer)
}

export class CloudConnection {
  private waiting: Waiting | null = null
  private lastAttempt: CloudConnectEnded | null = null
  private token: { value: string; expiresAt: number } | null = null
  private tokenInFlight: Promise<string | null> | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private cancelCheckIn: () => void = () => undefined
  /** The address Cloud was last given in this process; null until then, so each start tells it once. */
  private registeredAddress: string | null = null
  private readonly now: () => number
  private readonly schedule: (run: () => void, ms: number) => () => void

  constructor(private readonly deps: CloudConnectionDeps) {
    this.now = deps.now ?? Date.now
    this.schedule = deps.schedule ?? defaultSchedule
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work)
    this.queue = run.catch(() => undefined)
    return run
  }

  async state(): Promise<Omit<HqCloudState, 'runByCloud'>> {
    const stored = await this.deps.connections.read()
    return {
      connection: stored ? publicPart(stored) : null,
      connecting: this.waiting?.connecting ?? null,
      lastAttempt: stored || this.waiting ? null : this.lastAttempt,
      problem: this.deps.client.protocolProblem(),
    }
  }

  /** `byUserId` null: asked from hq's machine, by its machine admin. */
  connect(byUserId: string | null): Promise<CloudConnecting> {
    return this.serial(async () => {
      if (await this.deps.connections.read()) throw new CloudConnectionError('HQ is connected to Agenthix Cloud already.')
      if (this.waiting && this.waiting.expiresAt > this.now()) return this.waiting.connecting
      this.endWaiting()
      const { organisationName, address } = await this.about()
      const keys = (await this.deps.keys.read()) ?? (await this.deps.keys.create())
      const answer = await this.deps.client.requestConnection(keys.publicKey, address, organisationName)
      const expiresAt = this.now() + answer.expires_in * 1000
      const connecting: CloudConnecting = {
        userCode: answer.user_code,
        verificationUri: answer.verification_uri,
        verificationUriComplete: answer.verification_uri_complete,
        expiresAt: new Date(expiresAt).toISOString(),
      }
      const waiting: Waiting = {
        deviceCode: answer.device_code, address, connecting, expiresAt, intervalMs: answer.interval * 1000, byUserId,
        failedLastPoll: false, cancel: () => undefined,
      }
      this.waiting = waiting
      this.lastAttempt = null
      this.pollLater(waiting)
      return connecting
    })
  }

  /**
   * Cloud's first step on a machine it runs: the key it registers, made if there is none, and the address it registers
   * with it. A waiting request ends.
   */
  keyForCloud(): Promise<{ publicKey: string; clientId: string; hqAddress: string }> {
    return this.serial(async () => {
      if (await this.deps.connections.read()) throw new CloudConnectionError('HQ is connected to Agenthix Cloud already.')
      const { address } = await this.about()
      this.endWaiting()
      const keys = (await this.deps.keys.read()) ?? (await this.deps.keys.create())
      this.registeredAddress = address
      return { publicKey: keys.publicKey, clientId: await cloudClientIdOf(keys.publicKey), hqAddress: address }
    })
  }

  private async about(): Promise<{ organisationName: string; address: string }> {
    const { organisationName, address } = await this.deps.about()
    const normalised = cloudHqAddressOf(address)
    if (!normalised) throw new CloudConnectionError(BAD_ADDRESS)
    return { organisationName, address: normalised }
  }

  /**
   * Cloud's second step, once it registered the key: kept only when the key signs for a token, which proves Cloud
   * took it. Asked again for the same organisation it answers the connection it has.
   */
  connectedByCloud(organisation: { cloudOrganisationId: string; name: string }): Promise<CloudOrganisationConnection> {
    return this.serial(async () => {
      const stored = await this.deps.connections.read()
      if (stored) {
        if (stored.cloudOrganisationId === organisation.cloudOrganisationId) return publicPart(stored)
        throw new CloudConnectionError('HQ is connected to another Agenthix Cloud organisation.')
      }
      const keys = await this.deps.keys.read()
      if (!keys) throw new CloudConnectionError('HQ has no connection key to connect with. Ask for it first.')
      const outcome = await this.deps.client.token(keys)
      if (outcome.kind === 'revoked') throw new CloudConnectionError('Agenthix Cloud has not registered HQ\'s key.')
      const connection: StoredCloudConnection = {
        ...organisation, connectedAt: new Date(this.now()).toISOString(), clientId: await cloudClientIdOf(keys.publicKey),
      }
      await this.deps.connections.write(connection)
      this.keepToken(outcome.token.access_token, outcome.token.expires_in)
      this.endWaiting()
      this.lastAttempt = null
      await this.deps.onConnected?.(publicPart(connection), null)
      return publicPart(connection)
    })
  }

  disconnect(byUserId: string | null): Promise<boolean> {
    return this.serial(async () => {
      if (this.waiting) {
        this.endWaiting()
        this.lastAttempt = null
        if (!(await this.deps.connections.read())) await this.deps.keys.clear()
        return true
      }
      const stored = await this.deps.connections.read()
      if (!stored) return false
      await this.deps.onEnding?.().catch(() => undefined)
      const keys = await this.deps.keys.read()
      if (keys) {
        // Destroying the key below ends the connection whatever Cloud says; asking Cloud first lets it know now.
        await this.deps.client.revoke(keys).catch(() => undefined)
      }
      await this.forget()
      await this.deps.onDisconnected?.(publicPart(stored), byUserId)
      return true
    })
  }

  /**
   * A short-lived access token for a call to Cloud, signed for when the one held is close to lapsing. Null when hq is
   * not connected, or Cloud says the connection was ended from its side, which hq then forgets.
   */
  accessToken(): Promise<string | null> {
    if (this.token && this.token.expiresAt - TOKEN_MARGIN_MS > this.now()) return Promise.resolve(this.token.value)
    this.tokenInFlight ??= this.serial(() => this.signForToken()).finally(() => { this.tokenInFlight = null })
    return this.tokenInFlight
  }

  private async signForToken(): Promise<string | null> {
    const stored = await this.deps.connections.read()
    const keys = stored ? await this.deps.keys.read() : null
    if (!stored || !keys) return null
    const outcome = await this.deps.client.token(keys)
    if (outcome.kind === 'revoked') {
      await this.endedByCloud(stored)
      return null
    }
    this.keepToken(outcome.token.access_token, outcome.token.expires_in)
    return outcome.token.access_token
  }

  /** At start-up: a stored connection checks in at once, and from then on within every hour. */
  startCheckIns(): Promise<void> {
    return this.checkIn()
  }

  private checkIn(): Promise<void> {
    return this.serial(async () => {
      try {
        if (await this.signForToken()) await this.tellAddress()
      } catch (err) {
        // Cloud away or busy: the connection stays, and hq checks in again shortly, or once Cloud says it may.
        const wait = err instanceof CloudBusyError ? Math.max(CHECK_IN_RETRY_MS, err.retryAt - this.now()) : CHECK_IN_RETRY_MS
        if (await this.deps.connections.read().then(Boolean, () => true)) this.checkInLater(wait)
      }
    })
  }

  /** Tells Cloud hq's address when it is not the one Cloud was last given. */
  private async tellAddress(): Promise<void> {
    const address = cloudHqAddressOf((await this.deps.about()).address)
    const stored = await this.deps.connections.read()
    const keys = stored ? await this.deps.keys.read() : null
    if (!address || address === this.registeredAddress || !stored || !keys) return
    if ((await this.deps.client.registerAddress(keys, address)) === 'revoked') return this.endedByCloud(stored)
    this.registeredAddress = address
  }

  private checkInLater(ms: number): void {
    this.cancelCheckIn()
    this.cancelCheckIn = this.schedule(() => void this.checkIn(), ms)
  }

  private async endedByCloud(stored: StoredCloudConnection): Promise<void> {
    await this.forget()
    await this.deps.onEnding?.().catch(() => undefined)
    await this.deps.onDisconnected?.(publicPart(stored), null)
  }

  /** The client id the connection registered, which a sign-in names; null when not connected. */
  async clientId(): Promise<string | null> {
    return (await this.deps.connections.read())?.clientId ?? null
  }

  /** A sign-in's code exchanged for its ID token, the request signed with hq's key. */
  exchangeSignInCode(exchange: CloudCodeExchange): Promise<CloudCodeOutcome | { kind: 'notConnected' }> {
    return this.serial(async () => {
      const stored = await this.deps.connections.read()
      const keys = stored ? await this.deps.keys.read() : null
      if (!stored || !keys) return { kind: 'notConnected' as const }
      const outcome = await this.deps.client.exchangeCode(keys, exchange)
      if (outcome.kind === 'revoked') await this.endedByCloud(stored)
      return outcome
    })
  }

  /** Asks Cloud to email members about a scheduled change; `notConnected` when hq is not, and so asks nothing. */
  async sendDowntimeNotice(notice: CloudDowntimeNotice): Promise<'sent' | 'notConnected'> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken()
      if (!token) return 'notConnected'
      if ((await this.deps.client.sendDowntimeNotice(token, notice)) === 'sent') return 'sent'
      // Not taken: sign for a fresh token and try once more.
      if (this.token?.value === token) this.token = null
    }
    throw new CloudCallError('Agenthix Cloud did not take HQ\'s access token.')
  }

  /** Whether a linked person signed the pledge; null when hq is not connected or Cloud knows no such link. */
  async pledgeStatus(subject: string): Promise<CloudPledgeStatus | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken()
      if (!token) return null
      const answer = await this.deps.client.pledgeStatus(token, subject)
      if (answer === 'notLinked') return null
      if (answer !== 'unauthorized') return answer
      if (this.token?.value === token) this.token = null
    }
    throw new CloudCallError('Agenthix Cloud did not take HQ\'s access token.')
  }

  private keepToken(value: string, expiresInSeconds: number): void {
    this.token = { value, expiresAt: this.now() + expiresInSeconds * 1000 }
    this.checkInLater(CHECK_IN_MS)
  }

  private async forget(): Promise<void> {
    this.token = null
    this.registeredAddress = null
    this.cancelCheckIn()
    await this.deps.connections.clear()
    await this.deps.keys.clear()
  }

  private endWaiting(): void {
    this.waiting?.cancel()
    this.waiting = null
  }

  private pollLater(waiting: Waiting, ms = waiting.intervalMs): void {
    waiting.cancel = this.schedule(() => {
      void this.serial(() => this.poll(waiting)).catch(() => {
        // A store that failed: the request ends rather than polling on with nothing to keep the answer in.
        if (this.waiting === waiting) this.endAttempt('failed')
      })
    }, ms)
  }

  private async poll(waiting: Waiting): Promise<void> {
    if (this.waiting !== waiting) return
    if (this.now() >= waiting.expiresAt) return this.endAttempt(waiting.failedLastPoll ? 'failed' : 'expired')
    const keys = await this.deps.keys.read()
    if (!keys) return this.endAttempt('failed')
    let outcome
    try {
      outcome = await this.deps.client.poll(keys, waiting.deviceCode)
    } catch (err) {
      if (!(err instanceof CloudCallError)) throw err
      // Polling on cannot help: the request cannot be completed by a Cloud that does not speak hq's version.
      if (err instanceof CloudProtocolError) return this.endAttempt('failed')
      if (err instanceof CloudBusyError) return this.pollLater(waiting, Math.max(waiting.intervalMs, err.retryAt - this.now()))
      // Cloud may be briefly away: keep asking until the request lapses, a little slower each time it fails.
      waiting.failedLastPoll = true
      waiting.intervalMs = Math.min(waiting.intervalMs * 2, 60_000)
      return this.pollLater(waiting)
    }
    waiting.failedLastPoll = false
    switch (outcome.kind) {
      case 'pending': return this.pollLater(waiting)
      case 'slowDown':
        waiting.intervalMs += 5_000
        return this.pollLater(waiting)
      case 'refused': return this.endAttempt('refused')
      case 'expired': return this.endAttempt('expired')
      case 'approved': {
        const { approved } = outcome
        if (approved.client_id !== (await cloudClientIdOf(keys.publicKey))) return this.endAttempt('failed')
        const connection: StoredCloudConnection = {
          cloudOrganisationId: approved.cloud_organisation.id,
          name: approved.cloud_organisation.name,
          connectedAt: new Date(this.now()).toISOString(),
          clientId: approved.client_id,
        }
        await this.deps.connections.write(connection)
        this.keepToken(approved.access_token, approved.expires_in)
        this.registeredAddress = waiting.address
        this.waiting = null
        this.lastAttempt = null
        await this.deps.onConnected?.(publicPart(connection), waiting.byUserId)
      }
    }
  }

  private endAttempt(how: CloudConnectEnded): void {
    this.waiting = null
    this.lastAttempt = how
  }
}

function publicPart(stored: StoredCloudConnection): CloudOrganisationConnection {
  return { cloudOrganisationId: stored.cloudOrganisationId, name: stored.name, connectedAt: stored.connectedAt }
}

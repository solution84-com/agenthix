/**
 * In-container credential verification and the credential home's bookkeeping —
 * split out of AgentContainerManager.ts (5d-1 hygiene fixup).
 *
 * Severed from hq/src/agents/runtime/agentCredentials.ts (phase 5d-2):
 * `checkAgentCredentials` used to call hq's own providerService.getLlmApiKey
 * directly; the run's credential now arrives decided at dispatch
 * (RunContextPayload.credential) and is passed in explicitly by the caller
 * (AgentContainerManager, threaded from ContainerContext.credential).
 *
 * SC-349 (phase 5d-2): `checkAgentCredentials` surfaces a dead grant (expired
 * or missing) to hq admins via the `site.credentialHealth` one-way event,
 * throttled per (handle, state), as well as failing the run.
 *
 * The seeding half of SC-349 is gone. Its pair — copy the site's one shared
 * operator login into a per-agent home before each start, promote whatever the
 * container refreshed back onto that shared login afterwards — existed because
 * a site's own disk was the only holder of a Claude login. hq holds the
 * credential now and decides per run which one a run may use (ADR-0060), so
 * the home is keyed by the run's boundary and written from the dispatched
 * document (boundaryClaudeHome.ts), and a refresh goes back to hq against the
 * run's grant (subscriptionLogins.ts) rather than onto a shared file. Freshest-wins
 * survives in both directions; the shared seed it arbitrated does not.
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { CredentialHealthEvent, RunCredential } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { hqConnectionManager } from '../../server/hq/hqConnection'
import { CLAUDE_SDK_RUNTIME } from './types'
import { KeyedAsyncQueue } from './runQueue'
import type { ContainerKey } from './containerTypes'

const logger = new Logger('AgentContainerManager')

/**
 * The `claudeAiOauth.expiresAt` an already-read credentials document carries,
 * or `0` — "as stale as it's possible to be" — when it doesn't parse or
 * carries no usable one. The credential-file layout is Claude Code's own OAuth
 * file shape: `{ claudeAiOauth: { expiresAt: <epoch ms>, ... } }`.
 *
 * Split from the file read below so a caller holding the document already —
 * `writeRunCredential`, comparing what hq dispatched against what the home
 * holds — derives `expiresAt` from that same string rather than a second,
 * possibly-drifting parse.
 */
export function parseCredentialExpiresAt(raw: string): number {
  try {
    const parsed = JSON.parse(raw)
    const expiresAt = parsed?.claudeAiOauth?.expiresAt
    return typeof expiresAt === 'number' && Number.isFinite(expiresAt) ? expiresAt : 0
  } catch {
    return 0
  }
}

/**
 * The same value read off a file. FILE ABSENT (ENOENT) returns `null` —
 * "nothing here at all", distinct from a file that exists but carries no
 * usable `expiresAt`. An unreadable file (permission error, `EISDIR`, etc.) or
 * a present-but-unparseable one both fold to `0`: as stale as possible, but
 * still a REAL file.
 *
 * The null/0 split is what lets `writeRunCredential` tell "this home has no
 * credential yet, write whatever we were given" apart from "this home holds
 * something staler than what we were given" — folding both to `0` made a
 * present-but-unparseable document indistinguishable from an empty home, and
 * a `0 <= 0` comparison then wrote nothing at all.
 */
export async function readCredentialExpiresAt(filePath: string): Promise<number | null> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (err: any) {
    return err?.code === 'ENOENT' ? null : 0
  }
  return parseCredentialExpiresAt(raw)
}

async function readCredentialDocument(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

function hasRefreshToken(raw: string): boolean {
  try {
    const token = JSON.parse(raw)?.claudeAiOauth?.refreshToken
    return typeof token === 'string' && token.length > 0
  } catch {
    return false
  }
}

/**
 * Homes whose refreshed token never reached hq. The end-of-run removal of a
 * home's credential (`clearRunCredential`) spares a home listed here, once, so
 * a token that exists nowhere else is not destroyed with the run that made it.
 * In memory on purpose: a site restart loses the list and the next run's own
 * write-or-clear settles the file, the same way every other in-memory guard in
 * this runtime is settled.
 */
const unreportedRefreshHomes = new Set<string>()

export function holdUnreportedCredential(home: string): void {
  unreportedRefreshHomes.add(home)
}

/** True once per hold: the removal that spares the file is the one that consumes it. */
export function takeUnreportedCredentialHold(home: string): boolean {
  return unreportedRefreshHomes.delete(home)
}

/**
 * Runs currently using each Claude home, beside the hold above and for the same
 * end-of-run removal (spec §2, ADR-0075). Runs are no longer queued behind each
 * other, so several can use one home at once, and the first to end must not
 * take the credential away from under the rest: it leaves only when the LAST
 * run using the home ends.
 *
 * A run is counted from the moment its launch names its home — before its
 * credential is written — so a run still arriving holds the document as surely
 * as one already running. Keyed on the home, not the container: the home is
 * what the document lives in, and more than one container can bind one home.
 * In memory, like the hold: a restart ends every run it counted.
 */
const credentialHomeRuns = new Map<string, number>()

export function enterCredentialHome(home: string): void {
  credentialHomeRuns.set(home, (credentialHomeRuns.get(home) ?? 0) + 1)
}

/** True when this was the last run using the home — the one whose end may remove the credential. */
export function leaveCredentialHome(home: string): boolean {
  const remaining = (credentialHomeRuns.get(home) ?? 0) - 1
  if (remaining > 0) {
    credentialHomeRuns.set(home, remaining)
    return false
  }
  credentialHomeRuns.delete(home)
  return true
}

export function credentialHomeInUse(home: string): boolean {
  return credentialHomeRunCount(home) > 0
}

/**
 * How many runs are using the home, the asking run included once its launch
 * has named it. The write at launch reads this: a run granted no subscription
 * must not remove the document a run still going in the same home was granted.
 */
export function credentialHomeRunCount(home: string): number {
  return credentialHomeRuns.get(home) ?? 0
}

/**
 * One file operation at a time per home. The count makes the DECISION to remove
 * safe — it is taken and checked synchronously — but the removal itself is
 * disk work that can still be in flight when the next run arrives and writes
 * its own document. The removal runs through this and checks the count again
 * once its turn comes, so an arrival that landed in between keeps what it
 * wrote; the write at launch (`writeRunCredential`) belongs in it too, so that
 * a removal already in flight finishes before the write starts.
 */
const credentialHomeOps = new KeyedAsyncQueue()

export function serialiseCredentialHome<T>(home: string, work: () => Promise<T>): Promise<T> {
  return credentialHomeOps.enqueue(home, work)
}

/**
 * Throttles the admin-visible `site.credentialHealth` event to once per
 * (agentHandle, state) per hour — a stuck expired/missing grant would
 * otherwise fire on every run of a busy agent. The throw in
 * `checkAgentCredentials` is the primary, un-throttled signal (it fails the
 * run every time); this event is purely the admin-visible surface, and
 * `hqConnectionManager.sendEvent` already drops silently when the channel is
 * closed (see its own doc comment) — so a dead grant on a disconnected site
 * still fails every run, it just doesn't reach hq until reconnect.
 */
const CREDENTIAL_HEALTH_THROTTLE_MS = 60 * 60 * 1000
const credentialHealthLastSent = new Map<string, number>()

function sendCredentialHealthEvent(agentHandle: string, state: CredentialHealthEvent['state'], detail: string): void {
  const key = `${agentHandle}:${state}`
  const now = Date.now()
  const last = credentialHealthLastSent.get(key)
  if (last !== undefined && now - last < CREDENTIAL_HEALTH_THROTTLE_MS) return
  credentialHealthLastSent.set(key, now)
  const payload: CredentialHealthEvent = { agentHandle, state, detail }
  hqConnectionManager.sendEvent('site.credentialHealth', payload)
}

// Promisify-style wrapper — avoids `node:child_process/promises` which doesn't exist.
// Using a local helper (not util.promisify) so the import can be mocked in tests.
function docker(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('docker', args, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    })
  })
}

/**
 * What to tell the person, per credential kind. The old text named a
 * `docker run … claude login` command against the site's shared operator
 * login, which was wrong twice over once the credential arrives per run: the
 * person reading a failed run is not on the execution machine and cannot run
 * it, and a run that was supposed to use a named person's own subscription
 * must not be repaired by logging the site's operator in again — that is how one
 * person's work ends up on another's account.
 *
 * The no-credential branch names the boundary this run acts for, the same way
 * `runLaunch`'s own no-credential failure does, so a person meets one
 * vocabulary rather than two. *
 * Reached defensively rather than routinely: `runLaunch` already fails a
 * Claude SDK run with no credential before any container is prepared, and a
 * run on any other runtime does not probe at all, so nothing in a normal run arrives here
 * with `null`. It still has to be true.
 */
function remediation(credential: RunCredential | null, key: ContainerKey): string {
  if (credential?.kind === 'subscription') {
    return 'The subscription login this run was given is not usable. Open your own settings, sign in to your subscription again, and run this again.'
  }
  const boundary = key.ownerType === 'project' ? 'project' : 'person'
  return `This run was given no model credential of its own. Add an API key for the ${boundary} it acts for, `
    + 'or a subscription login on your own settings page, and run this again.'
}

/**
 * Verify OAuth credentials exist inside a running container, and — SC-349 —
 * that they haven't expired.
 *
 * The question this asks is whether the run needs OAuth files at all, which is
 * decided by the RUNTIME and the KIND of credential it was given rather than
 * by whether a key string is non-empty (spec §6.3).
 *
 * Only a Claude SDK run probes. The OpenCode runtime reaches its providers
 * with an API key and makes its own check — asking it for a Claude
 * Code OAuth document it never reads would refuse runs that work. It used to
 * pass by accident, on an upgraded install where the site's shared operator
 * login had been copied into every agent's home; nothing is copied anywhere
 * now, so the accident became a refusal and the gate makes the rule explicit.
 *
 * Within an SDK run, an API key authenticates it on its own and needs no OAuth
 * files, so the probe is skipped for that too. Every other case probes: a
 * subscription login is itself an OAuth document, and an SDK run with no
 * credential at all never reaches here — runLaunch.ts fails it first, naming
 * the boundary it was for.
 *
 * The container's `/home/appuser/.claude` is the SAME directory as `home`
 * (bind-mounted, not copied — see AgentContainerManager._start's
 * sharedMountArgs), so once the in-container existence probe passes, reading
 * the host path for `expiresAt` reads exactly what's mounted in — no second
 * exec needed. `home` is the boundary's, never an agent's: `agentHandle` is
 * carried alongside it only to label the admin-visible health event.
 */
export async function checkAgentCredentials(args: {
  home: string
  key: ContainerKey
  containerName: string
  credential: RunCredential | null
  agentHandle: string
  runtime: string
}): Promise<void> {
  const { home, key, containerName, credential, agentHandle, runtime } = args
  if (runtime !== CLAUDE_SDK_RUNTIME) return
  if (credential?.kind === 'apiKey') return

  const advice = remediation(credential, key)

  try {
    await docker(['exec', containerName, 'test', '-f', '/home/appuser/.claude/.credentials.json'])
  } catch {
    sendCredentialHealthEvent(agentHandle, 'missing', `No OAuth credentials file found in agent container "${containerName}".`)
    throw new Error(`OAuth credentials not found in agent container "${containerName}". ${advice}`)
  }

  const document = await readCredentialDocument(path.join(home, '.credentials.json'))
  const expiresAt = document === null ? 0 : parseCredentialExpiresAt(document)
  // An expired access token is not an expired login: Claude Code renews it from
  // the refresh token when it starts. Only a document with nothing to renew from
  // is refused here.
  if (expiresAt > 0 && expiresAt < Date.now() && !(document !== null && hasRefreshToken(document))) {
    const detail = `Credential used by @${agentHandle} expired at ${new Date(expiresAt).toISOString()}.`
    sendCredentialHealthEvent(agentHandle, 'expired', detail)
    throw new Error(`OAuth credentials expired for agent container "${containerName}". ${advice}`)
  }
}

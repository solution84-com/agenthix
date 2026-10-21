/**
 * Cloud's controller on this machine, from the start-up settings (pre-release spec B2): with no `CLOUD_URL`
 * nothing here runs. Enrolled already, the machine dials Cloud's link. Otherwise it enrols with the one-time code from
 * its file — unless a Fleet Console is pinned — and spends the code whatever the outcome; only a connection that never
 * opened is tried again, while the code is still within its hour. Why it is not enrolled is kept for `agenthix status`
 * and logged, never with the code.
 */
import { formatFingerprint, type CloudResult } from '@agenthix/core'
import { EnvelopeReplayGuard, fingerprintOf, type HostKeys } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'
import type { CloudSettings } from '../config'
import type { Dial } from '../link/socket'
import { cloudEnrolmentRefusal, pinCloudController, readCloudBinding } from '../link/cloudController'
import { readEnrolmentCode, spendEnrolmentCode } from './codeFile'
import { enrolWithCloud, type EnrolFailure } from './enrol'
import { cloudEnvelopeHandler } from './envelopes'
import { CloudLink } from './link'

const PROBLEM = ['link', 'cloud-enrolment.json']
const RETRY_MS = 60_000

export type CloudDeps = {
  state: StateFolder
  settings: CloudSettings | null
  keys: () => Promise<HostKeys>
  machineName: string
  dial: Dial
  operate: (request: unknown) => Promise<CloudResult>
  log: (line: string) => void
  now: () => Date
  sleep: (ms: number) => Promise<void>
  /** Root's, but for tests. */
  codeOwnerUid?: number
  retryMs?: number
  firstFrameMs?: number
  /** A fresh one by default, which refuses what was sent before this process started (core's replay.ts). */
  replay?: EnvelopeReplayGuard
}

export type CloudStatus =
  | { enrolled: true; machineId: string; fingerprint: string; since: string; connected: boolean }
  | { enrolled: false; problem: string | null; at: string | null }

let current: CloudLink | null = null

/** Why a Cloud address will not be dialled; null when it will. Only https, but on this machine itself. */
export function cloudAddressProblem(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'it is not an address'
  }
  if (u.protocol === 'https:') return null
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')) return null
  return 'it must be an https address'
}

/** Kept for `agenthix status`; logged when it changes, so a try each minute does not fill the log. */
function noteProblem(d: CloudDeps, problem: string | null): void {
  const before = d.state.readJson(...PROBLEM) as { problem?: unknown } | null
  d.state.writeJson(PROBLEM, { problem, at: d.now().toISOString() })
  if (problem && before?.problem !== problem) d.log(`This machine is not enrolled with Agenthix Cloud: ${problem}.`)
}

const FAILURE: Record<EnrolFailure, string> = {
  notAccepted: 'Cloud did not take the connection',
  refused: 'Cloud refused the enrolment',
  expired: 'the enrolment code expired',
  used: 'Cloud says the enrolment code was already used',
  badBinding: 'Cloud\'s answer did not prove it holds the enrolment code, so nothing was pinned',
  malformed: 'Cloud\'s answer could not be read, so nothing was pinned',
  closed: 'Cloud closed the connection before it answered',
}

/** One try at enrolling. `retry` only when a later try may succeed with the same file. */
async function enrolOnce(d: CloudDeps, settings: CloudSettings): Promise<'enrolled' | 'retry' | 'stop'> {
  const refusal = cloudEnrolmentRefusal(d.state)
  if (refusal) return noteProblem(d, refusal.message.replace(/\.$/, '')), 'stop'
  const file = settings.enrolmentCodeFile
  if (!file) return noteProblem(d, 'no enrolment code file is set (CLOUD_ENROLMENT_CODE_FILE)'), 'stop'
  const read = await readEnrolmentCode(d.state, file, d.now().getTime(), d.codeOwnerUid)
  if (!read.ok) {
    if (read.spend) spendEnrolmentCode(d.state, file, read.lookup, d.log)
    noteProblem(d, read.problem)
    return read.spend ? 'stop' : 'retry'
  }
  const outcome = await enrolWithCloud({
    cloudUrl: settings.url, code: read.code, lookup: read.lookup, machineId: settings.machineId, keys: await d.keys(),
    machineName: d.machineName, dial: d.dial, now: d.now, timeoutMs: read.expiresAt - d.now().getTime(),
  })
  if (!outcome.ok && outcome.reason === 'notAccepted' && d.now().getTime() < read.expiresAt) {
    noteProblem(d, `${FAILURE.notAccepted}; trying again while the code lasts`)
    return 'retry'
  }
  spendEnrolmentCode(d.state, file, read.lookup, d.log)
  if (!outcome.ok) return noteProblem(d, FAILURE[outcome.reason]), 'stop'
  const pinned = await pinCloudController(d.state, outcome.binding)
  if (!pinned.ok) return noteProblem(d, pinned.refusal.message.replace(/\.$/, '')), 'stop'
  noteProblem(d, null)
  d.log(`Enrolled with Agenthix Cloud as machine ${outcome.binding.machineId}; Cloud's identity ${formatFingerprint(await fingerprintOf(outcome.binding.identity))} is pinned.`)
  return 'enrolled'
}

/** Starts Cloud's link, enrolling first when needed; null when the machine is not set up for Cloud. */
export function startCloud(d: CloudDeps): { link: CloudLink; stop: () => void; enrolled: Promise<boolean> } | null {
  const settings = d.settings
  if (!settings) return null
  const problem = cloudAddressProblem(settings.url)
  if (problem) {
    noteProblem(d, `Cloud's address ${settings.url} is not used: ${problem}`)
    return null
  }
  let stopped = false
  const link: CloudLink = new CloudLink({
    state: d.state, dial: d.dial, cloudUrl: settings.url, log: d.log, firstFrameMs: d.firstFrameMs,
    onEnvelope: cloudEnvelopeHandler({
      state: d.state, keys: d.keys, replay: d.replay ?? new EnvelopeReplayGuard(), operate: d.operate,
      send: e => link.sendEnvelope(e), now: () => d.now().getTime(), log: d.log,
    }),
  })
  current = link
  const enrolled = (async () => {
    while (!stopped && !readCloudBinding(d.state)) {
      const r = await enrolOnce(d, settings).catch(err => {
        noteProblem(d, `enrolment failed: ${err instanceof Error ? err.message : String(err)}`)
        return 'stop' as const
      })
      if (r !== 'retry') break
      await d.sleep(d.retryMs ?? RETRY_MS)
    }
    const ok = !stopped && !!readCloudBinding(d.state)
    if (ok) link.start()
    return ok
  })()
  return {
    link,
    enrolled,
    stop: () => {
      stopped = true
      link.stop()
      if (current === link) current = null
    },
  }
}

/** For `agenthix status`: null on a machine not set up for Cloud and never enrolled. */
export async function cloudStatus(state: StateFolder, settings: CloudSettings | null): Promise<CloudStatus | null> {
  const binding = readCloudBinding(state)
  if (binding) {
    return {
      enrolled: true, machineId: binding.machineId, fingerprint: formatFingerprint(await fingerprintOf(binding.identity)),
      since: binding.pinnedAt, connected: current?.connected() ?? false,
    }
  }
  if (!settings) return null
  const p = state.readJson(...PROBLEM) as { problem?: unknown; at?: unknown } | null
  return {
    enrolled: false,
    problem: typeof p?.problem === 'string' ? p.problem : null,
    at: typeof p?.at === 'string' ? p.at : null,
  }
}

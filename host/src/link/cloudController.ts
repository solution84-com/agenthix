/**
 * The Cloud controller this machine answers (pre-release spec B2, B5): the identity it pinned when it enrolled with
 * Cloud, and the machine id Cloud knows it by. Like the Fleet Console's pin (pin.ts), read from the state folder on
 * every use. A machine has one controller at a time: one with a Fleet Console pinned refuses to enrol, and one
 * enrolled with Cloud — or set up to enrol, by `CLOUD_URL` — refuses a Fleet Console's join and pin.
 */
import { CLOUD_MACHINE_ID, isFingerprint, type CloudControllerBinding, type HostRefusal } from '@agenthix/core'
import { fingerprintOf, isHostIdentity } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'
import { cloudSettings } from '../config'
import { readPin } from './pin'

const FILE = ['link', 'cloud.json']

/** The Cloud controller this machine enrolled with; null when none. A record that is not one pins nothing. */
export function readCloudBinding(state: StateFolder): CloudControllerBinding | null {
  try {
    const v = state.readJson(...FILE) as Partial<CloudControllerBinding> | null
    if (!v || !isHostIdentity(v.identity) || v.identity.role !== 'cloud' || typeof v.pinnedAt !== 'string') return null
    if (typeof v.machineId !== 'string' || !CLOUD_MACHINE_ID.test(v.machineId)) return null
    return {
      identity: { role: 'cloud', signingKey: v.identity.signingKey, sealingKey: v.identity.sealingKey },
      machineId: v.machineId,
      pinnedAt: v.pinnedAt,
    }
  } catch {
    return null
  }
}

export function enrolledWithCloud(state: StateFolder): boolean {
  return readCloudBinding(state) !== null
}

/** Why this machine will not enrol with Cloud; null when it may. */
export function cloudEnrolmentRefusal(state: StateFolder): HostRefusal | null {
  if (readPin(state)) {
    return { code: 'conflict', message: 'This machine is managed by the organisation\'s Fleet Console, and a machine has one controller at a time. Disconnect it first to let Cloud manage it.' }
  }
  return null
}

/** Pins Cloud's identity, unless a Fleet Console is pinned or another Cloud identity already is. */
export async function pinCloudController(state: StateFolder, binding: CloudControllerBinding): Promise<{ ok: true } | { ok: false; refusal: HostRefusal }> {
  const refusal = cloudEnrolmentRefusal(state)
  if (refusal) return { ok: false, refusal }
  const pinned = readCloudBinding(state)
  if (pinned && (await fingerprintOf(pinned.identity)) !== (await fingerprintOf(binding.identity))) {
    return { ok: false, refusal: { code: 'conflict', message: 'This machine is already enrolled with Agenthix Cloud under another identity.' } }
  }
  state.writeJson(FILE, binding)
  return { ok: true }
}

/**
 * Why a Fleet Console may not be joined or pinned here; null when it may. A machine set up for Cloud is Cloud's even
 * before its enrolment completes, so the Fleet Console started beside hq there claims nothing.
 */
export function consoleRefusedForCloud(state: StateFolder, env: NodeJS.ProcessEnv = process.env): string | null {
  if (enrolledWithCloud(state)) return 'is enrolled with Agenthix Cloud, which manages it. A machine has one controller at a time.'
  if (cloudSettings(env)) return 'is set up to be managed by Agenthix Cloud. A machine has one controller at a time.'
  return null
}

/** Whether an envelope's sender is the Cloud controller this machine enrolled with. */
export async function isFromCloudController(state: StateFolder, data: unknown): Promise<boolean> {
  const binding = readCloudBinding(state)
  const from = (data as { from?: unknown } | null)?.from
  return !!binding && isFingerprint(from) && from === (await fingerprintOf(binding.identity))
}

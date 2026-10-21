import { parseRestoreClaim, type JoinRequest, type ConsoleHandoverAsk } from '@agenthix/core'
import { isHostIdentity } from '@agenthix/core/host-crypto'

const LOOKUP = /^[0-9a-f]{64}$/
/** An HMAC-SHA-256 in base64url is 43 characters. */
const BINDING = /^[A-Za-z0-9_-]{43}$/
const MAX_MACHINE_NAME = 64
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/

/**
 * A joining machine's half (core's JoinRequest), checked before anything of it is kept or shown. hq cannot check the
 * binding — that needs the code, which it never sees — so it only checks its shape; the Fleet Console checks the rest.
 * The machine's name is shown to the fleet admin beside its fingerprint, so it is kept short and printable.
 */
export function readJoinRequest(payload: unknown): JoinRequest | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>
  if (typeof p.lookup !== 'string' || !LOOKUP.test(p.lookup)) return null
  if (!isHostIdentity(p.identity) || p.identity.role !== 'host') return null
  if (typeof p.binding !== 'string' || !BINDING.test(p.binding)) return null
  if (typeof p.machineName !== 'string') return null
  if (p.runsHq !== undefined && p.runsHq !== true) return null
  const restores = p.restores === undefined ? undefined : parseRestoreClaim(p.restores)
  if (restores === null) return null
  const machineName = p.machineName.trim()
  if (!machineName || machineName.length > MAX_MACHINE_NAME || CONTROL.test(machineName)) return null
  const identity = { role: 'host' as const, signingKey: p.identity.signingKey, sealingKey: p.identity.sealingKey }
  // What the machine claims — that it runs hq, or which backup it restores — is under the binding, so it is passed as it came.
  return {
    lookup: p.lookup, identity, machineName, ...(p.runsHq ? { runsHq: true as const } : {}), ...(restores ? { restores } : {}), binding: p.binding,
  }
}

/** A new Fleet Console's half of a handover (core's ConsoleHandoverAsk), checked for its shape as a join's is. */
export function readHandoverAsk(payload: unknown): ConsoleHandoverAsk | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>
  if (!isHostIdentity(p.identity) || p.identity.role !== 'console') return null
  if (typeof p.binding !== 'string' || !BINDING.test(p.binding)) return null
  if (typeof p.machineName !== 'string') return null
  const machineName = p.machineName.trim()
  if (!machineName || machineName.length > MAX_MACHINE_NAME || CONTROL.test(machineName)) return null
  const identity = { role: 'console' as const, signingKey: p.identity.signingKey, sealingKey: p.identity.sealingKey }
  return { identity, machineName, binding: p.binding }
}

import { getSessionId } from 'wasp/client/api'
import { retryRead } from '@agenthix/ui/attention'
import type { ShownIdentity } from './orgCard'

export type InviteView = {
  kind: 'first_admin' | 'invitation'
  role: 'ADMIN' | 'MEMBER'
  note: string | null
  invitedBy: { name: string; handle: string | null } | null
  fromHqMachine: boolean
  projects: Array<{ key: string; name: string; description: string | null; memberCount: number }>
  people: Array<{ name: string; role: 'ADMIN' | 'MEMBER' }>
  morePeople: number
  needsModel: boolean
  expiresAt: string | null
  org: ShownIdentity
}

export type InviteRefusal = {
  reason: 'unknown' | 'expired' | 'used' | 'revoked' | 'already_set_up' | 'bad_role' | 'rate_limited' | 'unreachable'
  error: string
  askWho: string | null
}

export type InviteRead = { ok: true; view: InviteView } | { ok: false; refusal: InviteRefusal }

async function postJson(url: string, body: unknown, withSession = false): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const session = withSession ? getSessionId() : null
  if (session) headers.Authorization = `Bearer ${session}`
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data: data as Record<string, unknown> }
}

export async function readInvite(token: string): Promise<InviteRead> {
  try {
    const { status, data } = await retryRead(async () => {
      const answer = await postJson('/api/auth/validate-invite', { token })
      if (answer.status >= 500) throw Object.assign(new Error('HQ did not answer.'), { status: answer.status })
      return answer
    })
    if (status === 200 && data.valid) return { ok: true, view: data as unknown as InviteView }
    const reason = status === 429 ? 'rate_limited' : (data.reason as InviteRefusal['reason'] | undefined) ?? 'unknown'
    return { ok: false, refusal: { reason, error: String(data.error ?? "This invitation link doesn't work."), askWho: (data.askWho as string | null | undefined) ?? null } }
  } catch {
    return { ok: false, refusal: { reason: 'unreachable', error: 'HQ did not answer.', askWho: null } }
  }
}

export type AcceptOutcome =
  | { ok: true; landAt: string }
  | { ok: false; signedInAs: string }
  | { ok: false; error: string }

/** Sent with the session, if any, so a signed-in browser is refused rather than silently switched. */
export async function acceptInvite(args: { token: string; name: string; username: string; password: string }): Promise<AcceptOutcome> {
  try {
    const { status, data } = await postJson('/api/auth/accept-invite', args, true)
    if (status === 200 && data.success) return { ok: true, landAt: typeof data.landAt === 'string' ? data.landAt : '/' }
    if (status === 409 && data.reason === 'signed_in') return { ok: false, signedInAs: String(data.signedInAs ?? '') }
    return { ok: false, error: String(data.error ?? 'Something went wrong') }
  } catch {
    return { ok: false, error: 'Something went wrong' }
  }
}

/** "a Member", "an Admin": the role in words. */
export const roleInWords = (role: InviteView['role']): string => (role === 'ADMIN' ? 'an Admin' : 'a Member')

/** "Website Redesign", "Website Redesign and Merchant app", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "open until 16 Oct", from the invitation's close date. */
export function closesText(expiresAt: string | null): string | null {
  if (!expiresAt) return null
  return `open until ${new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

/**
 * Sessions of the fleet admins signed in (spec §7). A session is two secrets: the cookie, HTTP-only and same-site
 * strict, and a CSRF token the screen holds and sends as a header on every request. Cookies are not kept apart by
 * port, so any other server on 127.0.0.1 the browser visits — hq's own plain-HTTP port among them — receives the
 * cookie; it never sees the token, which is returned once, at sign-in, so the cookie alone opens nothing.
 *
 * Only a hash of each cookie is kept, in the state folder, so a session outlives a restart and a copy of the folder
 * opens none. A session ends when signed out, after an hour unused, after twelve hours in any case, and as soon as hq
 * says the person no longer holds the fleet admin role.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { StateFolder } from '../state/folder'

const FILE = 'sessions.json'
export const SESSION_IDLE_MS = 60 * 60_000
export const SESSION_MAX_MS = 12 * 60 * 60_000
const MAX_SESSIONS = 200

export type SessionUser = { id: string; name: string }

export type Session = {
  idHash: string
  csrfHash: string
  user: SessionUser
  createdAt: number
  lastSeenAt: number
  /** When hq last said this person holds the role. */
  roleCheckedAt: number
  /** Opened through remote access (net/remoteAccess.ts): it works only there, and ends when remote access does. */
  remote?: true
}

export class Sessions {
  private sessions: Session[]

  constructor(private readonly state: StateFolder, private readonly now: () => number = Date.now) {
    const stored = state.readJson(FILE) as { sessions?: unknown } | null
    this.sessions = Array.isArray(stored?.sessions) ? stored.sessions.filter(isSession) : []
    this.prune()
  }

  /** A new session; the two secrets are returned here only. */
  create(user: SessionUser, remote = false): { cookie: string; csrfToken: string } {
    const cookie = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    const now = this.now()
    this.prune()
    this.sessions.push({ idHash: hash(cookie), csrfHash: hash(csrfToken), user, createdAt: now, lastSeenAt: now, roleCheckedAt: now, ...(remote ? { remote: true as const } : {}) })
    if (this.sessions.length > MAX_SESSIONS) this.sessions.sort((a, b) => a.lastSeenAt - b.lastSeenAt).splice(0, this.sessions.length - MAX_SESSIONS)
    this.save()
    return { cookie, csrfToken }
  }

  /** The session the two secrets open, or null. Both must match, compared in constant time. */
  find(cookie: string | undefined, csrfToken: string | undefined): Session | null {
    if (!cookie || !csrfToken) return null
    const idHash = hash(cookie)
    const session = this.sessions.find(s => safeEqual(s.idHash, idHash))
    if (!session || !safeEqual(session.csrfHash, hash(csrfToken))) return null
    const now = this.now()
    if (now - session.lastSeenAt > SESSION_IDLE_MS || now - session.createdAt > SESSION_MAX_MS) {
      this.end(session)
      return null
    }
    session.lastSeenAt = now
    return session
  }

  /**
   * The session a cookie opens, only when it is the one named: for a download the browser fetches by itself, which
   * cannot send the CSRF header, so a one-time link made through the session (with its token) stands in for it.
   */
  findByCookie(cookie: string | undefined, idHash: string): Session | null {
    if (!cookie || !safeEqual(hash(cookie), idHash)) return null
    const session = this.sessions.find(s => s.idHash === idHash)
    if (!session) return null
    const now = this.now()
    if (now - session.lastSeenAt > SESSION_IDLE_MS || now - session.createdAt > SESSION_MAX_MS) {
      this.end(session)
      return null
    }
    session.lastSeenAt = now
    return session
  }

  end(session: Session): void {
    this.sessions = this.sessions.filter(s => s.idHash !== session.idHash)
    this.save()
  }

  /** Ends every session of a person, when hq no longer lists them as a fleet admin. */
  endAllOf(userId: string): void {
    const before = this.sessions.length
    this.sessions = this.sessions.filter(s => s.user.id !== userId)
    if (this.sessions.length !== before) this.save()
  }

  /** Ends every session opened through remote access, when it ends. */
  endRemote(): void {
    const before = this.sessions.length
    this.sessions = this.sessions.filter(s => !s.remote)
    if (this.sessions.length !== before) this.save()
  }

  userIds(): string[] {
    return [...new Set(this.sessions.map(s => s.user.id))]
  }

  private prune(): void {
    const now = this.now()
    this.sessions = this.sessions.filter(s => now - s.lastSeenAt <= SESSION_IDLE_MS && now - s.createdAt <= SESSION_MAX_MS)
  }

  private save(): void {
    this.state.writeJson([FILE], { sessions: this.sessions })
  }
}

function hash(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function isSession(v: unknown): v is Session {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  const user = s.user as Record<string, unknown> | undefined
  return typeof s.idHash === 'string' && typeof s.csrfHash === 'string' && typeof user?.id === 'string' &&
    typeof user.name === 'string' && typeof s.createdAt === 'number' && typeof s.lastSeenAt === 'number' &&
    typeof s.roleCheckedAt === 'number' && (s.remote === undefined || s.remote === true)
}

/**
 * A conversation's OpenCode session (spec §4, §8).
 *
 * OpenCode names its sessions itself, so the site keeps the name it was given
 * on the conversation's row (`AgentSession.harnessSessionId`) and resumes that
 * session on every later turn. A session is created in the conversation's
 * working directory — the `directory` query parameter, since a body field is
 * dropped — with Agenthix's title for the conversation, so OpenCode never
 * asks a model for one, and with rules that begin with Agenthix's whole set
 * and end by hiding the agent's `never` built-ins. Permissions are read at the
 * start of every turn (spec §2), so a resumed session's rules are brought up
 * to the turn's before its message is sent.
 *
 * The existence check (adr-0076) is `GET /session/:id`: only a `404` means
 * gone. A server that is starting may refuse a connection or accept it and
 * never answer, so the check retries until its deadline and then fails the
 * run — it never reads silence as absence.
 */
import { prisma } from '#db'
import type { OpenCodeServers } from './openCodeServers'
import { sessionPermissionRules, type PermissionRule } from './openCodeConnection'

export interface HarnessSessionStore {
  read(sessionId: string): Promise<{ harnessSessionId: string | null; title: string | null } | null>
  write(sessionId: string, harnessSessionId: string): Promise<void>
}

export const prismaHarnessSessionStore: HarnessSessionStore = {
  read: id => prisma.agentSession.findUnique({ where: { id }, select: { harnessSessionId: true, title: true } }),
  write: async (id, harnessSessionId) => {
    await prisma.agentSession.update({ where: { id }, data: { harnessSessionId } })
  },
}

const EXISTENCE_DEADLINE_MS = 60_000
const EXISTENCE_REQUEST_MS = 5_000

export function directoryQuery(directory: string): string {
  return `directory=${encodeURIComponent(directory)}`
}

/** Agenthix's title for a conversation: its own, or the first words of its first message. */
export function conversationTitle(stored: string | null, prompt: string): string {
  if (stored?.trim()) return stored.trim()
  const words = prompt.trim().split(/\s+/).filter(Boolean)
  const title = words.slice(0, 6).join(' ') + (words.length > 6 ? '...' : '')
  return title || 'Conversation'
}

export async function createOpenCodeSession(
  servers: OpenCodeServers,
  containerName: string,
  s: { directory: string; title: string; rules: PermissionRule[] },
): Promise<string> {
  const res = await servers.request(containerName, 'POST', `/session?${directoryQuery(s.directory)}`, {
    title: s.title,
    permission: s.rules,
  })
  let id: unknown
  try { id = res.status === 200 ? (JSON.parse(res.body) as { id?: unknown }).id : undefined } catch { id = undefined }
  if (typeof id !== 'string' || !id) throw new Error(`OpenCode did not create a session (${res.error ?? `status ${res.status}`})`)
  return id
}

/** `true` 200, `false` 404, anything else asked again until the deadline, then an error. */
export async function openCodeSessionExists(
  servers: OpenCodeServers,
  containerName: string,
  harnessSessionId: string,
  directory: string,
  deadlineMs = EXISTENCE_DEADLINE_MS,
): Promise<boolean> {
  const until = Date.now() + deadlineMs
  let last = ''
  for (;;) {
    const res = await servers.request(containerName, 'GET', `/session/${encodeURIComponent(harnessSessionId)}?${directoryQuery(directory)}`, undefined, EXISTENCE_REQUEST_MS)
      .catch((err: unknown) => ({ status: 0, body: '', error: String(err) }))
    if (res.status === 200) return true
    if (res.status === 404) return false
    last = res.error ?? `status ${res.status}`
    if (Date.now() >= until) break
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`Could not tell whether OpenCode still holds this conversation (${last}); it was left as it is.`)
}

const sameRule = (a: unknown, b: PermissionRule): boolean => {
  const r = a as Partial<PermissionRule> | null
  return !!r && r.permission === b.permission && r.pattern === b.pattern && r.action === b.action
}

/**
 * Makes `rules` the session's final word. OpenCode's session update appends to
 * the rules it holds and the last matching rule wins, so appending the whole
 * set overrides everything before it; it is sent only when the session's rules
 * do not already end with it, so they grow only when permissions change.
 */
export async function syncOpenCodeSessionRules(
  servers: OpenCodeServers,
  containerName: string,
  harnessSessionId: string,
  directory: string,
  rules: PermissionRule[],
): Promise<void> {
  const where = `/session/${encodeURIComponent(harnessSessionId)}?${directoryQuery(directory)}`
  const got = await servers.request(containerName, 'GET', where)
  if (got.status !== 200) throw new Error(`Could not read the OpenCode session's permission rules (${got.error ?? `status ${got.status}`})`)
  let held: unknown
  try { held = (JSON.parse(got.body) as { permission?: unknown }).permission } catch { held = undefined }
  const tail = Array.isArray(held) ? held.slice(-rules.length) : []
  if (tail.length === rules.length && rules.every((r, i) => sameRule(tail[i], r))) return
  const res = await servers.request(containerName, 'PATCH', where, { permission: rules })
  if (res.status !== 200) throw new Error(`Could not update the OpenCode session's permission rules (${res.error ?? `status ${res.status}`})`)
}

/**
 * The OpenCode session a turn runs in: the conversation's own, resumed — or,
 * for a conversation that has none yet, a new one. A
 * conversation that has one never gets a second: the pre-launch check has
 * already closed a conversation whose session is gone.
 */
export async function openCodeSessionForTurn(
  servers: OpenCodeServers,
  store: HarnessSessionStore,
  containerName: string,
  t: { sessionId: string; directory: string; prompt: string; connectionName: string; hiddenTools: readonly string[] },
): Promise<string> {
  const rules = sessionPermissionRules(t.connectionName, t.hiddenTools)
  const row = await store.read(t.sessionId)
  if (row?.harnessSessionId) {
    await syncOpenCodeSessionRules(servers, containerName, row.harnessSessionId, t.directory, rules)
    return row.harnessSessionId
  }
  const id = await createOpenCodeSession(servers, containerName, {
    directory: t.directory,
    title: conversationTitle(row?.title ?? null, t.prompt),
    rules,
  })
  await store.write(t.sessionId, id)
  return id
}

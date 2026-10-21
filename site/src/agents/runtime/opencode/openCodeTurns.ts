/**
 * What the site hands Agenthix's OpenCode plugin (core's openCodePlugin.ts):
 * each server's key, and each OpenCode session's current turn.
 *
 * The plugin asks for a session's turn before every model request and before
 * every gate call (`POST /api/v1/harness/turn`), authenticated by its server's
 * key. The answer is the turn only while one runs, and only to the server the
 * session belongs to: a key never reads another container's sessions. Between
 * turns it is null, so the plugin sets no relay token on a model request and
 * has no token to ask the gate with.
 *
 * In memory: a site restart ends every relay, so every server with it, and
 * nothing here would name anything still running.
 */
import { timingSafeEqual } from 'node:crypto'
import type { HarnessTurn } from '@agenthix/core'

/** An OpenCode session the site created, and the conversation it belongs to. */
export type OpenCodeSessionEntry = {
  containerName: string
  /** Our AgentSession id: the conversation, and its processes' tag. */
  conversationId: string
  /** The conversation's platform-tool connection on its server (openCodeConnection.ts). */
  connectionName: string
}

const serverKeys = new Map<string, string>()
const sessions = new Map<string, OpenCodeSessionEntry>()
const turns = new Map<string, HarnessTurn>()

export function registerServerKey(containerName: string, key: string): void {
  serverKeys.set(containerName, key)
}

/** The server is gone: its key opens nothing, and its sessions' turns are over. */
export function forgetServer(containerName: string): void {
  serverKeys.delete(containerName)
  for (const [id, entry] of sessions) {
    if (entry.containerName !== containerName) continue
    turns.delete(id)
  }
}

export function recordOpenCodeSession(openCodeSessionId: string, entry: OpenCodeSessionEntry): void {
  sessions.set(openCodeSessionId, entry)
}

/** The conversation's sessions are let go (it went idle or ended). */
export function forgetConversationSessions(conversationId: string): void {
  for (const [id, entry] of sessions) {
    if (entry.conversationId !== conversationId) continue
    sessions.delete(id)
    turns.delete(id)
  }
}

/** Which conversation an OpenCode session belongs to, for the site's end of the gate call. */
export function openCodeSessionEntry(openCodeSessionId: string): OpenCodeSessionEntry | null {
  return sessions.get(openCodeSessionId) ?? null
}

export function setOpenCodeTurn(openCodeSessionId: string, turn: HarnessTurn): void {
  if (!sessions.has(openCodeSessionId)) throw new Error('A turn was set for an OpenCode session the site did not record')
  turns.set(openCodeSessionId, turn)
}

/** Only the turn that set it clears it, so a late clear cannot take a later turn's. */
export function clearOpenCodeTurn(openCodeSessionId: string, conversationToken: string): void {
  if (turns.get(openCodeSessionId)?.conversationToken === conversationToken) turns.delete(openCodeSessionId)
}

function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** The container whose server holds this key, or null. */
export function containerForServerKey(key: string): string | null {
  if (!key) return null
  for (const [containerName, known] of serverKeys) if (sameKey(known, key)) return containerName
  return null
}

/**
 * The turn the plugin of the server holding `serverKey` may use for this
 * session: null for an unknown key, a session of another server, or no turn
 * running.
 */
export function resolveHarnessTurn(serverKey: string, openCodeSessionId: string): HarnessTurn | null {
  const containerName = containerForServerKey(serverKey)
  if (!containerName) return null
  const entry = sessions.get(openCodeSessionId)
  if (!entry || entry.containerName !== containerName) return null
  return turns.get(openCodeSessionId) ?? null
}

export function resetOpenCodeTurnsForTests(): void {
  serverKeys.clear()
  sessions.clear()
  turns.clear()
}

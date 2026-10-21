/**
 * Relay tokens: what a harness in a container presents to the site's model
 * relay in place of a provider key (spec §6, "The key never enters the
 * container").
 *
 * A token is bound to one container and one conversation when it is issued,
 * and names a turn only while one runs: it is pointed at the turn — its run
 * and the API keys of every provider the turn may use — when the turn starts,
 * and at nothing when it ends. So between turns, and once a run is stopped,
 * it opens nothing. OpenCode's plugin is given a new token for every turn
 * (through the turn endpoint); a `claude` process trades its one-use ticket
 * for one token when it starts, which is pointed at each of its turns.
 *
 * A request still streaming when its turn ends is cut off with it.
 *
 * In memory: a site restart ends every harness that could hold one.
 */
import { randomBytes } from 'node:crypto'
import type { ApiKeyRunCredential, CredentialProvider, RunCredential } from '@agenthix/core'
import { gateRunStopped } from '../../agents/runtime/toolGateRuns'

export type RelayTurn = {
  containerName: string
  conversationId: string
  runId: string
  credentials: ReadonlyMap<CredentialProvider, ApiKeyRunCredential>
}

type Binding = {
  containerName: string
  conversationId: string
  turn: { runId: string; credentials: ReadonlyMap<CredentialProvider, ApiKeyRunCredential> } | null
  inFlight: Set<() => void>
}

const bindings = new Map<string, Binding>()

/** The API keys a turn's model requests may use, by provider: its own credential's and its fallbacks'. */
export function turnModelCredentials(turn: { credential: RunCredential | null; fallbackCredentials?: ApiKeyRunCredential[] }): ApiKeyRunCredential[] {
  const own = turn.credential?.kind === 'apiKey' ? [turn.credential] : []
  return [...own, ...(turn.fallbackCredentials ?? [])]
}

export function issueRelayToken(containerName: string, conversationId: string): string {
  const token = randomBytes(32).toString('base64url')
  bindings.set(token, { containerName, conversationId, turn: null, inFlight: new Set() })
  return token
}

/** The token names this run's turn now, with these providers' keys. The first key given for a provider wins. */
export function pointRelayToken(token: string, runId: string, credentials: readonly ApiKeyRunCredential[]): void {
  const binding = bindings.get(token)
  if (!binding) throw new Error('A relay token was pointed at a turn after it was revoked')
  const byProvider = new Map<CredentialProvider, ApiKeyRunCredential>()
  for (const c of credentials) if (!byProvider.has(c.provider)) byProvider.set(c.provider, c)
  binding.turn = { runId, credentials: byProvider }
}

/** The run's turn is over: the token names nothing, and its requests still running are cut off. Only that run's clear counts. */
export function clearRelayTurn(token: string, runId: string): void {
  const binding = bindings.get(token)
  if (!binding || binding.turn?.runId !== runId) return
  binding.turn = null
  abortInFlight(binding)
}

export function revokeRelayToken(token: string): void {
  const binding = bindings.get(token)
  if (!binding) return
  bindings.delete(token)
  abortInFlight(binding)
}

/** The turn this token names now: null for an unknown or revoked token, between turns, and once the run is stopped. */
export function resolveRelayToken(token: string): RelayTurn | null {
  const binding = token ? bindings.get(token) : undefined
  if (!binding?.turn || gateRunStopped(binding.turn.runId)) return null
  return { containerName: binding.containerName, conversationId: binding.conversationId, ...binding.turn }
}

/** Whether this token was issued and not yet revoked, whether or not a turn runs. */
export function isLiveRelayToken(token: string): boolean {
  return !!token && bindings.has(token)
}

/**
 * Registers a request being relayed on this token, so the end of its turn can
 * cut it off. Returns the call that unregisters it.
 */
export function trackRelayRequest(token: string, abort: () => void): () => void {
  const binding = bindings.get(token)
  if (!binding) {
    abort()
    return () => {}
  }
  binding.inFlight.add(abort)
  return () => { binding.inFlight.delete(abort) }
}

function abortInFlight(binding: Binding): void {
  const aborts = [...binding.inFlight]
  binding.inFlight.clear()
  for (const abort of aborts) abort()
}

export function resetRelayTokensForTests(): void {
  bindings.clear()
}

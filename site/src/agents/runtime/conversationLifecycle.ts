/**
 * When a conversation's processes, harness and staging end (adr-0083, spec §3).
 *
 * Nothing is reset when a turn ends. Instead a conversation lets go of what it
 * holds in two ways:
 *
 *  - **Idle.** When a turn ends the conversation's idle timer starts
 *    (`AGENT_SESSION_IDLE_MINUTES`, a machine setting, 30 by default); the next
 *    turn stops it, and a running turn is never idle. When it expires the
 *    conversation is released: it stays resumable, and its next turn starts
 *    without what it left running.
 *  - **Ended.** Closed (adr-0076), deleted, or its person gone: released at
 *    once, and a turn still unwinding does not start the timer again.
 *
 * Releasing, in this order: the platform token is revoked, so nothing left
 * running can act through the platform; the runtime is told
 * (`conversationIdle` or `endConversation`), so the harness lets go of what it
 * keeps warm and can close it gracefully — a `claude` process flushes its
 * session file as it exits; every process still carrying the conversation's
 * tag is ended through the finder (conversationProcesses.ts); and the
 * conversation's staging folder is removed, after the processes that could be
 * reading it are gone.
 *
 * A cancelled turn is not a release: it stops only its own turn (AgentEngine's
 * `cancelRun`), and the conversation's other processes and harness stay.
 *
 * A preview held open for the conversation keeps it from going idle, as it was
 * exempted from the reset between runs before (spec §3): an expiry while one is
 * held waits another idle period. The preview registry reports its holds
 * through conversationHolds.ts, so the runtime does not import it.
 *
 * In memory, like the containers' own bookkeeping. After a site restart nothing
 * is known about earlier turns; a container reached again is recreated
 * (mountSignature.ts), which takes their processes with it.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { revokeConversationToken } from '../../server/runtime/conversationTokens'
import { Logger } from '../../server/utils/logger'
import { positiveNumberEnv } from './containerLimits'
import { conversationHeld } from './conversationHolds'
import { endConversationProcesses, type EndConversationProcessesResult } from './conversationProcesses'
import { selectRuntime } from './selectRuntime'
import { SKILLS_STAGING_DIRNAME } from './skillsStagingDir'
import type { AgentRuntime, ConversationRef } from './types'

const logger = new Logger('ConversationLifecycle')

/** How long a conversation may sit with no turn running before it is released. */
export function conversationIdleMs(): number {
  return positiveNumberEnv('AGENT_SESSION_IDLE_MINUTES', 30) * 60_000
}

const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,128}$/

/**
 * The folder a conversation's staged files live in, under the runner's Claude
 * home — inside the staging folder the container binds read-only. Removed when
 * the conversation is released. Refuses an id that is not one path segment.
 */
export function conversationStagingDir(claudeHomeServerDir: string, conversationId: string): string {
  if (!CONVERSATION_ID.test(conversationId)) {
    throw new Error(`Refusing a staging folder for an unexpected conversation id: ${JSON.stringify(conversationId)}`)
  }
  return path.join(claudeHomeServerDir, SKILLS_STAGING_DIRNAME, `conversation-${conversationId}`)
}

/** Where a conversation's latest turn ran, recorded when it launched. */
export interface ConversationPlace {
  containerName: string | null
  runtime: AgentRuntime
  /** The runner's Claude home as this process sees it, which holds the staging folder. */
  claudeHomeServerDir: string | null
}

/**
 * What is known of a conversation that has no launched turn on record — one
 * whose launch failed, or that has not run since this process started.
 */
export interface ConversationFallback {
  containerName?: string | null
  runtimeName?: string | null
  claudeHomeServerDir?: string | null
}

export interface ConversationLifecycleDeps {
  idleMs: () => number
  endProcesses: (containerName: string, conversationId: string) => Promise<EndConversationProcessesResult>
  revokeToken: (conversationId: string) => void
  removeDir: (dir: string) => Promise<void>
  resolveRuntime: (name: string) => AgentRuntime
  isHeld: (conversationId: string) => boolean
}

const realDeps: ConversationLifecycleDeps = {
  idleMs: conversationIdleMs,
  endProcesses: (containerName, conversationId) => endConversationProcesses(containerName, conversationId),
  revokeToken: revokeConversationToken,
  removeDir: dir => fs.rm(dir, { recursive: true, force: true }),
  resolveRuntime: selectRuntime,
  isHeld: conversationHeld,
}

interface Conversation {
  activeTurns: number
  place?: ConversationPlace
  timer?: ReturnType<typeof setTimeout>
  releasing?: Promise<void>
  ended?: boolean
}

type Release = 'idle' | 'end'

export class ConversationLifecycle {
  private conversations = new Map<string, Conversation>()

  constructor(private deps: ConversationLifecycleDeps = realDeps) {}

  /**
   * A turn is about to launch: the conversation is no longer idle. Waits for a
   * release already under way, so a turn never starts its harness into the
   * finder's kill.
   */
  async turnStarting(conversationId: string): Promise<void> {
    const conversation = this.entry(conversationId)
    this.clearTimer(conversation)
    conversation.activeTurns++
    await conversation.releasing
  }

  /** The turn launched: where its processes and staging are. */
  turnLaunched(conversationId: string, place: ConversationPlace): void {
    this.entry(conversationId).place = place
  }

  /**
   * The turn is over. The idle timer starts once no turn of the conversation is
   * running. `ended` releases it at once, as the conversation's end (a turn that
   * found it closed).  Never
   * rejects.
   */
  async turnEnded(
    conversationId: string,
    options: { ended?: boolean; fallback?: ConversationFallback } = {},
  ): Promise<void> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return
    conversation.activeTurns = Math.max(0, conversation.activeTurns - 1)
    if (options.ended) {
      await this.endConversation(conversationId, options.fallback)
      return
    }
    if (conversation.activeTurns > 0) return
    if (conversation.ended) {
      this.forgetIfSettled(conversationId, conversation)
      return
    }
    this.armTimer(conversationId, conversation)
  }

  /**
   * The conversation was closed, deleted, or its person left: release it now,
   * even with a turn still unwinding. Never rejects.
   */
  async endConversation(conversationId: string, fallback?: ConversationFallback): Promise<void> {
    const conversation = this.entry(conversationId)
    conversation.ended = true
    this.clearTimer(conversation)
    await conversation.releasing
    await this.release(conversationId, conversation, 'end', fallback)
  }

  /** Whether a conversation is on record here — for tests and diagnostics. */
  isTracked(conversationId: string): boolean {
    return this.conversations.has(conversationId)
  }

  /** Test-only: drop every record and timer. */
  resetForTests(): void {
    for (const conversation of this.conversations.values()) this.clearTimer(conversation)
    this.conversations.clear()
  }

  private entry(conversationId: string): Conversation {
    let conversation = this.conversations.get(conversationId)
    if (!conversation) {
      conversation = { activeTurns: 0 }
      this.conversations.set(conversationId, conversation)
    }
    return conversation
  }

  private clearTimer(conversation: Conversation): void {
    if (conversation.timer) clearTimeout(conversation.timer)
    conversation.timer = undefined
  }

  private armTimer(conversationId: string, conversation: Conversation): void {
    this.clearTimer(conversation)
    conversation.timer = setTimeout(() => {
      conversation.timer = undefined
      if (conversation.activeTurns > 0 || conversation.ended) return
      if (this.deps.isHeld(conversationId)) {
        this.armTimer(conversationId, conversation)
        return
      }
      void this.release(conversationId, conversation, 'idle')
    }, this.deps.idleMs())
    conversation.timer.unref?.()
  }

  private release(conversationId: string, conversation: Conversation, kind: Release, fallback?: ConversationFallback): Promise<void> {
    const place = conversation.place
    conversation.place = undefined
    const work = this.releaseWork(conversationId, kind, place, fallback).catch((err: unknown) => {
      logger.warn(`Conversation ${conversationId}: release failed: ${err instanceof Error ? err.message : String(err)}`)
    })
    const releasing: Promise<void> = work.finally(() => {
      if (conversation.releasing === releasing) conversation.releasing = undefined
      this.forgetIfSettled(conversationId, conversation)
    })
    conversation.releasing = releasing
    return releasing
  }

  private async releaseWork(conversationId: string, kind: Release, place: ConversationPlace | undefined, fallback?: ConversationFallback): Promise<void> {
    this.deps.revokeToken(conversationId)

    const containerName = place?.containerName ?? fallback?.containerName ?? null
    const runtime = place?.runtime ?? this.runtimeNamed(fallback?.runtimeName ?? null)
    if (runtime) {
      const ref: ConversationRef = { sessionId: conversationId, containerName }
      try {
        await (kind === 'idle' ? runtime.conversationIdle(ref) : runtime.endConversation(ref))
      } catch (err) {
        logger.warn(`Conversation ${conversationId}: its runtime could not let go of it: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (containerName) {
      const result = await this.deps.endProcesses(containerName, conversationId)
      if (result.kind === 'gave-up') {
        logger.warn(`Conversation ${conversationId}: ${result.remaining.length} process(es) in ${containerName} outlasted the pass limit`)
      } else if (result.kind === 'failed') {
        logger.warn(`Conversation ${conversationId}: could not end its processes in ${containerName}: ${result.error}`)
      }
    }

    const home = place?.claudeHomeServerDir ?? fallback?.claudeHomeServerDir ?? null
    if (home) await this.deps.removeDir(conversationStagingDir(home, conversationId))
    logger.info(`Conversation ${conversationId} released (${kind === 'idle' ? 'idle' : 'ended'})`)
  }

  private runtimeNamed(name: string | null): AgentRuntime | null {
    if (!name) return null
    try {
      return this.deps.resolveRuntime(name)
    } catch {
      return null
    }
  }

  private forgetIfSettled(conversationId: string, conversation: Conversation): void {
    if (conversation.activeTurns > 0 || conversation.timer || conversation.releasing || conversation.place) return
    if (this.conversations.get(conversationId) === conversation) this.conversations.delete(conversationId)
  }
}

export const conversationLifecycle = new ConversationLifecycle()

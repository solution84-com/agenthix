/**
 * An agent's raised hand while someone holds voice (adaptive voice spec, orchestration: Hand-raise): an update
 * that would take a report or continuation turn waits, and the holder is told once that it is there. Their
 * invitation lets it take its turn; until then, every card awaiting a turn waits with it. The person's own
 * messages are never held: the claim answers them first.
 *
 * A hand nobody invites within `handRaise.unansweredMs` is let go, so a browser that never answers cannot hold a
 * result back for ever: its update takes its turn as text, and voice goes on.
 */
import { CONVERSATION_VOICE_SOCKET as V, type VoiceUpdateEvent } from '../../shared/conversations/voice'
import { VOICE_SETTINGS } from '../voiceClient/settings'

export interface HandTimer {
  after(ms: number, fn: () => void): () => void
}

const realTimer: HandTimer = {
  after(ms, fn) {
    const t = setTimeout(fn, ms)
    t.unref?.()
    return () => clearTimeout(t)
  },
}

export interface HeldUpdate {
  /** The first card waiting: the update's id while it waits. */
  updateId: string
  /** Governed by policy: it speaks after the current sentence, without waiting for an opening. */
  critical: boolean
}

/**
 * The update the waiting cards make, and whether it is critical. What counts as critical belongs with the
 * interruption preferences planned separately; until then, only a request for the person's okay would be, and no
 * such card awaits a turn today.
 */
export function heldUpdate(cards: readonly { id: string; kind: string }[]): HeldUpdate | null {
  const first = cards[0]
  if (!first) return null
  return { updateId: first.id, critical: cards.some(c => c.kind === 'APPROVAL_REQUEST') }
}

export interface RaisedHandOptions {
  /** The hand was let go unanswered: its update may take its turn now. */
  expired?: () => void
  timer?: HandTimer
  unansweredMs?: number
}

export class RaisedHand {
  private raised: HeldUpdate | null = null
  private invited = false
  private unanswered = false
  private cancelLimit: (() => void) | null = null

  constructor(
    private readonly conversationId: string,
    private readonly toHolder: (event: string, payload: unknown) => void,
    private readonly options: RaisedHandOptions = {},
  ) {}

  /** Whether cards awaiting a turn wait now: until the holder invites the hand, or it goes unanswered. */
  holds(): boolean {
    return !this.invited && !this.unanswered
  }

  /** The hand was let go unanswered: its turn is taken as text, not spoken. */
  asText(): boolean {
    return this.unanswered
  }

  /** Raises the hand for an update, telling the holder when it is new or has become critical. */
  raise(update: HeldUpdate): void {
    const same = this.raised?.updateId === update.updateId && this.raised.critical === update.critical
    if (same || this.invited || this.unanswered) return
    if (this.raised?.updateId !== update.updateId) this.startLimit()
    this.raised = update
    this.tell()
  }

  /** Lets go of the hand and forgets its time limit, as when voice ends. */
  close(): void {
    this.stopLimit()
  }

  private startLimit(): void {
    this.stopLimit()
    const timer = this.options.timer ?? realTimer
    this.cancelLimit = timer.after(this.options.unansweredMs ?? VOICE_SETTINGS.handRaise.unansweredMs, () => {
      this.cancelLimit = null
      if (!this.raised || this.invited) return
      this.unanswered = true
      this.options.expired?.()
    })
  }

  private stopLimit(): void {
    this.cancelLimit?.()
    this.cancelLimit = null
  }

  /** The holder invited it: true when it is the hand raised now. */
  invite(updateId: string): boolean {
    if (!this.raised || this.raised.updateId !== updateId || this.unanswered) return false
    this.invited = true
    this.stopLimit()
    return true
  }

  /** The update took its turn: the next one raises its hand again. */
  taken(): void {
    this.stopLimit()
    this.raised = null
    this.invited = false
    this.unanswered = false
  }

  /** Tells the holder again, as when another socket of theirs joins. */
  tell(): void {
    if (!this.raised || this.invited || this.unanswered) return
    const event: VoiceUpdateEvent = { conversationId: this.conversationId, ...this.raised }
    this.toHolder(V.update, event)
  }
}

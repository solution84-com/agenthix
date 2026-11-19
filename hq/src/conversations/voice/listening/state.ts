/**
 * What hq keeps of the light model's listening for one voice session, in memory (adaptive voice listening, spec §The
 * light model and §What is stored): which call is the latest, and the one call in flight, which a newer one aborts;
 * what it did this turn and its last spoken lines across turns, which it reads so it does not repeat itself; the lines
 * the person heard, which join the turn's agent message; a turn it kept open after the person sounded finished; and
 * the stored hold phrases played lately. Nothing here is stored: it ends with the voice session.
 */
import type { ListenerCheck, ListenerToolName } from '../listener'

export interface TurnAction { tool: ListenerToolName; words: string; at: number }

/** A line sent to the browser for the turn's agent message: played, or sent and so to be played, never cut. */
export interface HeardLine { lineId: string; text: string; played: boolean }

/** A turn the light model kept open after the person sounded finished. */
export interface OpenTurn { text: string; since: number }

/**
 * A turn's agent message and the lines heard in it, kept a while so a line the browser skipped can be taken out: the
 * lines a reply starts with (`prefix`), or the whole of a turn the light model closed alone (`whole`). `message`: the
 * stored message's id once written; null for a turn closed alone, found by its turn.
 */
export interface HeardTurn {
  turnId: string
  shape: 'prefix' | 'whole'
  lines: HeardLine[]
  message: Promise<string | null>
}

/**
 * A turn kept open that the bound's timer ended, for a re-check sent before it knew: handed over with its stored hold
 * phrase (`fallback`), or closed with a stored closing line after an invitation nobody answered.
 */
export interface BoundHandOver {
  action: 'keep_listening' | 'close_turn'
  turn: 'fallback' | 'closed'
  lineId?: string
  say?: string
  turnId?: string
}

/** How many of its own lines are kept, across turns: more than any setting reads. */
const RECENT_LINES_KEPT = 20
/** How many turns' heard lines are kept for a skipped line to be taken out of: a skip comes within the reply. */
const HEARD_TURNS_KEPT = 8
/** How many of its checks since the words last changed are kept; the earlier ones are only counted. */
export const CHECKS_KEPT = 6
/** How many stored hold phrases played lately are not played again. */
export const RECENT_STORED_KEPT = 8

export class ListeningState {
  /** A listen was answered by the light model in this session: the turn path is the light model's. */
  active = false
  /** The heavy model has the turn: from a hand over or the fallback until its reply ends. */
  awaitingReply = false
  /** The turn ended (closed, or its reply ended): the next listen about the person's words starts a new one. */
  turnOver = false
  openTurn: OpenTurn | null = null
  boundHandOver: BoundHandOver | null = null
  /** hq's own call for a closing line at the "not yet" limit, stopped when the person speaks. */
  limitCall: AbortController | null = null
  readonly thisTurn: TurnAction[] = []
  readonly recentLines: string[] = []
  readonly recentStored: string[] = []
  /** Its choices since the person's words last changed, or since the hand over: the last few, and how many before. */
  readonly checks: ListenerCheck[] = []
  checksEarlier = 0
  /** Invitations in this pause (a presence check included), with no new words since: nobody answered them. */
  invites = 0
  private checksWords = ''
  private latest = Number.NEGATIVE_INFINITY
  private inFlight: AbortController | null = null
  private lines: HeardLine[] = []
  /** The heard lines a turn's agent message starts with, by turn: what a later cut leaves in place. */
  private readonly prefixes = new Map<string, string>()
  private heard: { turn: HeardTurn; wrote: (messageId: string | null) => void }[] = []
  /** Each recent reply's recap, being written or written, which is undone if the reply turns out not to be heard. */
  private readonly recaps = new Map<string, AbortController>()

  /**
   * A call numbered `seq` begins: the older call in flight is aborted. Null for a number not above the latest, which
   * arrived out of order and is not answered.
   */
  begin(seq: number): AbortSignal | null {
    if (!Number.isFinite(seq) || seq <= this.latest) return null
    this.latest = seq
    this.inFlight?.abort()
    this.inFlight = new AbortController()
    return this.inFlight.signal
  }

  isLatest(seq: number): boolean {
    return seq === this.latest
  }

  /** The number of the latest call, which an answer hq sends unasked carries. */
  get latestSeq(): number {
    return this.latest
  }

  /** A new turn of the person's words: what it did in the last one is forgotten, its lines across turns kept. */
  newTurn(): void {
    this.thisTurn.length = 0
    this.turnOver = false
    this.boundHandOver = null
    this.checksWords = ''
    this.clearChecks()
  }

  /** The words a call carries: checks made on other words are forgotten. A call with none (a wait) changes nothing. */
  wordsAre(text: string): void {
    if (!text || text === this.checksWords) return
    this.checksWords = text
    this.clearChecks()
  }

  get invited(): boolean {
    return this.invites > 0
  }

  checked(check: ListenerCheck): void {
    this.checks.push(check)
    if (check.tool === 'invite') this.invites++
    if (this.checks.length > CHECKS_KEPT) this.checksEarlier += this.checks.splice(0, this.checks.length - CHECKS_KEPT).length
  }

  clearChecks(): void {
    this.checks.length = 0
    this.checksEarlier = 0
    this.invites = 0
  }

  did(tool: ListenerToolName, words: string, at: number): void {
    this.thisTurn.push({ tool, words, at })
    this.recentLines.push(words)
    if (this.recentLines.length > RECENT_LINES_KEPT) this.recentLines.splice(0, this.recentLines.length - RECENT_LINES_KEPT)
  }

  playedStored(text: string): void {
    this.recentStored.push(text)
    if (this.recentStored.length > RECENT_STORED_KEPT) this.recentStored.splice(0, this.recentStored.length - RECENT_STORED_KEPT)
  }

  sent(lineId: string, text: string): void {
    this.lines.push({ lineId, text, played: false })
  }

  /** A line that could not be made: never heard. */
  drop(lineId: string): void {
    this.lines = this.lines.filter(l => l.lineId !== lineId)
  }

  played(lineId: string): void {
    const line = this.lines.find(l => l.lineId === lineId)
    if (line) line.played = true
  }

  /**
   * The lines the person heard for this turn, in order, taken for its agent message: played, or sent and so to be
   * played to their end. A line is taken once.
   */
  takeLines(): string[] {
    return this.takeHeard().map(l => l.text)
  }

  takeHeard(): HeardLine[] {
    const taken = this.lines
    this.lines = []
    return taken
  }

  /** The lines taken into a turn's agent message, kept for a skip; a turn closed alone has its message already. */
  heardIn(turnId: string, shape: HeardTurn['shape'], lines: HeardLine[]): void {
    if (!lines.length) return
    let wrote: (messageId: string | null) => void = () => undefined
    const message = shape === 'whole' ? Promise.resolve(null) : new Promise<string | null>(resolve => { wrote = resolve })
    this.heard.push({ turn: { turnId, shape, lines, message }, wrote })
    if (this.heard.length > HEARD_TURNS_KEPT) this.heard.splice(0, this.heard.length - HEARD_TURNS_KEPT)
  }

  /** A reply's agent message was written, or none was (null). */
  wroteMessage(turnId: string, messageId: string | null): void {
    this.heard.find(h => h.turn.turnId === turnId)?.wrote(messageId)
  }

  /**
   * The browser skipped a line, never to be heard: out of the lines waiting for a turn (`untaken`), or the turn whose
   * agent message holds it, for the caller to take it out of; null when hq knows no such line.
   */
  skip(lineId: string): HeardTurn | 'untaken' | null {
    if (this.lines.some(l => l.lineId === lineId)) {
      this.drop(lineId)
      return 'untaken'
    }
    return this.heard.find(h => h.turn.lines.some(l => l.lineId === lineId))?.turn ?? null
  }

  /** A skipped line was taken out of its turn's stored message: the prefix a later cut reads follows. */
  unheard(turn: HeardTurn, lineId: string): void {
    turn.lines = turn.lines.filter(l => l.lineId !== lineId)
    if (turn.shape !== 'prefix') return
    const { prefix } = joinHeard(turn.lines.map(l => l.text), '')
    if (prefix) this.prefixes.set(turn.turnId, prefix)
    else this.prefixes.delete(turn.turnId)
  }

  /** The recap of a turn's reply is written: aborted, or undone once stored, if the reply turns out not to be heard. */
  recapFor(turnId: string): AbortSignal {
    this.recaps.get(turnId)?.abort()
    const controller = new AbortController()
    this.recaps.set(turnId, controller)
    while (this.recaps.size > HEARD_TURNS_KEPT) this.recaps.delete(this.recaps.keys().next().value!)
    return controller.signal
  }

  /**
   * A reply written whole was then cut by the person speaking over it, or withdrawn because they went on before any of
   * it was heard: its recap is not kept. Withdrawn, the lines its message started with go back, ahead of any sent
   * since, to start the message of the turn that answers again.
   */
  replyUnheard(turnId: string, withdrawn: boolean): void {
    this.recaps.get(turnId)?.abort()
    this.recaps.delete(turnId)
    if (!withdrawn) return
    const at = this.heard.findIndex(h => h.turn.turnId === turnId && h.turn.shape === 'prefix')
    if (at < 0) return
    const { turn } = this.heard.splice(at, 1)[0]!
    this.lines = [...turn.lines, ...this.lines]
    this.prefixes.delete(turnId)
    this.awaitingReply = true
    this.turnOver = false
  }

  setPrefix(turnId: string, prefix: string): void {
    this.prefixes.set(turnId, prefix)
  }

  prefixOf(turnId: string): string | undefined {
    return this.prefixes.get(turnId)
  }

  /** Voice ended: the call in flight stops. */
  close(): void {
    this.inFlight?.abort()
    this.inFlight = null
    this.openTurn = null
  }
}

const states = new WeakMap<object, ListeningState>()

/** The listening state of a voice session, made on first use. */
export function listeningOf(session: object): ListeningState {
  let state = states.get(session)
  if (!state) {
    state = new ListeningState()
    states.set(session, state)
  }
  return state
}

/** The state when listening has begun in this session; undefined otherwise. */
export function listeningIfAny(session: object): ListeningState | undefined {
  return states.get(session)
}

/** The agent message's text: the lines heard, then the reply, a blank line between. */
export function joinHeard(lines: readonly string[], reply: string): { text: string; prefix: string } {
  const prefix = lines.map(l => l.trim()).filter(Boolean).join(' ')
  if (!prefix) return { text: reply, prefix: '' }
  return { text: reply.trim() ? `${prefix}\n\n${reply}` : prefix, prefix }
}

/** A stored agent message's reply, without the heard lines it starts with. */
export function replyOf(text: string, prefix: string | undefined): string {
  if (!prefix || !text.startsWith(prefix)) return text
  return text.slice(prefix.length).replace(/^\n\n/, '')
}

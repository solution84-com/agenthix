/**
 * Timing of speech to text, for development builds only: when the microphone, the token and the socket were ready,
 * when each chunk of audio was captured and sent, and when each message came back. The service times its words in
 * ms of the audio stream it was sent, so each word's end can be traced back to the moment it was captured, and the
 * lag of what the person sees measured. Nothing leaves the browser: a summary is printed to its console.
 */

/** A voice, not the room (the same level speech input treats as speaking). */
const SOUND_RMS = 0.02

type Chunk = { offset: number; ms: number; capturedAt: number; sentAt: number; level: number; buffered: number }
type Heard = { at: number; kind: string; order: number | null; final: boolean; lag: number | null; text: string; socket: number }

/** Lines kept for the summary; older ones are counted, not listed, so a long session prints a short screen. */
const LIST_LAST = 40
/** A long session keeps this many messages for its numbers. */
const KEEP = 1_000
const keepLast = <T>(xs: T[]) => { if (xs.length > KEEP) xs.splice(0, xs.length - KEEP) }

export type SpeechTrace = ReturnType<typeof createSpeechTrace>

export function createSpeechTrace(now: () => number = () => performance.now()) {
  const t0 = now()
  const marks: Record<string, number> = {}
  let audio: { contextRate: number; track: Record<string, unknown> | null } | null = null
  let chunks: Chunk[] = []
  let streamMs = 0
  let sockets = 0
  let audioMs = 0
  let droppedMs = 0
  let firstChunkAt: number | null = null
  const heard: Heard[] = []

  /** When the audio at `streamMs` into the socket's stream was captured. */
  const capturedAt = (at: number): number | null => {
    const c = chunks.find(ch => at < ch.offset + ch.ms) ?? chunks[chunks.length - 1]
    return c ? c.capturedAt - (c.offset + c.ms - at) : null
  }
  const report = () => summarise({ t0, marks, audio, chunks, heard, sockets, audioMs, droppedMs, firstChunkAt, now: now() })

  return {
    now,
    mark(name: 'microphone' | 'token' | 'socket created' | 'socket open' | 'stop', at: number = now()) {
      marks[name] ??= at
      // The service's word times count from the first audio on this socket.
      if (name === 'socket open') { streamMs = 0; chunks = []; sockets++ }
    },
    /** Audio heard while a socket opened and not sent: a burst of it would be lag. */
    dropped(ms: number) { droppedMs += ms },
    audio(contextRate: number, track: Record<string, unknown> | null) { audio = { contextRate, track } },
    /** One chunk sent: `ms` of audio at 16 kHz, captured at `capturedAt` (its last sample). */
    sent(ms: number, capturedAt: number, level: number, buffered = 0) {
      chunks.push({ offset: streamMs, ms, capturedAt, sentAt: now(), level, buffered })
      streamMs += ms
      audioMs += ms
      firstChunkAt ??= capturedAt - ms
      // Only the last two minutes are kept: the lag of each message is worked out when it arrives.
      while (chunks.length > 1200) chunks.shift()
    },
    message(data: unknown, at: number = now()) {
      let msg: { type?: string; turn_order?: unknown; end_of_turn?: boolean; transcript?: string; words?: { end?: number }[] }
      try { msg = JSON.parse(String(data)) } catch { return }
      const words = Array.isArray(msg.words) ? msg.words : []
      const lastEnd = words.length ? words[words.length - 1]!.end : undefined
      const captured = typeof lastEnd === 'number' ? capturedAt(lastEnd) : null
      heard.push({
        at,
        kind: msg.type ?? '?',
        order: typeof msg.turn_order === 'number' ? msg.turn_order : null,
        final: msg.end_of_turn === true,
        lag: captured === null ? null : at - captured,
        text: msg.transcript ?? '',
        socket: sockets,
      })
      keepLast(heard)
    },
    capturedAt,
    report,
    print() {
      if (!chunks.length && !heard.length) return
      // Development builds only: the person measuring latency reads this in the browser's console.
      console.info(report().lines.join('\n'))
    },
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}
const ms = (x: number | null | undefined) => (x == null ? '–' : `${Math.round(x)} ms`)

export type TimingReport = {
  firstWordsAfterSound: number | null
  partialLag: { median: number | null; max: number | null; count: number }
  finalLag: { median: number | null; max: number | null; count: number }
  lines: string[]
}

type Traced = {
  t0: number; marks: Record<string, number>; audio: { contextRate: number; track: Record<string, unknown> | null } | null
  chunks: Chunk[]; heard: Heard[]; sockets: number; audioMs: number; droppedMs: number
  firstChunkAt: number | null; now: number
}

const stats = (xs: number[]) => ({ median: median(xs), max: xs.length ? Math.max(...xs) : null, count: xs.length })
const quote = (text: string) => `“${text.length > 48 ? `${text.slice(0, 47)}…` : text}”`

function summarise(t: Traced): TimingReport {
  const rel = (x: number | undefined) => (x == null ? null : x - t.t0)
  const turns = t.heard.filter(h => h.kind === 'Turn')
  const partialLag = stats(turns.filter(h => !h.final).map(h => h.lag).filter((x): x is number => x != null))
  const finalLag = stats(turns.filter(h => h.final).map(h => h.lag).filter((x): x is number => x != null))
  const firstSound = t.chunks.find(c => c.level > SOUND_RMS)
  const firstWords = turns[0]
  const firstWordsAfterSound = firstSound && firstWords ? firstWords.at - (firstSound.capturedAt - firstSound.ms) : null
  const gaps = t.chunks.slice(1).map((c, i) => c.sentAt - t.chunks[i]!.sentAt)
  const maxBuffered = t.chunks.reduce((m, c) => Math.max(m, c.buffered), 0)
  const late = (lag: number | null) => (lag == null ? '' : ` lag ${ms(lag)}`)
  const elapsed = t.firstChunkAt == null ? null : t.now - t.firstChunkAt

  const lines = [
    '— Dictation timing (development build only) —',
    `audio: context ${t.audio?.contextRate ?? '?'} Hz, sent as 16000 Hz; microphone ${JSON.stringify(t.audio?.track ?? {})}`,
    `ready: microphone ${ms(rel(t.marks.microphone))}, token ${ms(rel(t.marks.token))}, socket created ${ms(rel(t.marks['socket created']))}, open ${ms(rel(t.marks['socket open']))}`,
    `sockets: ${t.sockets} opened`,
    `sent: ${ms(t.audioMs)} of audio over ${ms(elapsed)}, ${ms(t.droppedMs)} heard while sockets opened not sent; gap between sends median ${ms(median(gaps))}, max ${ms(gaps.length ? Math.max(...gaps) : null)}; socket backlog max ${maxBuffered} bytes`,
    `first sound → first words: ${ms(firstWordsAfterSound)}`,
    `partial lag (word spoken → shown): median ${ms(partialLag.median)}, max ${ms(partialLag.max)}, over ${partialLag.count}`,
    `final lag (last word spoken → turn ended): median ${ms(finalLag.median)}, max ${ms(finalLag.max)}, over ${finalLag.count}`,
    ...(turns.length > LIST_LAST ? [`  … ${turns.length - LIST_LAST} earlier messages`] : []),
    ...turns.slice(-LIST_LAST).map(h => `  ${ms(rel(h.at))} socket ${h.socket} turn ${h.order ?? '?'} ${h.final ? 'final  ' : 'partial'}${late(h.lag)}  ${quote(h.text)}`),
  ]
  return { firstWordsAfterSound, partialLag, finalLag, lines }
}

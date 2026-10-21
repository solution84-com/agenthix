import { readFileSync } from 'node:fs'
import type { ServiceWord } from '../../ports'

/** One recorded message of the speech service, `at` ms after the recording began. */
export type RecordedMessage = { at: number; msg: ProviderMessage }

export type ProviderMessage = {
  type: string
  turn_order?: number
  end_of_turn?: boolean
  transcript?: string
  words?: Array<{ text: string; start: number; end: number }>
}

/** Reads a `fixtures/*.jsonl` recording of the provider's messages (lines with no `msg`, like the timeline, are skipped). */
export function readProviderRecording(path: string): RecordedMessage[] {
  return readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { at: number; offset?: number; msg?: ProviderMessage })
    .filter(line => line.msg)
    .map(line => ({ at: (line.offset ?? 0) + line.at, msg: line.msg! }))
    .sort((a, b) => a.at - b.at)
}

export type WordsMessage = { text: string; words: ServiceWord[]; committed: boolean; order: number | null }

/** A `Turn` message as the words the speech service port carries; null for any other kind of message. */
export function wordsOf(msg: ProviderMessage): WordsMessage | null {
  if (msg.type !== 'Turn') return null
  return {
    text: msg.transcript ?? '',
    words: (msg.words ?? []).map(w => ({ text: w.text, start: w.start, end: w.end })),
    committed: msg.end_of_turn === true,
    order: msg.turn_order ?? null,
  }
}

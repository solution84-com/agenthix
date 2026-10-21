/**
 * The inbound loop as an adapter: the microphone's `audio.frame` events and silence detection's `acoustic.silence`
 * into the sender (`stt/sender`), and its words, state and lag out as `stt.words`, `stt.status` and `stt.lag`. A sent
 * message (`orchestration.send`) commits the words heard and keeps the connection; `stt.replace` replaces it.
 */
import type { Clock } from '../clock'
import type { SpeechToText } from '../ports'
import type { Adapter } from '../runtime/types'
import { createSender, type Sender } from '../stt/sender'

export type SttInboundDeps<T> = {
  clock: Clock
  getToken: () => Promise<T>
  service: (token: T) => SpeechToText
  failed?: (message: string) => void
}

export function sttInbound<T>(deps: SttInboundDeps<T>): Adapter & { sender: () => Sender | null } {
  let sender: Sender | null = null
  return {
    name: 'sttInbound',
    sender: () => sender,
    start(runtime) {
      const mine = createSender({ ...deps, settings: runtime.settings, publish: runtime.publish })
      sender = mine
      const offs = [
        runtime.subscribe(['audio.frame'], e => mine.frame(e.pcm, e.t)),
        runtime.subscribe(['acoustic.silence'], e => mine.silence(e.silent, e.t)),
        runtime.subscribe(['stt.muted'], e => mine.setMuted(e.muted)),
        runtime.subscribe(['orchestration.send'], () => mine.sent()),
        runtime.subscribe(['stt.endTurn'], () => mine.endTurn()),
        runtime.subscribe(['stt.replace'], e => mine.replace(e.reason)),
        runtime.subscribe(['clock.tick'], () => mine.tick()),
      ]
      mine.start()
      return () => { offs.forEach(off => off()); mine.stop(); if (sender === mine) sender = null }
    },
  }
}

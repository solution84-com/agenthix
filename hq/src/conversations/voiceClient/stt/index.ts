/**
 * STT's parts, for the session to wire in: the echo filter, and the inbound loop's adapter (the send queue, the
 * connection's replacement, the lag and the reconciler). They replace today's speech input in voice and its socket
 * policy; dictation keeps its own speech input.
 */
import { assemblyAi, VOICE_STT_CONFIG, type SttConfig } from '../adapters/assemblyAi'
import { sttInbound, type SttInboundDeps } from '../adapters/sttInbound'
import type { Clock } from '../clock'
import type { AnyComponent } from '../runtime/types'
import { echoFilter } from './echoFilter'

export type SttToken = { token: string; config?: SttConfig }

/** The organisation's speech service on one of hq's tokens, with voice's settings over the organisation's. */
export const assemblyAiService = (t: SttToken) => assemblyAi({ token: t.token, config: { ...t.config, ...VOICE_STT_CONFIG } })

export type SttPartsDeps = Omit<SttInboundDeps<SttToken>, 'service'> & { clock: Clock; service?: SttInboundDeps<SttToken>['service'] }

export function sttParts(deps: SttPartsDeps) {
  const inbound = sttInbound({ ...deps, service: deps.service ?? assemblyAiService })
  const components: AnyComponent[] = [echoFilter]
  return { components, adapters: [inbound], inbound }
}

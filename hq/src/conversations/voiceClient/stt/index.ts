/**
 * STT's parts, for the session to wire in: the echo filter, and the inbound loop's adapter (the send queue, the
 * connection's replacement, the lag and the reconciler). They replace today's speech input in voice and its socket
 * policy; dictation keeps its own speech input.
 */
import { assemblyAi, VOICE_STT_CONFIG, type SttConfig } from '../adapters/assemblyAi'
import { inworldHearing } from '../adapters/inworldHearing'
import { sttInbound, type SttInboundDeps } from '../adapters/sttInbound'
import type { Clock } from '../clock'
import type { AnyComponent } from '../runtime/types'
import { echoFilter } from './echoFilter'
import type { VoiceSettings } from '../settings'
import { toneOn } from '../tone/settings'

/** `provider`: the service the token is for; AssemblyAI when absent. */
export type SttToken = { token: string; provider?: string; config?: SttConfig; ticket?: string }

/** The organisation's speech service on one of hq's tokens, with voice's settings over the organisation's. */
export const assemblyAiService = (t: SttToken) => assemblyAi({ token: t.token, config: { ...t.config, ...VOICE_STT_CONFIG } })

/** The services voice can hear through, for hq to choose among (`getSpeechToken`'s `hears`), the default first. */
export const VOICE_HEARS = ['inworld', 'assemblyai'] as const

/**
 * The service the token was minted for: Inworld's adapter or AssemblyAI's, the same behind the port. Inworld is asked for
 * the voice profile with Adaptive voice and its switch on (`../tone/settings`), read as each connection opens.
 */
export const speechService = (t: SttToken, settings?: VoiceSettings) =>
  t.provider === 'inworld'
    ? inworldHearing({ token: t.token, config: inworldConfig(t.config, settings), voiceProfile: !!settings && voiceProfileOn(settings) })
    : assemblyAiService(t)

/** hq's config for Inworld, told the person speaks English unless hq names a language or the settings say detect it. */
export function inworldConfig(config: SttConfig | undefined, settings?: VoiceSettings): SttConfig {
  if (typeof config?.language === 'string' && config.language) return config
  return (settings?.tone.speechLanguage ?? 'en') === 'en' ? { ...config, language: 'en' } : { ...config }
}

/** With the light model listening (the flag `voiceListener` and Adaptive voice), as the backchannel runs. */
export const voiceProfileOn = (s: VoiceSettings) => toneOn(s)

export type SttPartsDeps = Omit<SttInboundDeps<SttToken>, 'service'> & { clock: Clock; service?: SttInboundDeps<SttToken>['service'] }

export function sttParts(deps: SttPartsDeps) {
  const inbound = sttInbound({ ...deps, service: deps.service ?? speechService })
  const components: AnyComponent[] = [echoFilter]
  return { components, adapters: [inbound], inbound }
}

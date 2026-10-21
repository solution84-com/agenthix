/**
 * Voice as a mode of the conversation (conversational experience spec, Voice; phase 5): declared in core's client
 * protocol, since the mobile app relies on it too, and re-exported here and from protocol.ts for hq's code.
 */
export { CONVERSATION_VOICE_SOCKET, VOICE_SILENCE_END_MS, VOICE_SILENCE_WARNING_MS } from '@agenthix/core'
export type {
  ConversationVoiceView, SpeechToken, SpeechTokenConfigValue, VoiceActivityPayload, VoiceAudioEvent,
  VoiceContinuePayload, VoiceEndedEvent, VoiceEndPayload, VoiceErrorEvent, VoiceInterruptPayload, VoiceInvitePayload,
  VoicePhraseEvent, VoiceSentenceEvent, VoiceServices, VoiceSilenceWarningEvent, VoiceStartPayload, VoiceStateEvent,
  VoiceTurnSpokenEvent, VoiceUpdateEvent,
} from '@agenthix/core'

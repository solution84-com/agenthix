import type { SpeechToken } from '../shared/conversations/voice'

/**
 * A speech token as hq's own screens receive it: core's token, and the ticket the browser hands back with the audio it
 * streamed (`reportSpeechSession`), so the session is written to the ledger. The mobile app's token has none.
 */
export type TicketedSpeechToken = SpeechToken & { ticket: string }

/**
 * This site's live-preview settings as a fleet admin set them (`site.livePreviews`), sent by hq at every connect and
 * on every change. Held in memory: until hq has said them, live previews are off here. `idleMinutes` is held with the
 * rest as sent, but only hq reads it: the idle stop is hq's, and nothing on this site stops a live preview for idleness.
 */
import {
  LIVE_PREVIEW_IDLE_MINUTES_DEFAULT, LIVE_PREVIEW_LIMIT_DEFAULT, livePreviewLimitAllows, type SiteLivePreviewsParams,
} from '@agenthix/core'

const OFF: SiteLivePreviewsParams = { allowed: false, limit: LIVE_PREVIEW_LIMIT_DEFAULT, idleMinutes: LIVE_PREVIEW_IDLE_MINUTES_DEFAULT }

let current: SiteLivePreviewsParams = OFF

export function livePreviewSettings(): SiteLivePreviewsParams {
  return current
}

export function setLivePreviewSettings(next: SiteLivePreviewsParams): void {
  current = { ...next }
}

export function roomForOneMore(open: number): boolean {
  return livePreviewLimitAllows(current.limit, open)
}

export function resetLivePreviewSettingsForTests(): void {
  current = OFF
}

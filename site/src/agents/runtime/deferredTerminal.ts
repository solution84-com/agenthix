import type { RunOptions } from './types'

/**
 * Whether the run has requested tools or bash patterns outside its manifest by
 * its terminal moment. When it has, deferredManifestReport.ts sends the run's one
 * terminal frame and the engine withholds its own (RunOutcome.withheldFrame).
 */
export function hasDeferredRequests(options: Pick<RunOptions, 'deferredManifest'>): boolean {
  const collector = options.deferredManifest
  return !!collector && (collector.tools.length > 0 || collector.bashPatterns.length > 0)
}

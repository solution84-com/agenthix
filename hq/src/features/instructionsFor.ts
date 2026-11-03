/**
 * The instructions seam (adr-0172): a run's or the lead's instructions, each part kept only while the flag it names is
 * on. Apart from `runFeatures.ts`, with no import of hq's server, so instructions built as plain text can use it.
 */
import type { FeatureFlag } from '@agenthix/core'

/** Each part kept only while the flag it names is on; a part naming none is always kept. */
export function instructionsFor(features: { isOn(flag: FeatureFlag): boolean }, parts: ReadonlyArray<{ flag?: FeatureFlag; text: string }>): string[] {
  return parts.filter(p => !p.flag || features.isOn(p.flag)).map(p => p.text)
}

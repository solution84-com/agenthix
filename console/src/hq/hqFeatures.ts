/**
 * Which flagged features are on for the organisation, as hq answers it (adr-0172). The Fleet Console shows a flagged
 * feature's section only while hq says it is on, and refuses that section's routes otherwise; hq applies core's rule
 * before it answers, and checks again on every call the section makes. Read here, kept briefly, and fails closed:
 * nothing is on while hq does not answer, refuses, or says what this Fleet Console does not know.
 */
import { FEATURE_FLAG_NAMES, type FeatureFlag } from '@agenthix/core'
import type { HqLink } from './link'

/** Asks hq which flags are on; its answer is `{ on: [flag, …] }`. */
export type AskFeatures = () => Promise<unknown>

const FRESH_MS = 10_000

/** The flags named on, of those this Fleet Console knows; anything else in the answer is dropped. */
export function parseFeaturesOn(raw: unknown): FeatureFlag[] {
  const on = typeof raw === 'object' && raw !== null ? (raw as { on?: unknown }).on : undefined
  if (!Array.isArray(on)) return []
  return FEATURE_FLAG_NAMES.filter(flag => on.includes(flag))
}

export class HqFeatures {
  private kept: { on: FeatureFlag[]; at: number } | null = null
  private asking: Promise<FeatureFlag[]> | null = null

  constructor(
    private readonly link: HqLink,
    private readonly ask: AskFeatures | null,
    private readonly now: () => number = Date.now,
  ) {}

  async on(): Promise<FeatureFlag[]> {
    if (!this.ask || this.link.state !== 'connected') return []
    if (this.kept && this.now() - this.kept.at < FRESH_MS) return this.kept.on
    const ask = this.ask
    this.asking ??= ask()
      .then(parseFeaturesOn, () => [])
      .then(on => {
        this.kept = { on, at: this.now() }
        return on
      })
      .finally(() => { this.asking = null })
    return this.asking
  }

  async isOn(flag: FeatureFlag): Promise<boolean> {
    return (await this.on()).includes(flag)
  }
}

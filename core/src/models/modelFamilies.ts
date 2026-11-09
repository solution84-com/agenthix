/**
 * The named families a default model is the newest of (ADR-0184), the one place a model's name pattern is written for
 * a default. Mid-tier on purpose: a new version of a family is the same tier, where a vendor's flagship costs several
 * times as much. A pattern matches `maker/name` with a trailing date already removed and dots read as hyphens, and is
 * written to match only the family's own models: no mini, nano, codex, pro, image or other specialised variant.
 */
import type { AiProviderVendor } from '../providers/providers.js'

export type ModelFamily = {
  id: string
  /** Matches `maker/name`, lower case, dotted versions as hyphens, no trailing date. */
  pattern: RegExp
}

const VERSION = String.raw`\d+(?:-\d+)*`

export const MODEL_FAMILIES = {
  'claude-sonnet': { id: 'claude-sonnet', pattern: new RegExp(String.raw`^anthropic/claude-sonnet-(?:latest|${VERSION})$`) },
  'gpt-main': { id: 'gpt-main', pattern: new RegExp(String.raw`^openai/gpt-${VERSION}$`) },
  'gemini-pro': { id: 'gemini-pro', pattern: new RegExp(String.raw`^google/gemini-(?:pro-latest|${VERSION}-pro(?:-preview)?)$`) },
} as const satisfies Record<string, ModelFamily>

export type ModelFamilyId = keyof typeof MODEL_FAMILIES

/** The family each vendor's default is the newest of. Adding a vendor is one line. */
export const DEFAULT_FAMILY_OF: Partial<Record<AiProviderVendor, ModelFamilyId>> = {
  anthropic: 'claude-sonnet',
  openrouter: 'claude-sonnet',
  inworld: 'claude-sonnet',
  openai: 'gpt-main',
  google: 'gemini-pro',
}

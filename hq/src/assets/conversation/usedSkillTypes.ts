/** What the panel beside the thread shows of a skill a run used (spec part 5 *Seeing it used*). Client-safe. */
import type { FileKind } from '@agenthix/core'

export type GetUsedSkillArgs = {
  conversationId: string
  /** The work whose run used it. */
  operationId: string
  /** The name the run staged it under, as its step names it. */
  name: string
  /** The file to read; `SKILL.md` when not given. */
  path?: string
}

export type UsedSkillFileView = { path: string; size: number; kind: FileKind; contentType: string; language?: string }

export type UsedSkillView = {
  name: string
  level: 'built-in' | 'installed' | 'place' | 'yours'
  title: string
  where: string
  version: string | null
  identity: string | null
  path: string | null
  fingerprint: string
  publisher: string | null
  newer: string | null
  /** Null when hq holds no copy of the version the run used: "This version isn't kept". */
  kept: {
    files: UsedSkillFileView[]
    /** The file asked for, as base64. */
    opened: { path: string; base64: string }
  } | null
  /** Where it can be looked after, for an installed skill. */
  openHref: string | null
}

/** A work step's line, and the skill it opens when the person may see it. */
export type UsedSkillStepView = { text: string; skill?: { name: string } }

export const USED_SKILL_NOT_FOUND = "That skill isn't there, or isn't yours to see."
export const USED_SKILL_NOT_KEPT = "This version isn't kept, so HQ can't show what the agent read."
/** Why, for a skill in a place's files: the only way HQ keeps one is by publishing it. */
export const USED_SKILL_NOT_PUBLISHED = 'It was changed in the files and never published.'

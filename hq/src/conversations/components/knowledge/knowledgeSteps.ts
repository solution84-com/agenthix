import type { KnowledgeStepView } from '@agenthix/core'
import { knowledgeHistoryHref } from '../../../storage/pages/knowledge/history/historyLinks'

export type ChangeStep = Extract<KnowledgeStepView, { kind: 'knowledge_change' }>

export const ORG_KNOWLEDGE_PATH = '/org/knowledge'

/** What a change is called in the step's line. */
export const CHANGE_WORDS: Record<ChangeStep['change'], string> = {
  created: 'Wrote page',
  edited: 'Updated page',
  moved: 'Moved page',
  deleted: 'Deleted page',
  restored: 'Restored page',
}

/** The page's title, or its file name worded when it has none. */
export function titleOfStep(step: Pick<ChangeStep, 'page' | 'title'>): string {
  if (step.title.trim()) return step.title.trim()
  const last = step.page.split('/').pop() ?? step.page
  const words = last.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : step.page
}

/**
 * Where See change opens: the page's History at the version, in the place that holds it. The organisation's pages
 * open in its own area; others in the conversation's place. Null when there is no version (a deleted page) or no place.
 */
export function seeChangeHref(step: ChangeStep, placePath: string | undefined): string | null {
  const base = step.owner.ownerType === 'org' ? ORG_KNOWLEDGE_PATH : placePath
  return step.versionId && base ? knowledgeHistoryHref(base, step.page, step.versionId) : null
}

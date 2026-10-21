/**
 * Prompt section registry
 * =======================
 * Shared types for structured prompt sections across all run modes.
 * Used by AgentPromptBuilder (server) and PromptTab (client).
 */

export const PROMPT_SECTION_KEY = {
  IDENTITY:         'identity',
  ORG:              'org',
  INSTRUCTIONS:     'instructions',
  MEMORY:           'memory',
  AGENDA:           'agenda',
  EXECUTION:        'execution',
  // Task-mode runtime sections (injected at execution time, shown as read-only placeholders in preview)
  PROJECT:          'project',
  BOARD:            'board',
  TASK_DETAIL:      'task_detail',
} as const

export type PromptSectionKey = typeof PROMPT_SECTION_KEY[keyof typeof PROMPT_SECTION_KEY]

export interface PromptSection {
  key:      PromptSectionKey
  label:    string
  content:  string
  editable: boolean
}

/** Maps editable section keys to the agent content file they save to. */
export type AgentConfigFileName = 'instructions.md'

export const EDITABLE_SECTION_FILES: Partial<Record<PromptSectionKey, AgentConfigFileName>> = {
  [PROMPT_SECTION_KEY.INSTRUCTIONS]: 'instructions.md',
}

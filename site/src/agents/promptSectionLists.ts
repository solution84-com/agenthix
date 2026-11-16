import { PROMPT_SECTION_KEY, PromptSection } from '../shared/promptSections'
import type { PromptContent } from './promptContent'
import {
  type AgentLike,
  buildAgentIdentityContent,
  buildMemoryContent,
  buildOrgSection,
  buildAgendaSection,
  buildNoAgendaSection,
  AGENDA_PREVIEW_PATH,
  buildTaskExecutionSection,
} from '@agenthix/core'

/** A preview has no place, so the place's `AGENTS.md` is described rather than shown. */
const PLACE_PREVIEW =
  "## Instructions for this place\n\n_The place's `AGENTS.md`, at the top of its files, is injected at execution time._"

/** Preview only (no real run). */
export function chatPreviewSections(agent: AgentLike, content: PromptContent): PromptSection[] {
  const agendaGuidance = buildAgendaSection(AGENDA_PREVIEW_PATH, null)

  return [
    {
      key:      PROMPT_SECTION_KEY.IDENTITY,
      label:    'Identity',
      content:  buildAgentIdentityContent(agent),
      editable: false,
    },
    {
      key:      PROMPT_SECTION_KEY.INSTRUCTIONS,
      label:    'Instructions',
      content:  content.instructions ?? '',
      editable: true,
    },
    {
      key:      PROMPT_SECTION_KEY.MEMORY,
      label:    'Memory',
      content:  buildMemoryContent(),
      editable: false,
    },
    {
      key:      PROMPT_SECTION_KEY.AGENDA,
      label:    'Agenda',
      // Prepend a note so the user understands what happens at runtime
      content:  `> _The person's own agenda file, and the path to it in the location the run works in, are filled in during live sessions._\n\n${agendaGuidance}`,
      editable: false,
    },
    {
      // The key the task preview has always used for this section, which hq's
      // prompt view already knows.
      key:      PROMPT_SECTION_KEY.PROJECT,
      label:    'Place instructions',
      content:  PLACE_PREVIEW,
      editable: false,
    },
  ]
}

/** Preview only (no real run). */
export function taskPreviewSections(agent: AgentLike, content: PromptContent): PromptSection[] {
  const taskExecution  = buildTaskExecutionSection('<project-repo>/docs/artifacts/roadmaps/ROADMAP.md')

  return [
    {
      key:      PROMPT_SECTION_KEY.IDENTITY,
      label:    'Identity',
      content:  buildAgentIdentityContent(agent),
      editable: false,
    },
    {
      key:      PROMPT_SECTION_KEY.ORG,
      label:    'Organisation',
      content:  buildOrgSection(content.org) ?? '',
      editable: false,
    },
    {
      key:      PROMPT_SECTION_KEY.INSTRUCTIONS,
      label:    'Instructions',
      content:  content.instructions ?? '',
      editable: true,
    },
    {
      key:      PROMPT_SECTION_KEY.MEMORY,
      label:    'Memory',
      content:  buildMemoryContent(),
      editable: false,
    },
    {
      key:      PROMPT_SECTION_KEY.AGENDA,
      label:    'Agenda',
      // A task run acts for the project, not for a person, so it has none.
      content:  buildNoAgendaSection(),
      editable: false,
    },
    {
      key:      PROMPT_SECTION_KEY.PROJECT,
      label:    'Place instructions',
      content:  PLACE_PREVIEW,
      editable: false,
    },
    {
      key:      PROMPT_SECTION_KEY.BOARD,
      label:    'Board',
      content:  '## Board\n\n_Board name and column list are injected at execution time._',
      editable: false,
    },
    {
      key:      PROMPT_SECTION_KEY.TASK_DETAIL,
      label:    'Task',
      content:  '## Task\n\n_Task ID, title, and description are injected at execution time._',
      editable: false,
    },
    {
      key:      PROMPT_SECTION_KEY.EXECUTION,
      label:    'Execution Rules',
      content:  taskExecution,
      editable: false,
    },
  ]
}

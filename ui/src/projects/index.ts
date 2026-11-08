export { ProjectCard, ProjectCountsLine, projectCountParts } from './ProjectCard'
export type { ProjectCardCounts, ProjectCardData, ProjectCardProps } from './ProjectCard'
export { PlaceCard, PlaceCardNow, PLACE_CARD_STATE_LABEL } from './PlaceCard'
export type { PlaceCardProps, PlaceCardState } from './PlaceCard'

export { ProjectAgentsList } from './ProjectAgentsList'
export type { ProjectAgent, ProjectAgentsListProps } from './ProjectAgentsList'

export type { CreateProjectInput, ProjectActions } from './types'

export { deriveSlug, deriveProjectKey } from '@agenthix/core'



export { AutomationOverview } from './AutomationOverview'
export type { AutomationOverviewProps, AutomationNow } from './AutomationOverview'
export { AutomationRoutines } from './AutomationRoutines'
export { AutomationSwitch } from './AutomationSwitch'
export type { AutomationRoutinesProps, AutomationRoutineRow } from './AutomationRoutines'
export { AutomationRules } from './AutomationRules'
export type { AutomationRulesProps } from './AutomationRules'
export { whenLabel } from './AutomationTypes'
export type {
  AutomationStatusView, AutomationOrgValues, AutomationRunLimits, AutomationStuckItem, AutomationLaterItem,
} from './AutomationTypes'

export {
  kindLabel, sizeLabel, kindAndSize, changedLabel, newestFirst, groupByRecency, visibleEntries, filterByName, filterTopics,
  tagsOf, joinPath, parentOf,
} from './fileListing'
export type { ListedEntry, KnowledgeTopic, RecencyGroup } from './fileListing'

export {
  FILES_BUTTON, FILES_BUTTON_PRIMARY, FilesViewHeader, FilesToolNote, FilesQuietLine, FilesGroupHeading, FileRow, TopicRow, WorkspaceCard, FileFact,
} from './FilesToolParts'
export type { FileRowProps, TopicRowProps, WorkspaceCardProps } from './FilesToolParts'

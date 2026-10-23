export { ProjectHeader } from './ProjectHeader'
export type { ProjectHeaderProps } from './ProjectHeader'

export { ProjectStats } from './ProjectStats'
export type { TaskCounts, ProjectStatsProps } from './ProjectStats'

export { ProjectCard } from './ProjectCard'
export type { ProjectCardData, ProjectCardProps } from './ProjectCard'
export { PlaceCard, PlaceCardNow, PLACE_CARD_STATE_LABEL } from './PlaceCard'
export type { PlaceCardProps, PlaceCardState } from './PlaceCard'

export { ProjectProgressBar } from './ProjectProgressBar'
export type { ProjectExecutionCounts, ProjectProgressBarProps } from './ProjectProgressBar'

export { ProjectAgentsList } from './ProjectAgentsList'
export type { ProjectAgent, ProjectAgentsListProps } from './ProjectAgentsList'

export { ProjectTabBar } from './ProjectTabBar'
export type { ProjectTab, ProjectTabBarProps } from './ProjectTabBar'

export { CreateProjectModal } from './CreateProjectModal'
export type { CreateProjectModalProps, ProductOption, ProgramOption, BillingProfileOption } from './CreateProjectModal'

export type { CreateProjectInput, ProjectActions } from './types'

export { deriveSlug, deriveProjectKey } from '@agenthix/core'

export { ProjectPicker } from './ProjectPicker'
export type { ProjectPickerProps, ProjectOption } from './ProjectPicker'


export { AutomationOverview } from './AutomationOverview'
export type { AutomationOverviewProps, AutomationNow, AutomationState } from './AutomationOverview'
export { AutomationRoutines } from './AutomationRoutines'
export { AutomationSwitch } from './AutomationSwitch'
export type { AutomationRoutinesProps, AutomationRoutineRow } from './AutomationRoutines'
export { AutomationRules } from './AutomationRules'
export type { AutomationRulesProps } from './AutomationRules'
export type { AutomationLimitsDraft } from './AutomationLimitsForm'
export { NO_AUTOMATION_CHOICE, whenLabel } from './AutomationTypes'
export type {
  AutomationStatusView, AutomationChoice, AutomationOrgValues, AutomationEffectiveValues, AutomationRunLimits,
  AutomationStuckItem, AutomationLaterItem,
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

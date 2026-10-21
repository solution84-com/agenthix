import { PlaceCard, type PlaceCardProps, type PlaceCardState } from './PlaceCard'
import { PlaceAvatar } from '../primitives/PlaceAvatar'

export interface ProjectCardData {
  id: string
  name: string
  /** Optional short description rendered under the title. */
  description?: string | null
  /** Number of boards, used in the footer line. */
  boardCount?: number
  /** Done tasks (numerator in "Done/Total tasks"). */
  doneTaskCount?: number
  /** Total tasks (denominator in "Done/Total tasks"). */
  totalTaskCount?: number
  /** What is happening in it now; a project with no word yet reads as quiet. */
  now?: { state: PlaceCardState; detail?: string | null }
  /** An open project the person has not joined: marked as such, and it opens a preview with Join. */
  notJoined?: boolean
  /** Opens the project's boards: "N boards" becomes a link of its own. */
  onOpenBoards?: () => void
}

export interface ProjectCardProps {
  project: ProjectCardData
  /** Visual-only: makes the whole card a clickable link via the wrapper element. */
  as?: React.ElementType
  /** Forwarded to the wrapper element (e.g. a `to` prop for react-router Link). */
  [key: string]: unknown
}

/** A project on the Projects screen: the shared card, with the project's avatar for its picture. */
export function ProjectCard({ project, as, ...rest }: ProjectCardProps) {
  const facts: PlaceCardProps['facts'] = []
  if (project.notJoined) facts.push('Open project · not joined')
  else if (project.boardCount != null) {
    const text = `${project.boardCount} ${project.boardCount === 1 ? 'board' : 'boards'}`
    facts.push(project.onOpenBoards ? { text, onSelect: project.onOpenBoards } : text)
  }
  if (!project.notJoined && project.totalTaskCount != null) facts.push(`${project.doneTaskCount ?? 0} of ${project.totalTaskCount} tasks done`)
  return (
    <PlaceCard
      {...rest}
      as={as}
      avatar={<PlaceAvatar kind="project" id={project.id} name={project.name} size="lg" />}
      name={project.name}
      line={project.description}
      now={project.now ?? { state: 'quiet' }}
      facts={facts}
      action={project.notJoined ? 'Look →' : 'Open →'}
    />
  )
}

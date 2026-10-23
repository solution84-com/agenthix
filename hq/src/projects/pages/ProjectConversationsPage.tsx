import { Navigate, useLocation, useParams } from 'react-router'
import { PlaceScreen } from '../../places/components/PlaceScreen'
import { PlaceMobileHeader } from '../../places/components/PlaceMobileHeader'
import { useProjectPlace } from '../place/useProjectPlace'
import { ProjectPlaceMissing } from '../place/ProjectPlaceMissing'
import { WelcomeLine } from '../../home/components/WelcomeLine'
import { NewConversationsList } from '../../conversations/components/NewConversationsList'
import { SPACE_PATH } from '../../chat/chatPlacePaths'

/** A project (spec §6, §7): its sections, opening on Overview; its conversations are a section. */
export function ProjectConversationsPage() {
  const { key } = useParams<{ key: string }>()
  const { search } = useLocation()
  const { project, place, isLoading } = useProjectPlace(key)
  if (!project || !place) return <ProjectPlaceMissing loading={isLoading} />
  // Your space is shown as Chat; its old links lead there.
  if (project.personalSpace) return <Navigate to={`${SPACE_PATH}${search}`} replace />

  return (
    <PlaceScreen
      place={place}
      breadcrumbs={[place.breadcrumbs[0], { label: project.name }]}
      mobileHeader={<PlaceMobileHeader backHref={place.backHref} title={project.name} />}
      conversations={
        <NewConversationsList
          place={place}
          header={<WelcomeLine />}
          home="PROJECT"
          projectId={project.id}
          boxPlaceholder={place.composerPlaceholder}
          noAgentsNotice={place.noAgentsNotice}
        />
      }
    />
  )
}

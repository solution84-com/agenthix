import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAction, joinProject } from 'wasp/client/operations'
import { ProjectPreviewView, type ProjectPreviewData } from '@agenthix/ui/people'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { personAvatarOf } from '../../people/AuthedPersonAvatar'
import { PersonProfileTrigger } from '../../people/PersonProfileCard'
import { AgentProfileTrigger } from '../../agents/profile/AgentProfileCard'
import { avatarOf } from '../agents/avatarOf'
import { reasonOf } from './people/peopleErrors'

/** An open project the person has not joined: what it is, then Join, which opens the project. */
export function ProjectPreviewPage({ preview }: { preview: ProjectPreviewData }) {
  const navigate = useNavigate()
  const join = useAction(joinProject)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const { project } = preview

  const onJoin = async () => {
    setJoining(true)
    setError('')
    try {
      await join({ projectId: project.id })
      // Stays "Joining…" until the project's own screen replaces this one.
      navigate(`/projects/${project.key}`)
    } catch (err) {
      setError(reasonOf(err, 'Could not join the project'))
      setJoining(false)
    }
  }

  return (
    <AppLayout breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project.name }]}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ProjectPreviewView
          preview={preview}
          now={new Date()}
          renderPersonAvatar={personAvatarOf}
          renderAgentAvatar={avatarOf}
          profileOf={(userId, children) => <PersonProfileTrigger userId={userId}>{children}</PersonProfileTrigger>}
          agentProfileOf={(agentId, children) => <AgentProfileTrigger agentId={agentId}>{children}</AgentProfileTrigger>}
          joining={joining}
          error={error}
          onJoin={() => void onJoin()}
        />
      </div>
    </AppLayout>
  )
}

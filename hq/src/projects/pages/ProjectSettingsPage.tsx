import { useParams } from 'react-router'
import { useQuery, getProjectByKey, getProjectMembers, getUserSettings } from 'wasp/client/operations'
import { useAuth } from 'wasp/client/auth'
import { ModelPolicyForm } from '../../model-policy/components/ModelPolicyForm'
import { ModelAccessSection } from '../../model-access/pages/ModelAccessSection'
import { ProjectRunTimeLimit } from '../../automation/pages/ProjectRunTimeLimit'
import { ArchiveFinishedSection } from './ArchiveFinishedSection'
import { AboutSection } from './settings/AboutSection'
import { AccessSection } from './settings/AccessSection'
import { AgentsSection } from './settings/AgentsSection'
import { DeleteSection } from './settings/DeleteSection'
import { FilingSection } from './settings/FilingSection'
import { Section } from './settings/Part'
import { WhereItRuns } from './settings/WhereItRuns'
import { adminsLine, settingsRights } from './settings/settingsRights'
import type { SettingsProject } from './settings/types'

type Member = { userId: string; username: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' }

/**
 * A project's Settings tool (every screen reviewed spec §3): each part is a field
 * only for the people the server lets change it, and text for everyone else. Each
 * part saves on its own.
 */
export function ProjectSettingsPage() {
  const { key } = useParams<{ key: string }>()
  const { data: authUser } = useAuth()
  const { data: project } = useQuery(getProjectByKey, key ? { key } : undefined)
  const { data: mySettings } = useQuery(getUserSettings)
  const proj: SettingsProject | undefined = project
  const { data: members } = useQuery(getProjectMembers, proj?.id ? { projectId: proj.id } : undefined)

  if (!proj || !members) return <p className="px-6 py-6 text-small text-text-muted">Loading…</p>

  const people = members as Member[]
  const personal = !!proj.personalOwnerId
  const rights = settingsRights({
    personal,
    isProjectAdmin: people.some(m => m.userId === authUser?.id && m.role === 'ADMIN'),
    isOrgAdmin: (mySettings as { role?: string } | undefined)?.role === 'ADMIN',
  })

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-lg space-y-6">
        {rights.namesAdmins && (
          <p className="text-small text-text-secondary">{adminsLine(people.filter(m => m.role === 'ADMIN').map(m => m.username))}</p>
        )}
        {personal && (
          <p className="text-small text-text-muted">
            This is your personal project. Only you can see it, and its tasks run as you: in your own
            files, with your own model access and your own agent settings.
          </p>
        )}

        <Section title="About">
          <AboutSection project={proj} canEdit={rights.editOwn} personal={personal} />
          {!personal && <FilingSection project={proj} canEdit={rights.editFiling} />}
        </Section>

        {!personal && (
          <Section title="Access">
            <AccessSection project={proj} canEdit={rights.editOwn} />
          </Section>
        )}

        {!personal && (
          <Section title="Agents">
            <AgentsSection project={proj} canEdit={rights.editOwn} />
          </Section>
        )}

        {!personal && (
          <Section title="Where it runs">
            <WhereItRuns project={proj} />
          </Section>
        )}

        {!personal && (
          <Section title="Models">
            <p className="text-small text-text-muted">
              Which models this project's work uses. Where it chooses none, the organisation's applies.
            </p>
            <ModelPolicyForm scope="project" projectId={proj.id} canEdit={rights.editOwn} />
          </Section>
        )}

        {rights.editOwn && !personal && (
          <Section title="Model access">
            <p className="text-small text-text-muted">
              This project's own API key or Claude login. Every run and task in this project uses it first,
              before the model access of the person it is for and the organisation's.
            </p>
            <ModelAccessSection ownerType="project" ownerId={proj.id} />
          </Section>
        )}

        <Section title="Runs and finished tasks">
          <ProjectRunTimeLimit projectId={proj.id} canEdit={rights.editOwn} />
          <ArchiveFinishedSection scope={{ kind: 'project', projectId: proj.id }} canEdit={rights.editOwn} />
        </Section>

        {rights.deleteOffer !== 'none' && (
          <Section title="Delete">
            <DeleteSection project={proj} offer={rights.deleteOffer} />
          </Section>
        )}
      </div>
    </div>
  )
}

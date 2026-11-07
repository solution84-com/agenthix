import { useParams } from 'react-router'
import { useQuery, getProjectByKey, getProjectMembers, getUserSettings, getBillingProfileChoices } from 'wasp/client/operations'
import { useAuth } from 'wasp/client/auth'
import { ProjectRunTimeLimit } from '../../automation/pages/ProjectRunTimeLimit'
import { ProjectBillingSection } from '../../billing/components/ProjectBillingSection'
import { ArchiveFinishedSection } from './ArchiveFinishedSection'
import { AboutSection } from './settings/AboutSection'
import { AccessSection } from './settings/AccessSection'
import { AgentsSection } from './settings/AgentsSection'
import { DeleteSection } from './settings/DeleteSection'
import { ModelsLine, ModelsSection } from './settings/ModelsSection'
import { PersonalAutomation } from './settings/PersonalAutomation'
import { FilingSection } from './settings/FilingSection'
import { Section } from './settings/Part'
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
  const { data: billingChoices } = useQuery(getBillingProfileChoices)
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
        {rights.editOwn && <p className="text-small text-text-muted">Changes save as you make them.</p>}
        {rights.namesAdmins && (
          <p className="text-small text-text-secondary">{adminsLine(people.filter(m => m.role === 'ADMIN').map(m => m.username))}</p>
        )}
        {personal && (
          <p className="text-small text-text-muted">
            Only you see this project. Agents work in it as you, in its own files, with your own model
            access and your own agent settings.
          </p>
        )}

        <Section title="About">
          <AboutSection project={proj} canEdit={rights.editOwn} personal={personal} />
          {!personal && <FilingSection project={proj} canEdit={rights.editFiling} />}
        </Section>

        {personal && (
          <Section title="Automation">
            <PersonalAutomation projectId={proj.id} />
          </Section>
        )}

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
          <Section title="Models">
            {rights.editOwn ? <ModelsSection projectId={proj.id} /> : <ModelsLine projectId={proj.id} />}
          </Section>
        )}

        {!personal && (billingChoices?.length ?? 0) >= 2 && (
          <Section title="Billing">
            <ProjectBillingSection projectId={proj.id} />
          </Section>
        )}

        <Section title="Runs">
          <ProjectRunTimeLimit projectId={proj.id} canEdit={rights.editOwn} />
        </Section>

        <Section title="Finished tasks">
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

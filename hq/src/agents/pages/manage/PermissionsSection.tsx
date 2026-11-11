import { useMemo } from 'react'
import { useQuery, useAction, getAgentPermissions, updateAgentSettings, getUserSettings } from 'wasp/client/operations'
import {
  AgentPermissionsView, PermissionsSummary, organisationDraft, type AgentDetail, type OrganisationPermissionsData, type PermissionsSave,
} from '@agenthix/ui/agents'
import { resolveAgentSave, type AgentBehaviourFields } from '../agentSaveGate'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { ManageSection } from './ManageSection'

function Editor({ agent, data, onClose }: { agent: AgentDetail; data: OrganisationPermissionsData; onClose: () => void }) {
  const update = useAction(updateAgentSettings)
  const initial = useMemo(() => organisationDraft(data), [data])
  const save = async (next: PermissionsSave) => {
    // Read fresh at save time, so a save right after opening is never wrongly refused.
    const settings = await getUserSettings()
    const decision = resolveAgentSave(next as AgentBehaviourFields, agent, settings.role === 'ADMIN')
    if (decision.kind === 'refused') throw new Error(decision.message)
    if (decision.kind === 'save') await update({ agentId: agent.id, ...decision.change } as never)
    onClose()
  }
  return <AgentPermissionsView initial={initial} agentName={agent.name} canChange onSave={save} onCancel={onClose} />
}

/** Permissions as a section of its own on the agent's page (spec §3): a summary, and Edit for the full view. */
export function PermissionsSection({ agent }: { agent: AgentDetail }) {
  const query = useQuery(getAgentPermissions, { agentId: agent.id })
  const { data } = query
  const read = useBackgroundRead(query, { what: 'The permissions' })
  const view = data as OrganisationPermissionsData | undefined
  return (
    <ManageSection
      title="Permissions"
      summary={view ? <>{read.nudge}<PermissionsSummary data={view} /></> : read.failedWithoutData ? read.nudge : <span className="text-text-muted">Loading…</span>}
      editor={close => (view ? <Editor agent={agent} data={view} onClose={close} /> : null)}
    />
  )
}

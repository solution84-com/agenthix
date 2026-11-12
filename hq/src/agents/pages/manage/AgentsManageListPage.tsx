import { useMemo, useState } from 'react'
import { ADMIN_CRUMB } from '../../../admin/adminCrumbs'
import { Link, useSearchParams } from 'react-router'
import { Plus, Upload } from 'lucide-react'
import { useQuery, useAction, getOrgAgents, getAgentUsage, createAgent } from 'wasp/client/operations'
import { CreateAgentModal, BypassedMark } from '@agenthix/ui/agents'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { AuthedAgentAvatar } from '../../../shared/components/AuthedAgentAvatar'
import { useAgentModelLine } from '../../useAgentModelLine'
import type { AgentCard } from '../../agentPlaceQueries'
import { approvalLabel } from '../approvalLabel'
import { costLabel, monthStart } from '../place/usageView'
import { AgentCover } from '../AgentCover'
import { ManageGate, useOrgAdminState } from './ManageGate'
import { useImportAgents } from './useImportAgents'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FOCUS_RING } from '@agenthix/ui/primitives'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { useAttention } from '../../../shared/components/AttentionDialog'
import { NewAgentPictures, type PictureChanges } from '../../../shared/pictures/picker'
import { saveAndRefresh } from '../../../shared/pictures/picker/useSavePictures'

function UsageCell({ agentId, since }: { agentId: string; since: string }) {
  const { data } = useQuery(getAgentUsage, { agentId, since })
  if (!data) return <span className="text-text-muted">…</span>
  return <span>{data.organisation.runCount === 0 ? 'No usage yet' : `Organisation usage ${costLabel(data.organisation)} this month`}</span>
}

function AgentRow({ card, since }: { card: AgentCard; since: string }) {
  const { agent } = card
  const model = useAgentModelLine()(agent.id)
  return (
    <div data-testid="manage-agent-row" className="flex items-center gap-3 overflow-hidden rounded-xl border border-border-subtle bg-surface-1 pr-4">
      <div className="relative hidden h-16 w-28 shrink-0 self-stretch overflow-hidden sm:block"><AgentCover coverUrl={agent.coverUrl} /></div>
      <div className="py-3 pl-3 sm:pl-0"><AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="md" /></div>
      <div className="min-w-0 flex-1 py-3">
        <div className="truncate text-body font-medium text-text-primary">{agent.name} <span className="font-normal text-text-muted">{agent.role}</span></div>
        <div className="truncate text-small text-text-muted">
          {agent.isKernel ? 'Built in — its instructions come with the product' : card.projectCount === 0 ? 'In no project yet' : `Assigned to ${card.projectCount} ${card.projectCount === 1 ? 'project' : 'projects'}`}
          {' · '}{model}{` · Approval ${approvalLabel(agent.approval)}`}{agent.approval === 'bypassed' && <> <BypassedMark /></>}
        </div>
        <div className="truncate text-small text-text-muted"><UsageCell agentId={agent.id} since={since} /></div>
      </div>
      <Link to={`/admin/agents/${agent.handle}`} className={`rounded shrink-0 text-body font-medium text-link hover:underline ${FOCUS_RING}`}>Manage</Link>
    </div>
  )
}

function ManageList() {
  const query = useQuery(getOrgAgents, { filter: 'all' })
  const { data, isLoading } = query
  const read = useBackgroundRead(query, { what: 'The agents' })
  const create = useAction(createAgent)
  const { importing, onFiles, dialog } = useImportAgents()
  const [creating, setCreating] = useState(false)
  const [pictures, setPictures] = useState<PictureChanges | null>(null)
  const { show, dialog: pictureDialog } = useAttention()
  // The pictures the dialog showed are the new agent's: saved once it is made, in place of its server default.
  const keepPictures = (agentId: string, chosen: PictureChanges) => {
    saveAndRefresh({ subject: { kind: 'agent', id: agentId }, ...chosen }).catch(() => show({
      title: 'Its picture was not saved',
      text: 'The agent was made with a picture of its own. Change it on its page, or try again.',
      retry: () => keepPictures(agentId, chosen),
    }))
  }
  const since = useMemo(() => monthStart(new Date()), [])
  // Needs attention's Review opens the agents with approval Bypassed (every screen reviewed spec §3).
  const [params, setParams] = useSearchParams()
  const bypassedOnly = params.get('approval') === 'bypassed'
  const agents = (data?.agents ?? []).filter(c => !bypassedOnly || c.agent.approval === 'bypassed')

  return (
    <AppLayout
      breadcrumbs={[ADMIN_CRUMB, { label: 'Agents' }]}
      title="Agents"
      subtitle="The organisation's agents — admins create and change them"
      action={
        <>
          <label className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-body focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${BUTTON_SECONDARY}`}>
            <Upload size={14} />
            {importing ? 'Importing…' : 'Import'}
            <input type="file" accept=".zip" multiple onChange={onFiles} className="hidden" disabled={importing} />
          </label>
          <button
            type="button"
            onClick={() => { setPictures(null); setCreating(true) }}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-small font-medium ${BUTTON_PRIMARY}`}
          >
            <Plus size={14} /> New agent
          </button>
        </>
      }
    >
      <div className="space-y-3 px-4 py-6 lg:px-8">
        {isLoading && <p className="text-body text-text-muted">Loading…</p>}
        {read.nudge}
        {bypassedOnly && (
          <p className="flex items-center gap-2 text-small text-text-secondary">
            Showing the agents with approval Bypassed.
            <button type="button" className={`rounded text-link hover:underline ${FOCUS_RING}`} onClick={() => setParams(prev => { const next = new URLSearchParams(prev); next.delete('approval'); return next }, { replace: true })}>Show all agents</button>
          </p>
        )}
        {data && data.agents.length === 0 && <p className="text-body text-text-muted">No agents yet. Create one with New agent, or Import a ZIP.</p>}
        {data && data.agents.length > 0 && agents.length === 0 && <p className="text-body text-text-muted">No agent has approval Bypassed.</p>}
        {agents.map(card => <AgentRow key={card.agent.id} card={card} since={since} />)}
      </div>
      {dialog}
      <CreateAgentModal
        open={creating}
        onClose={() => setCreating(false)}
        defaultSiteId="site"
        actions={{ createAgent: ({ name, handle, role }) => create({ name, handle, role }) }}
        onCreated={agentId => { setCreating(false); if (pictures) keepPictures(agentId, pictures) }}
        pictures={name => <NewAgentPictures name={name} value={pictures} onChange={setPictures} />}
      />
      {pictureDialog}
    </AppLayout>
  )
}

/** Organisation › Agents (spec §3): every agent for the organisation's admins, with New agent and Import. */
export function AgentsManageListPage() {
  const state = useOrgAdminState()
  return <ManageGate state={state}><ManageList /></ManageGate>
}

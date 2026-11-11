import { useMemo } from 'react'
import { ADMIN_CRUMB } from '../../../admin/adminCrumbs'
import { Link, useNavigate, useParams } from 'react-router'
import { Download } from 'lucide-react'
import {
  useQuery, useAction,
  getAgentByHandle, getAgentDetail, getAgentUsage,
  updateAgent, stopAgent, deleteAgent, exportAgent, uploadAgentImage, applyAgentPreset,
} from 'wasp/client/operations'
import { AgentManageHeader, BypassedMark, type AgentDetail } from '@agenthix/ui/agents'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { useAgentImageUrl } from '../../../shared/hooks/useAgentImageUrl'
import { resolveAgentImageUrl } from '../../../shared/utils/agentImageUrl'
import { monthStart } from '../place/usageView'
import { UsageRows } from '../place/UsageRows'
import { ManageGate, useOrgAdminState } from './ManageGate'
import { ManageMenu } from './ManageMenu'
import { ManageProjects } from './ManageProjects'
import { ManageEditors } from './ManageEditors'
import { downloadAgentZip } from './downloadAgentZip'
import { BUTTON_SECONDARY, FOCUS_RING } from '@agenthix/ui/primitives'

const fetchPresets = async (type: 'avatars' | 'covers'): Promise<string[]> => {
  const r = await fetch(`/presets/${type}`)
  return r.ok ? r.json() : []
}

function ManageAgent({ handle }: { handle: string }) {
  const navigate = useNavigate()
  const since = useMemo(() => monthStart(new Date()), [])
  const stub = useQuery(getAgentByHandle, { handle })
  const agentId = (stub.data as { id?: string } | undefined)?.id
  const detail = useQuery(getAgentDetail, { id: agentId! }, { enabled: !!agentId })
  const usage = useQuery(getAgentUsage, { agentId: agentId!, since }, { enabled: !!agentId })
  const agent = detail.data as AgentDetail | undefined
  // The image route needs a session a plain <img src> cannot carry, so the paths are resolved first.
  const avatarUrl = useAgentImageUrl(agent?.avatarUrl)
  const coverUrl = useAgentImageUrl(agent?.coverUrl)

  const update = useAction(updateAgent)
  const stop = useAction(stopAgent)
  const remove = useAction(deleteAgent)
  const exportZip = useAction(exportAgent)
  const upload = useAction(uploadAgentImage)
  const preset = useAction(applyAgentPreset)

  const crumbs = (last: string) => [ADMIN_CRUMB, { label: 'Agents', href: '/admin/agents' }, { label: last }]
  if (!agent) {
    const error = stub.error ?? detail.error
    return (
      <AppLayout breadcrumbs={crumbs(error ? 'Not found' : '…')}>
        <div className="px-6 py-16 text-center text-text-muted">{error ? error.message : 'Loading…'}</div>
      </AppLayout>
    )
  }

  const resolved = async (p: Promise<{ url: string }>) => ({ url: (await resolveAgentImageUrl((await p).url)) ?? (await p).url })
  return (
    <AppLayout breadcrumbs={crumbs(agent.name)}>
      <AgentManageHeader
        agent={{ id: agent.id, name: agent.name, handle: agent.handle, role: agent.role, avatarUrl, coverUrl }}
        subline={<>the organisation's · <Link to={`/agents/${agent.handle}`} className={`rounded text-link hover:underline ${FOCUS_RING}`}>Open its place in Agents ›</Link>{agent.approval === 'bypassed' && <> · <BypassedMark /></>}</>}
        actions={{
          saveName: async (name) => { await update({ id: agent.id, name }) },
          saveRole: async (role) => { await update({ id: agent.id, role }) },
          uploadAgentImage: (input) => resolved(upload(input)),
          applyAgentPreset: (input) => resolved(preset(input)),
          fetchPresets,
        }}
        menu={
          <>
            <button
              type="button"
              onClick={() => void exportZip({ agentId: agent.id }).then(downloadAgentZip).catch(() => alert('Export failed'))}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-body ${BUTTON_SECONDARY}`}
            >
              <Download size={14} /> Export
            </button>
            <ManageMenu
              isKernel={agent.isKernel}
              onStop={() => { if (confirm(`Stop every run of ${agent.name}?`)) void stop({ id: agent.id }) }}
              onDelete={() => { if (confirm(`Delete ${agent.name}? This cannot be undone.`)) void remove({ id: agent.id }).then(() => navigate('/admin/agents')) }}
            />
          </>
        }
      />
      <div className="grid gap-x-10 gap-y-6 px-6 pb-10 lg:grid-cols-2">
        <div><ManageEditors agent={agent} /></div>
        <div className="space-y-6">
          <ManageProjects agentId={agent.id} usage={usage.data} />
          <section aria-label="Usage">
            <h3 className="text-micro font-medium uppercase tracking-wide text-text-muted">Usage</h3>
            {usage.data && (
              <div className="mt-2">
                <UsageRows organisation={usage.data.organisation} />
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  )
}

/** One agent as a settings page (spec §3): not a place, and for organisation admins only. */
export function AgentManagePage() {
  const { handle } = useParams<{ handle: string }>()
  const state = useOrgAdminState()
  return <ManageGate state={state}><ManageAgent handle={handle!} /></ManageGate>
}

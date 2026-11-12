import { useMemo, useState } from 'react'
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
import { resolveAgentImageUrl, type PictureSize } from '../../../shared/utils/agentImageUrl'
import { cropAndCompress } from '../../../shared/pictures/upload/cropAndCompress'
import { monthStart } from '../place/usageView'
import { UsageRows } from '../place/UsageRows'
import { ManageGate, useOrgAdminState } from './ManageGate'
import { ManageMenu } from './ManageMenu'
import { ManageProjects } from './ManageProjects'
import { ManageEditors } from './ManageEditors'
import { downloadAgentZip } from './downloadAgentZip'
import { BUTTON_SECONDARY, ConfirmDialog, FOCUS_RING } from '@agenthix/ui/primitives'
import { isFinal, useBackgroundRead, useToast } from '@agenthix/ui/attention'
import { useAttention } from '../../../shared/components/AttentionDialog'

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
  const coverUrl = useAgentImageUrl(agent?.coverUrl, 'full')

  const update = useAction(updateAgent)
  const stop = useAction(stopAgent)
  const remove = useAction(deleteAgent)
  const exportZip = useAction(exportAgent)
  const upload = useAction(uploadAgentImage)
  const preset = useAction(applyAgentPreset)
  const { show, dialog } = useAttention()
  const toast = useToast()
  const [asking, setAsking] = useState<'stop' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const readStub = useBackgroundRead(stub, { what: 'The agent' })
  const readDetail = useBackgroundRead(detail, { what: 'The agent' })
  const readUsage = useBackgroundRead(usage, { what: 'The usage' })

  const exportAgentZip = (id: string) => exportZip({ agentId: id }).then(downloadAgentZip)
    .catch(() => show({ title: 'The export failed', text: 'The agent was not exported.', retry: () => void exportAgentZip(id) }))
  const confirmed = async () => {
    const what = asking
    if (!what || !agent) return
    setBusy(true)
    try {
      if (what === 'stop') { await stop({ id: agent.id }); toast(`Every run of ${agent.name} stopped`) }
      else { await remove({ id: agent.id }); navigate('/admin/agents') }
    } catch (e) {
      show({ title: what === 'stop' ? 'Its runs were not stopped' : 'It was not deleted', text: e instanceof Error ? e.message : 'Nothing was changed.', retry: () => void confirmed() })
    } finally { setBusy(false); setAsking(null) }
  }

  const crumbs = (last: string) => [ADMIN_CRUMB, { label: 'Agents', href: '/admin/agents' }, { label: last }]
  if (!agent) {
    const failed = readStub.failedWithoutData ? readStub : readDetail.failedWithoutData ? readDetail : null
    const error = stub.error ?? detail.error
    return (
      <AppLayout breadcrumbs={crumbs(failed ? (isFinal(error) ? 'Not found' : 'Agent') : '…')}>
        {failed ? failed.nudge : <div className="px-6 py-16 text-center text-text-muted">Loading…</div>}
      </AppLayout>
    )
  }

  const resolved = async (p: Promise<{ url: string }>, size: PictureSize = 'small') => {
    const { url } = await p
    return { url: (await resolveAgentImageUrl(url, size)) ?? url }
  }
  return (
    <AppLayout breadcrumbs={crumbs(agent.name)}>
      <AgentManageHeader
        agent={{ id: agent.id, name: agent.name, handle: agent.handle, role: agent.role, avatarUrl, coverUrl }}
        subline={<>the organisation's · <Link to={`/agents/${agent.handle}`} className={`rounded text-link hover:underline ${FOCUS_RING}`}>Open its place in Agents ›</Link>{agent.approval === 'bypassed' && <> · <BypassedMark /></>}</>}
        actions={{
          saveName: async (name) => { await update({ id: agent.id, name }) },
          saveRole: async (role) => { await update({ id: agent.id, role }) },
          uploadAgentImage: async ({ agentId, type, file }) =>
            resolved(upload({ agentId, type, dataUrl: await cropAndCompress(file, type) }), type === 'cover' ? 'full' : 'small'),
          applyAgentPreset: (input) => resolved(preset(input)),
          fetchPresets,
        }}
        menu={
          <>
            <button
              type="button"
              onClick={() => void exportAgentZip(agent.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-body ${BUTTON_SECONDARY}`}
            >
              <Download size={14} /> Export
            </button>
            <ManageMenu
              isKernel={agent.isKernel}
              onStop={() => setAsking('stop')}
              onDelete={() => setAsking('delete')}
            />
          </>
        }
      />
      {(readStub.nudge ?? readDetail.nudge) && <div className="px-6">{readStub.nudge ?? readDetail.nudge}</div>}
      <ConfirmDialog
        open={asking !== null}
        title={asking === 'stop' ? `Stop every run of ${agent.name}?` : `Delete ${agent.name}?`}
        description={asking === 'stop' ? 'Work in progress stops at once.' : 'This cannot be undone.'}
        confirmLabel={asking === 'stop' ? 'Stop every run' : `Delete ${agent.name}`}
        destructive busy={busy}
        onConfirm={() => void confirmed()} onCancel={() => setAsking(null)}
      />
      {dialog}
      <div className="grid gap-x-10 gap-y-6 px-6 pb-10 lg:grid-cols-2">
        <div><ManageEditors agent={agent} /></div>
        <div className="space-y-6">
          <ManageProjects agentId={agent.id} usage={usage.data} />
          <section aria-label="Usage">
            <h3 className="text-micro font-medium uppercase tracking-wide text-text-muted">Usage</h3>
            {readUsage.nudge}
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

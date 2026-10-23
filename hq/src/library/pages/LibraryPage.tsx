import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Upload } from 'lucide-react'
import { useQuery, getLibrary, getUserSettings } from 'wasp/client/operations'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { MenuButton } from '../../org/components/menus'
import { AddAgentDialog } from '../components/AddAgentDialog'
import { BoardTemplateView } from '../components/BoardTemplateView'
import { LibraryKindList } from '../components/LibraryKindList'
import { MarketplaceTab } from '../components/MarketplaceTab'
import { NewTemplateModal } from '../components/NewTemplateModal'
import { SkillDialog } from '../components/SkillDialog'
import { useLibraryTransfer } from '../components/useLibraryTransfer'
import { KINDS, isLibraryTab, type LibraryTab } from '../components/libraryWords'
import type { LibraryItem } from '../packages/packageActions'

type Creating = 'board' | 'skill' | null

/**
 * The Library (every screen reviewed spec §3, Organisation): the organisation's ready-made agents, boards, skills and
 * teams to start from, each marked Built in, Made here or Marketplace; using one makes the organisation's own copy.
 * The Marketplace tab is Coming soon until the marketplace opens with Agenthix Cloud.
 */
export function LibraryPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: LibraryTab = isLibraryTab(requested) ? requested : 'agents'
  const { data: library, refetch } = useQuery(getLibrary)
  const { data: me } = useQuery(getUserSettings)
  const isAdmin = me?.role === 'ADMIN'
  const transfer = useLibraryTransfer(() => void refetch())
  const [creating, setCreating] = useState<Creating>(null)
  const [addAgentId, setAddAgentId] = useState<string | null>(null)
  const [boardId, setBoardId] = useState<string | null>(null)
  const [skill, setSkill] = useState<LibraryItem | null>(null)

  const choose = (next: LibraryTab) => setParams(prev => { const p = new URLSearchParams(prev); p.set('tab', next); return p }, { replace: true })

  return (
    <AppLayout
      breadcrumbs={[{ label: 'Organisation', href: '/org' }, { label: 'Library' }]}
      title="Library"
      subtitle="Ready-made things to start from. Using one makes your own copy"
      action={isAdmin ? (
        <>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-body text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary">
            <Upload size={14} aria-hidden />
            {transfer.importing ? 'Importing…' : 'Import'}
            <input type="file" accept=".zip" multiple onChange={e => void transfer.onFiles(e)} className="hidden" disabled={transfer.importing} />
          </label>
          <MenuButton items={[
            { label: 'New board', hint: 'Columns a kind of work moves through', onSelect: () => setCreating('board') },
            { label: 'New skill', hint: 'Know-how to give an agent', onSelect: () => setCreating('skill') },
            { label: 'New agent…', hint: 'Made in Manage organisation › Agents', separatorBefore: true, onSelect: () => navigate('/admin/agents') },
            { label: 'New team…', hint: 'Made in Manage organisation › Teams', onSelect: () => navigate('/org/teams') },
          ]}>＋ New</MenuButton>
        </>
      ) : undefined}
    >
      <div className="mx-auto max-w-5xl px-4 py-5 lg:px-8">
        <div role="tablist" aria-label="Library" className="mb-4 flex gap-1 overflow-x-auto border-b border-border-subtle [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[...KINDS.map(k => ({ id: k.id as LibraryTab, label: k.label, count: library?.[k.id].length })), { id: 'marketplace' as LibraryTab, label: 'Marketplace', count: undefined }].map(t => (
            <button
              key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => choose(t.id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-small font-medium transition-colors ${tab === t.id ? 'border-accent text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'}`}
            >
              {t.label}{t.count !== undefined && <span className="ml-1.5 text-text-muted">{t.count}</span>}
            </button>
          ))}
        </div>
        {transfer.message && <p role={transfer.message.failed ? 'alert' : 'status'} className={`mb-3 text-small ${transfer.message.failed ? 'text-danger' : 'text-text-secondary'}`}>{transfer.message.text}</p>}
        {tab === 'marketplace' ? <MarketplaceTab /> : !library ? (
          <p className="text-body text-text-muted">Loading…</p>
        ) : (
          <LibraryKindList
            key={tab} kind={tab} items={library[tab]} isAdmin={isAdmin}
            onAddAgent={setAddAgentId} onViewBoard={setBoardId} onViewSkill={setSkill} onExport={(kind, id) => void transfer.exportOne(kind, id)}
          />
        )}
      </div>

      <AddAgentDialog templateId={addAgentId} onClose={() => setAddAgentId(null)} />
      <BoardTemplateView templateId={boardId} onClose={() => setBoardId(null)} />
      <SkillDialog item={skill} creating={creating === 'skill'} onClose={() => { setSkill(null); setCreating(null) }} onChanged={() => void refetch()} />
      {creating === 'board' && <NewTemplateModal onClose={() => { setCreating(null); void refetch() }} />}
    </AppLayout>
  )
}

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import { useAction, archiveConversation, markConversationRead } from 'wasp/client/operations'
import { FilterSelect, SearchField } from '@agenthix/ui/primitives'
import { useDock } from '../../dock/DockContext'
import { FilterToggle } from '../../dock/DockConversationList'
import { InboxRow } from '../../dock/InboxRow'
import { basePathOf } from '../../dock/pinnedPlaces'
import { SPACE_REF } from '../../dock/startPlace'
import { useStartFromAddress } from '../../dock/useStartFromAddress'
import { useConversationInbox } from '../../dock/useConversationInbox'
import { threadPath } from '../../conversations/threadPaths'
import { WithFloatingComposer, FLOATING_COMPOSER_ROOM } from '../../conversations/components/FloatingComposer'
import { chatListChoices, filterChatList, readChatList, withChatList, type ChatListView } from '../../shared/conversations/chatList'
import { inboxTotals, type InboxConversation } from '../../shared/conversations/inbox'
import { actionErrorText } from '../../conversations/hooks/threadState'

/**
 * The Chat page's list (the board's f5): every conversation the person can open, newest first, for working through
 * them — a search over titles and the latest messages, filters for what needs them, what is unread, a project, an
 * agent and the archived ones, and a way to choose several to mark read or archive. The search and filters live in
 * the address, so the chat's bar can open this list carrying its own. Opening a row opens it in the chat panel; the
 * page never changes the panel's state.
 */
export function ChatList() {
  const [params, setParams] = useSearchParams()
  const view = useMemo(() => readChatList(`?${params}`), [params])
  const setView = (next: Partial<ChatListView>) => setParams(withChatList(params, { ...view, ...next }), { replace: true })
  const { inbox, loaded } = useConversationInbox(view.archived)
  const dock = useDock()
  useStartFromAddress(SPACE_REF)
  const navigate = useNavigate()
  const archive = useAction(archiveConversation)
  const [choosing, setChoosing] = useState(false)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [problem, setProblem] = useState<string | null>(null)

  const rows = useMemo(() => filterChatList(inbox.conversations, view), [inbox.conversations, view])
  const choices = useMemo(() => chatListChoices(inbox.conversations), [inbox.conversations])
  // The counts are over the list as the page holds it (open or archived), whatever the filters.
  const totals = inboxTotals(inbox.conversations)
  const openId = dock?.open?.conversationId ?? null

  const open = (c: InboxConversation) => {
    const basePath = basePathOf(c.place)
    if (dock) dock.openConversation(c.id, basePath)
    else navigate(threadPath(basePath, c.id))
  }
  const toggle = (id: string) => setChosen((was) => {
    const next = new Set(was)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const stopChoosing = () => { setChoosing(false); setChosen(new Set()) }

  const forEachChosen = async (act: (c: InboxConversation) => Promise<unknown>) => {
    setProblem(null)
    const picked = rows.filter((c) => chosen.has(c.id))
    const results = await Promise.allSettled(picked.map(act))
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed.length > 0) {
      setProblem(`${failed.length} of ${picked.length} could not be changed: ${actionErrorText(failed[0].reason)} The others were.`)
      setChosen(new Set(picked.filter((_, i) => results[i].status === 'rejected').map((c) => c.id)))
    } else {
      stopChoosing()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WithFloatingComposer>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={`mx-auto w-full max-w-3xl px-4 pt-4 lg:px-6 lg:pt-5 ${FLOATING_COMPOSER_ROOM}`}>
            <div className="flex items-start gap-3" data-testid="chat-list-header">
              <div className="min-w-0 flex-1">
                <h2 className="text-h2 font-semibold text-text-primary">Chat</h2>
                <p className="mt-0.5 text-body text-text-secondary">Every conversation you can open, newest first</p>
              </div>
              {dock && (
                <button
                  type="button"
                  onClick={() => dock.startNew(SPACE_REF)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1 text-small font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <Plus size={14} aria-hidden /> New conversation
                </button>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <SearchField label="Search titles and messages" value={view.search} onChange={(search) => setView({ search })} className="max-w-md" />
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
                <FilterToggle label="Needs you" count={totals.needsYou} on={view.filters.needsYou} onToggle={() => setView({ filters: { ...view.filters, needsYou: !view.filters.needsYou } })} />
                <FilterToggle label="Unread" count={totals.unread} on={view.filters.unread} onToggle={() => setView({ filters: { ...view.filters, unread: !view.filters.unread } })} />
                <FilterSelect label="Filter by project" value={view.place ?? ''} onChange={(v) => setView({ place: v || null })}>
                  <option value="">All projects</option>
                  {choices.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </FilterSelect>
                <FilterSelect label="Filter by agent" value={view.agentId ?? ''} onChange={(v) => setView({ agentId: v || null })}>
                  <option value="">All agents</option>
                  {choices.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </FilterSelect>
                <button
                  type="button"
                  aria-pressed={view.archived}
                  onClick={() => { stopChoosing(); setView({ archived: !view.archived }) }}
                  className={`rounded-full border px-2.5 py-1 text-small font-medium ${view.archived ? 'border-accent bg-accent-subtle text-accent' : 'border-border text-text-secondary hover:bg-surface-hover'}`}
                >
                  Archived
                </button>
              </div>
              <div className="flex min-h-8 flex-wrap items-center gap-3 text-small text-text-muted">
                {!choosing ? (
                  !view.archived && rows.length > 0 && (
                    <button type="button" onClick={() => setChoosing(true)} className="font-medium text-accent hover:underline">
                      Select to mark read or archive several at once
                    </button>
                  )
                ) : (
                  <>
                    <span>{chosen.size} selected</span>
                    <button type="button" disabled={chosen.size === 0} onClick={() => void forEachChosen((c) => markConversationRead({ conversationId: c.id, throughSeq: c.lastSeq }))} className="font-medium text-accent hover:underline disabled:opacity-50">Mark read</button>
                    <button type="button" disabled={chosen.size === 0} onClick={() => void forEachChosen((c) => archive({ conversationId: c.id }))} className="font-medium text-accent hover:underline disabled:opacity-50">Archive</button>
                    <button type="button" onClick={stopChoosing} className="hover:underline">Cancel</button>
                  </>
                )}
              </div>
              {problem && <p role="alert" className="text-small text-danger">{problem}</p>}
            </div>

            <div className="mt-1" data-testid="chat-list">
              {!loaded
                ? <p className="px-2 py-3 text-small text-text-muted">Loading…</p>
                : rows.length === 0
                  ? <p className="px-2 py-3 text-small text-text-muted">{emptyWords(inbox.conversations.length > 0, view)}</p>
                  : (
                    <ul aria-label="Conversations">
                      {rows.map((c) => (
                        <InboxRow
                          key={c.id}
                          conversation={c}
                          open={c.id === openId}
                          lead={choosing ? <input type="checkbox" aria-label={`Select ${c.title || 'New conversation'}`} checked={chosen.has(c.id)} onChange={() => toggle(c.id)} className="ml-1 h-4 w-4 shrink-0 accent-accent" /> : undefined}
                          onChoose={() => (choosing ? toggle(c.id) : open(c))}
                        />
                      ))}
                    </ul>
                  )}
            </div>
          </div>
        </div>
      </WithFloatingComposer>
    </div>
  )
}

function emptyWords(narrowed: boolean, view: ChatListView): string {
  if (narrowed) return 'No conversation matches.'
  return view.archived ? 'Nothing is archived.' : 'No conversations yet.'
}

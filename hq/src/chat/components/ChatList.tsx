import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ListChecks, Plus } from 'lucide-react'
import { useAction, archiveConversation, markConversationRead } from 'wasp/client/operations'
import { Button, SearchField, Tooltip } from '@agenthix/ui/primitives'
import { useDock } from '../../dock/DockContext'
import { InboxChips } from '../../dock/InboxChips'
import { InboxDayList } from '../../dock/InboxDayList'
import { InboxRow } from '../../dock/InboxRow'
import { ChatListFilter } from './ChatListFilter'
import { basePathOf } from '../../dock/pinnedPlaces'
import { SPACE_REF } from '../../dock/startPlace'
import { useStartFromAddress } from '../../dock/useStartFromAddress'
import { useConversationInbox } from '../../dock/useConversationInbox'
import { threadPath } from '../../conversations/threadPaths'
import { WithFloatingComposer, FLOATING_COMPOSER_ROOM } from '../../conversations/components/FloatingComposer'
import { chatListChoices, filterChatList, readChatList, withChatList, type ChatListView } from '../../shared/conversations/chatList'
import { inboxTotals, type InboxConversation } from '../../shared/conversations/inbox'
import { actionErrorText } from '../../conversations/hooks/threadState'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * The Chat page's list (the board's f5): every conversation the person can open, newest first, for working through
 * them — a search over titles and the latest messages, chips for what is unread or needs them, one Filter for a project, an
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
            <div className="flex items-center gap-3" data-testid="chat-list-header">
              <div className="min-w-0 flex-1">
                <h2 className="text-h2 font-medium text-text-primary">Chat</h2>
              </div>
              {dock && (
                <Button type="button" onClick={() => dock.startNew(SPACE_REF)} className="shrink-0" leadingIcon={<Plus size={14} aria-hidden />}>
                  New conversation
                </Button>
              )}
            </div>

            <div className="mt-5 space-y-3">
              {/* One toolbar line of 36 px controls: the search, then Filter and Select; while choosing several, the
                  choosing controls take Filter's and Select's place. The tabs sit under it, on the list's top edge. */}
              <div className="flex items-center gap-2" data-testid="chat-toolbar">
                <SearchField prominent label="Search titles and messages" value={view.search} onChange={(search) => setView({ search })} className="min-w-0 flex-1" />
                {choosing ? (
                  <div className="flex h-9 shrink-0 items-center gap-3 text-small text-text-muted" data-testid="choosing-bar">
                    <span>{chosen.size} selected</span>
                    <Button type="button" variant="secondary" disabled={chosen.size === 0} onClick={() => void forEachChosen((c) => markConversationRead({ conversationId: c.id, throughSeq: c.lastSeq }))}>Mark read</Button>
                    <Button type="button" variant="secondary" disabled={chosen.size === 0} onClick={() => void forEachChosen((c) => archive({ conversationId: c.id }))}>Archive</Button>
                    <Button type="button" variant="secondary" onClick={stopChoosing}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <ChatListFilter view={view} choices={choices} onChange={(next) => { if (next.archived !== undefined) stopChoosing(); setView(next) }} />
                    {!view.archived && rows.length > 0 && (
                      <Tooltip label="Select several to mark read or archive" side="bottom">
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label="Select several to mark read or archive"
                          onClick={() => setChoosing(true)}
                          className="shrink-0"
                          leadingIcon={<ListChecks size={15} aria-hidden />}
                        >
                          Select
                        </Button>
                      </Tooltip>
                    )}
                  </>
                )}
              </div>
              <InboxChips filters={view.filters} totals={totals} onChange={(filters) => setView({ filters })} />
              <ShowAttention text={problem} title="That did not work" onClose={() => setProblem(null)} />
            </div>

            <div className="mt-3" data-testid="chat-list">
              {!loaded
                ? <p className="px-2 py-3 text-small text-text-muted">Loading…</p>
                : rows.length === 0
                  ? <p className="px-2 py-3 text-small text-text-muted">{emptyWords(inbox.conversations.length > 0, view)}</p>
                  : (
                    <InboxDayList
                      rows={rows}
                      label="Conversations"
                      row={(c) => (
                        <InboxRow
                          key={c.id}
                          conversation={c}
                          open={c.id === openId}
                          selected={choosing ? chosen.has(c.id) : undefined}
                          onChoose={() => (choosing ? toggle(c.id) : open(c))}
                        />
                      )}
                    />
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

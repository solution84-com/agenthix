import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useQuery, useAction, getMemory, setMemoryScope, forgetMemoryItem } from 'wasp/client/operations'
import { Button, ConfirmDialog, FOCUS_RING, Modal, SegmentedControl, type SegmentOption } from '@agenthix/ui/primitives'
import { ReadFailure, ShowAttention, toast, useBackgroundRead } from '@agenthix/ui/attention'
import type { MemoryItemView, MemoryScopeChoice } from '../../../shared/memory/protocol'
import { KIND_LABELS, savedText } from './memoryFormat'
import { MemoryBadge } from './MemoryRows'

type Problem = { title: string; text: string; retry?: () => void }

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * The one way a memory is shown (spec decisions 6, 11, 12): from the memory screen, an agent's page, or Show on a
 * "Remembered" line. The two switches promote it, each press saved at once; what it says is read only; Forget is the
 * only other thing a person can do. Drawn at the body, so it is centred over everything, a docked chat included.
 * `fromOutside`: opened away from the memory screen, so it links there, and says so when a memory is forgotten.
 */
export function MemoryDialog({ itemId, onClose, fromOutside = false }: { itemId: string | null; onClose: () => void; fromOutside?: boolean }) {
  if (!itemId) return null
  return createPortal(<Opened key={itemId} startId={itemId} onClose={onClose} fromOutside={fromOutside} />, document.body)
}

function Opened({ startId, onClose, fromOutside }: { startId: string; onClose: () => void; fromOutside: boolean }) {
  // Promoting into a key the wider scope already holds may join the memory into that one: the dialog follows it.
  const [id, setId] = useState(startId)
  const query = useQuery(getMemory, { id, includeArchived: true })
  const read = useBackgroundRead(query, { what: 'The memory' })
  const item = query.data?.[0]
  const [problem, setProblem] = useState<Problem | null>(null)

  let content
  if (query.isLoading) content = <p className="text-body text-text-muted">Loading…</p>
  else if (read.failedWithoutData) content = read.nudge
  else if (!item) content = <ReadFailure what="The memory" final="This memory is no longer here: it was forgotten, or an agent replaced it." />
  else content = <Contents item={item} onMoved={setId} onClose={onClose} fromOutside={fromOutside} onProblem={setProblem} />

  return (
    <>
      <Modal open onClose={onClose} title="Memory" closeLabel="Close" maxWidth="max-w-lg" fullScreenBelow="sm">
        {item && read.nudge}
        {content}
      </Modal>
      <ShowAttention kind="alert" text={problem?.text ?? null} title={problem?.title} retry={problem?.retry} onClose={() => setProblem(null)} />
    </>
  )
}

function Contents({ item, onMoved, onClose, fromOutside, onProblem }: {
  item: MemoryItemView; onMoved: (id: string) => void; onClose: () => void; fromOutside: boolean; onProblem: (p: Problem) => void
}) {
  const agentsId = useId()
  const whereId = useId()
  const setScope = useAction(setMemoryScope)
  const forget = useAction(forgetMemoryItem)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [forgetting, setForgetting] = useState(false)

  const current: MemoryScopeChoice = { agent: item.agent ? 'saved' : 'every', place: item.place ? 'saved' : 'everywhere' }

  async function choose(next: MemoryScopeChoice) {
    if (next.agent === current.agent && next.place === current.place) return
    setSaving(true)
    try {
      const result = await setScope({ id: item.id, ...next })
      if (result.itemId !== item.id) onMoved(result.itemId)
    } catch (err) {
      onProblem({ title: 'The change was not saved', text: messageOf(err), retry: () => void choose(next) })
    } finally {
      setSaving(false)
    }
  }

  async function forgetIt() {
    setForgetting(true)
    try {
      const result = await forget({ id: item.id })
      setConfirming(false)
      if (!result.ok) {
        onProblem({ title: 'The memory was not forgotten', text: 'That memory is already gone.' })
        return
      }
      if (fromOutside) toast('Memory forgotten')
      onClose()
    } catch (err) {
      setConfirming(false)
      onProblem({ title: 'The memory was not forgotten', text: messageOf(err), retry: () => void forgetIt() })
    } finally {
      setForgetting(false)
    }
  }

  const ownAgent = item.savedBy?.name ?? item.agent?.name
  const agentOptions: SegmentOption<MemoryScopeChoice['agent']>[] = [
    {
      value: 'saved', label: ownAgent ?? 'Its agent',
      ...(ownAgent ? {} : { refusal: { reason: 'The agent that saved it has since been deleted', title: 'It cannot be kept for one agent' } }),
    },
    { value: 'every', label: 'Every agent' },
  ]
  const ownPlace = item.savedIn?.name ?? item.place?.name
  const placeOptions: SegmentOption<MemoryScopeChoice['place']>[] = [
    {
      value: 'saved', label: ownPlace ?? 'Its place',
      ...(ownPlace ? {} : { refusal: { reason: 'The place it was saved in is not known, so it holds everywhere', title: 'It cannot be kept to one place' } }),
    },
    { value: 'everywhere', label: 'Everywhere' },
  ]

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p id={agentsId} className="text-small font-medium text-text-secondary">Which agents remember it</p>
        <SegmentedControl labelledBy={agentsId} options={agentOptions} value={current.agent} disabled={saving}
          onChange={agent => void choose({ ...current, agent })} />
        <p id={whereId} className="pt-1 text-small font-medium text-text-secondary">Where</p>
        <SegmentedControl labelledBy={whereId} options={placeOptions} value={current.place} disabled={saving}
          onChange={place => void choose({ ...current, place })} />
      </div>

      <div>
        <h3 className="text-body font-medium text-text-primary">{item.title}</h3>
        <p className="mt-1 whitespace-pre-wrap break-words text-body text-text-primary">{item.body}</p>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-small text-text-muted">
          <MemoryBadge kind>{KIND_LABELS[item.kind]}</MemoryBadge>
          {item.archived && <MemoryBadge>Archived</MemoryBadge>}
          {item.tags.map(t => <span key={t}>{t}</span>)}
        </p>
      </div>

      <p className="text-micro text-text-muted">
        {savedText(item)}
        {item.savedInConversationId && (
          <>
            {' · '}
            <Link to={`/chat/t/${encodeURIComponent(item.savedInConversationId)}`} onClick={onClose} className={`rounded text-link hover:underline ${FOCUS_RING}`}>
              the conversation
            </Link>
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="danger" onClick={() => setConfirming(true)}>Forget</Button>
        {fromOutside && (
          <Link to="/settings/memory" onClick={onClose} className={`ml-auto rounded text-small text-link hover:underline ${FOCUS_RING}`}>
            All your memory ›
          </Link>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Forget this memory?"
        description={`No agent will recall "${item.title}" again. This cannot be undone.`}
        confirmLabel="Forget"
        destructive
        busy={forgetting}
        onConfirm={() => void forgetIt()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}

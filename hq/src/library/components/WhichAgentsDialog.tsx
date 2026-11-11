import { useState } from 'react'
import { useAction, useQuery, getAssetHolders, getAssetPage, setAssetEveryAgent, addAssetToAgents, removeAssetFromAgent } from 'wasp/client/operations'
import { Button, Modal, NativeSelect, CARD_CHOSEN, BUTTON_SECONDARY } from '@agenthix/ui/primitives'
import { messageOf } from '../../assets/components/messageOf'
import { Refused, ShowAttention } from '@agenthix/ui/attention'

type Mode = 'every' | 'chosen' | 'notYet'

const CHOICES: Array<{ mode: Mode; label: string; hint: string }> = [
  { mode: 'every', label: 'Every agent', hint: 'Every agent in HQ, now and later' },
  { mode: 'chosen', label: 'Chosen agents', hint: 'Only the agents you choose' },
  { mode: 'notYet', label: 'Not yet', hint: "No agent has it until you choose; the skill's page says so" },
]

/**
 * *Which agents use it?* (board *Bringing a skill in*): the step that ends installing a skill and publishing one. The
 * same choice as the skill's page makes, with the same operations, made where the person already is; a change takes
 * effect on each agent's next turn. *Not yet* is a real answer. Choosing is an administrator's action (D17): anyone
 * else is told who it is for.
 */
export function WhichAgentsDialog({ assetId, title, onDone }: { assetId: string; title: string; onDone: () => void }) {
  const { data: page } = useQuery(getAssetPage, { assetId })
  const { data: holders, refetch } = useQuery(getAssetHolders, { assetId })
  const setEvery = useAction(setAssetEveryAgent)
  const add = useAction(addAssetToAgents)
  const remove = useAction(removeAssetFromAgent)
  const [picked, setPicked] = useState<Mode | null>(null)
  const [choice, setChoice] = useState('')
  const [error, setError] = useState<string | null>(null)

  const may = page?.can.grant === true
  const chosen = holders?.everyAgent ? [] : holders?.agents ?? []
  const current: Mode = !holders ? 'notYet' : holders.everyAgent ? 'every' : chosen.length > 0 ? 'chosen' : 'notYet'
  const mode = picked ?? current
  const free = (page?.agents ?? []).filter(a => !chosen.some(c => c.id === a.id))

  const run = async (work: () => Promise<unknown>) => {
    setError(null)
    try { await work(); await refetch() } catch (err) { setError(messageOf(err)) }
  }
  const choose = (next: Mode) => {
    if (!holders || next === mode) return
    setPicked(next)
    if (next === 'every') void run(() => setEvery({ assetId, everyAgent: true }))
    else if (next === 'chosen') { if (holders.everyAgent) void run(() => setEvery({ assetId, everyAgent: false })) }
    else void run(async () => {
      const after = holders.everyAgent ? await setEvery({ assetId, everyAgent: false }) : holders
      for (const a of after.agents) await remove({ assetId, agentId: a.id })
    })
  }

  return (
    <Modal open onClose={onDone} title={title} maxWidth="max-w-lg">
      <div className="space-y-3" data-testid="which-agents">
        <p className="text-body text-text-primary"><strong>Which agents use it?</strong> It reaches them from their next turn.</p>
        {!holders || !page ? <p className="text-small text-text-muted">Loading…</p> : (
          <>
            <Refused label="Which agents use it" className="flex w-full flex-col" refusal={may ? undefined : { reason: 'Choosing which agents use it is for administrators.', title: 'Choosing agents is for administrators', detail: 'Choosing which agents use it is for administrators. Nothing was changed.' }}>
            <div role="radiogroup" aria-label="Which agents use it" className="flex flex-col gap-2">
              {CHOICES.map(c => (
                <label key={c.mode} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${mode === c.mode ? CARD_CHOSEN : 'border-border-subtle'}`}>
                  <input type="radio" name="which-agents" checked={mode === c.mode} disabled={!may} onChange={() => choose(c.mode)} className="accent-accent mt-1" />
                  <span><span className="text-body font-medium text-text-primary">{c.label}</span><span className="block text-small text-text-muted">{c.hint}</span></span>
                </label>
              ))}
            </div>
            </Refused>
            {mode === 'chosen' && (
              <div className="flex flex-wrap items-center gap-2" data-testid="which-agents-chosen">
                {chosen.map(a => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-small text-text-primary">
                    {a.name}
                    {may && <button type="button" aria-label={`Remove from ${a.name}`} onClick={() => void run(() => remove({ assetId, agentId: a.id }))} className="text-text-muted hover:text-danger">✕</button>}
                  </span>
                ))}
                {may && free.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <NativeSelect size="sm" aria-label="Add an agent" value={choice} onChange={e => setChoice(e.target.value)}>
                      <option value="">＋ Add an agent</option>
                      {free.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </NativeSelect>
                    <button type="button" disabled={!choice} onClick={() => void run(async () => { await add({ assetId, agentIds: [choice] }); setChoice('') })}
                      className={`rounded-lg px-2 py-1 text-small ${BUTTON_SECONDARY}`}>Add</button>
                  </span>
                )}
              </div>
            )}
          </>
        )}
        <ShowAttention kind="alert" text={error} title="The agents were not changed" />
        <div className="flex justify-end pt-1"><Button onClick={onDone}>Done</Button></div>
      </div>
    </Modal>
  )
}

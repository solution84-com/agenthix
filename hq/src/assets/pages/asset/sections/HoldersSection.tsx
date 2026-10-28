import { useState } from 'react'
import { useAction, useQuery, getAssetHolders, setAssetEveryAgent, addAssetToAgents, removeAssetFromAgent } from 'wasp/client/operations'
import { Section } from '../../../components/Section'
import { Notice, type NoticeText } from '../../../components/Notice'
import { messageOf } from '../../../components/messageOf'
import type { AssetPageView } from '../pageTypes'

/**
 * *Agents with this skill* (D23): every agent, or chosen agents. Choosing is an administrator's action (D17) and takes
 * effect on each agent's next turn. An every-agent skill has no per-agent exceptions (R7).
 */
export function HoldersSection({ page }: { page: AssetPageView }) {
  const { data, refetch } = useQuery(getAssetHolders, { assetId: page.assetId })
  const setEvery = useAction(setAssetEveryAgent)
  const add = useAction(addAssetToAgents)
  const remove = useAction(removeAssetFromAgent)
  const [notice, setNotice] = useState<NoticeText | null>(null)
  const [choice, setChoice] = useState('')

  const run = async (work: () => Promise<unknown>) => {
    setNotice(null)
    try {
      await work()
      await refetch()
    } catch (err) {
      setNotice({ text: messageOf(err), failed: true })
    }
  }
  const chosen = data?.agents ?? []
  const free = page.agents.filter(a => !chosen.some(c => c.id === a.id))
  const may = page.can.grant

  return (
    <Section title="Agents with this skill" count={data ? (data.everyAgent ? undefined : chosen.length) : undefined} testId="asset-holders">
      {!data ? <p className="text-small text-text-muted">Loading…</p> : (
        <div className="space-y-3">
          <div role="radiogroup" aria-label="Who has it" className="flex flex-col gap-2">
            {([[true, 'Every agent', 'Every agent in HQ, now and later'], [false, 'Chosen agents', 'Only the agents you choose']] as const).map(([every, label, hint]) => (
              <label key={label} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${data.everyAgent === every ? 'border-accent' : 'border-border-subtle'}`}>
                <input type="radio" name="holders" checked={data.everyAgent === every} disabled={!may} onChange={() => void run(() => setEvery({ assetId: page.assetId, everyAgent: every }))} className="mt-1" />
                <span><span className="text-body font-medium text-text-primary">{label}</span><span className="block text-small text-text-muted">{hint}</span></span>
              </label>
            ))}
          </div>
          {!data.everyAgent && (
            <div className="flex flex-wrap items-center gap-2" data-testid="asset-holders-chosen">
              {chosen.length === 0 && <span className="text-small text-text-secondary">No agent has it yet.</span>}
              {chosen.map(a => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-small text-text-primary">
                  {a.name}
                  {may && <button type="button" aria-label={`Remove from ${a.name}`} onClick={() => void run(() => remove({ assetId: page.assetId, agentId: a.id }))} className="text-text-muted hover:text-danger">✕</button>}
                </span>
              ))}
              {may && free.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <select aria-label="Add an agent" value={choice} onChange={e => setChoice(e.target.value)} className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-small text-text-primary">
                    <option value="">＋ Add an agent</option>
                    {free.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button type="button" disabled={!choice} onClick={() => void run(async () => { await add({ assetId: page.assetId, agentIds: [choice] }); setChoice('') })}
                    className="rounded-lg border border-border px-2 py-1 text-small text-text-primary hover:bg-surface-hover disabled:opacity-40">Add</button>
                </span>
              )}
            </div>
          )}
          <p className="text-small text-text-muted">
            {may ? 'A change takes effect on each agent\'s next turn.' : 'Choosing which agents have it is for administrators.'}
          </p>
          <Notice notice={notice} />
        </div>
      )}
    </Section>
  )
}

import { useState } from 'react'
import { useAction, useQuery, getAssetHolders, getBuiltInSkills, setAssetEveryAgent, addAssetToAgents, removeAssetFromAgent } from 'wasp/client/operations'
import { useAttention, type Attention } from '../../../../shared/components/AttentionDialog'
import { messageOf } from '../../../components/messageOf'
import { AgentStack, type AgentStackProps } from '../../../components/AgentStack'
import { AnchoredMenu } from '../../../components/AnchoredMenu'
import type { AssetPageView } from '../pageTypes'
import { BuiltInPanel } from './BuiltInPanel'
import { builtInWords, usedByWords } from './skillWords'
import { NativeSelect, FOCUS_RING } from '@agenthix/ui/primitives'
import { Refused } from '@agenthix/ui/attention'

type Failed = (attention: Attention) => void

type Holders = { everyAgent: boolean; agents: { id: string; name: string }[] }

export function useHolders(assetId: string, enabled = true) {
  const { data, refetch } = useQuery(getAssetHolders, { assetId }, { enabled })
  return { holders: (data ?? null) as Holders | null, refetch }
}

/**
 * Everything the stack and its menu need about who uses a skill: a Library skill's holders, or a built-in's one
 * organisation-wide switch (on for every agent, or for none). A failure opens `dialog` (the caller renders it outside the
 * menu: a click in it would otherwise close the menu it sits in).
 */
export function useUsedBy(page: AssetPageView) {
  const { holders, refetch } = useHolders(page.assetId, !page.builtIn)
  const built = useQuery(getBuiltInSkills, undefined, { enabled: page.builtIn })
  const row = page.builtIn ? built.data?.find(b => b.assetId === page.assetId) ?? null : null
  const on = row ? row.on : !page.switchedOff
  const loaded = page.builtIn || holders !== null
  const { show, dialog } = useAttention()
  const stack: AgentStackProps = page.builtIn
    ? { everyAgent: on, switchedOff: !on, agents: [] }
    : { everyAgent: holders?.everyAgent ?? false, agents: (holders?.agents ?? []).map(a => ({ ...a, avatarUrl: page.agentAvatars[a.id] ?? null })) }
  const words = page.builtIn ? builtInWords(on)
    : holders ? usedByWords({ everyAgent: holders.everyAgent, count: holders.agents.length }) : 'Who uses it'
  const none = !page.builtIn && holders !== null && !holders.everyAgent && holders.agents.length === 0
  const panel = page.builtIn
    ? <BuiltInPanel title={page.title} assetId={page.assetId} on={on} may={page.can.switch} refetch={built.refetch} onFailed={show} />
    : <UsedByPanel page={page} holders={holders} refetch={refetch} onFailed={show} />
  return { stack, words, none, loaded, panel, dialog }
}

const LINK = `rounded text-small text-link not-disabled:hover:underline disabled:opacity-40 ${FOCUS_RING}`

/**
 * Who uses the skill, opened from the header (board *A skill's page* 3): the agents that use it, each with Remove,
 * *＋ Add an agent* and *Every agent instead*, or every agent with *Chosen agents instead*. Choosing is an
 * administrator's (D17) and takes effect on each agent's next turn; anyone else reads the list.
 */
export function UsedByPanel({ page, holders, refetch, onFailed }: { page: AssetPageView; holders: Holders | null; refetch: () => unknown; onFailed: Failed }) {
  const setEvery = useAction(setAssetEveryAgent)
  const add = useAction(addAssetToAgents)
  const remove = useAction(removeAssetFromAgent)
  const [choice, setChoice] = useState('')
  const may = page.can.grant
  const run = async (work: () => Promise<unknown>): Promise<void> => {
    try { await work(); await refetch() } catch (err) { onFailed({ text: messageOf(err), retry: () => void run(work) }) }
  }
  if (!holders) return <p className="p-2 text-small text-text-muted">Loading…</p>
  const chosen = holders.agents
  const free = page.agents.filter(a => !chosen.some(c => c.id === a.id))
  return (
    <div className="space-y-2 p-2" data-testid="asset-holders">
      <p className="text-small font-medium text-text-primary">{holders.everyAgent ? `Every agent uses ${page.title}` : `Agents that use ${page.title}`}</p>
      {may && <p className="text-micro text-text-muted">A change takes effect on each agent’s next turn.</p>}
      {holders.everyAgent ? (
        <p className="text-small text-text-secondary">Every agent in the organisation, and each new one.</p>
      ) : (
        <ul className="space-y-1" data-testid="asset-holders-chosen">
          {chosen.length === 0 && <li className="text-small text-text-secondary">No agent uses it yet.</li>}
          {chosen.map(a => (
            <li key={a.id} className="flex items-center gap-2 text-small text-text-primary">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-micro font-medium" aria-hidden>{a.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              {may && <button type="button" className={LINK} aria-label={`Remove from ${a.name}`} onClick={() => void run(() => remove({ assetId: page.assetId, agentId: a.id }))}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {!may && !holders.everyAgent && (
        <Refused label="Add an agent" refusal={{ reason: 'Choosing which agents use it is for administrators.', title: 'Choosing agents is for administrators' }}>
          <span className="flex items-center gap-2">
            <NativeSelect size="sm" aria-label="Add an agent" value="" onChange={() => undefined} className="min-w-0 flex-1">
              <option value="">＋ Add an agent</option>
            </NativeSelect>
          </span>
        </Refused>
      )}
      {may && !holders.everyAgent && free.length > 0 && (
        <span className="flex items-center gap-2">
          <NativeSelect size="sm" aria-label="Add an agent" value={choice} onChange={e => setChoice(e.target.value)} className="min-w-0 flex-1">
            <option value="">＋ Add an agent</option>
            {free.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
          <button type="button" disabled={!choice} className={LINK} onClick={() => void run(async () => { await add({ assetId: page.assetId, agentIds: [choice] }); setChoice('') })}>Add</button>
        </span>
      )}
      {may && (
        <button type="button" className={LINK} onClick={() => void run(() => setEvery({ assetId: page.assetId, everyAgent: !holders.everyAgent }))}>
          {holders.everyAgent ? 'Choose agents instead' : 'Every agent instead'}
        </button>
      )}
    </div>
  )
}

/** Who uses it as avatars with a small ▾ (up to two agents then +N, one group avatar for every agent, a dashed + for none), opening the menu. */
export function UsedByMenu({ page }: { page: AssetPageView }) {
  const { stack, words, none, panel, dialog } = useUsedBy(page)
  return (
    <>
      <AnchoredMenu label={words} highlight={none} testId="used-by" button={<AgentStack {...stack} />}>
        {() => panel}
      </AnchoredMenu>
      {dialog}
    </>
  )
}

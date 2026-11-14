import { useState } from 'react'
import { useAction, setModelDefaults } from 'wasp/client/operations'
import type { AiProviderSummary } from '@agenthix/core'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { useAttention } from '../../../shared/components/AttentionDialog'
import type { CapabilityId } from '../../../capabilities/capabilityList'
import { WhatAgentsCanDo } from '../../../capabilities/components/WhatAgentsCanDo'
import { WebSearchKeyDialog } from '../../../capabilities/components/WebSearchKeyDialog'
import { ModelChoiceRow } from '../../../models-settings/components/ModelChoiceRow'
import { ListeningRow } from '../../../models-settings/components/ListeningRow'
import { VoiceRow } from '../../../models-settings/components/VoiceRow'
import { useCapabilities } from './useCapabilities'

type Slot = Exclude<CapabilityId, 'web_search'>

/**
 * Setup's list of what agents can do. The defaults are chosen for the person from what works (`proposeDefaults`);
 * Change opens the same pickers Manage organisation › AI uses under its line, and Add a key and Web search's Change open the key
 * pop-up. A refused key stays in the pop-up: nothing here blocks setup (ADR-0160).
 */
export function WhatAgentsCanDoSetup({ providers }: { providers: AiProviderSummary[] }) {
  const { capabilities, unread, data, defaultsQuery, keyPresent, refetchKey } = useCapabilities(providers)
  const read = useBackgroundRead(defaultsQuery, { what: 'What agents can do' })
  const setDefaults = useAction(setModelDefaults)
  const attention = useAttention()
  const [picking, setPicking] = useState<Slot | null>(null)
  const [keyOpen, setKeyOpen] = useState(false)
  const change = (input: Parameters<typeof setDefaults>[0]) => {
    setDefaults(input).then(() => defaultsQuery.refetch(), (err: unknown) => {
      attention.show({ title: 'The default was not changed', text: err instanceof Error ? err.message : 'Could not save', retry: () => change(input) })
    })
  }
  if (providers.length > 0 && !data) {
    return <section aria-label="What agents can do" className="mb-4">{read.failedWithoutData ? read.nudge : <p className="text-small text-text-muted">Loading…</p>}</section>
  }
  const picker = (slot: Slot) => {
    if (!data || picking !== slot) return undefined
    const done = <button type="button" onClick={() => setPicking(null)} className={`rounded text-small font-medium text-link hover:underline ${FOCUS_RING}`}>Done</button>
    return (
      <div className="mt-2 rounded-lg bg-surface-2 px-3 py-2">
        {slot === 'thinking' && <ModelChoiceRow label="Model" choices={data.choices} own={data.conversation} shown={data.conversation} onChange={v => change({ conversation: v })} />}
        {slot === 'speaking' && <VoiceRow label="Speaking" options={data.tts_options} own={data.tts} shown={data.tts} onChange={v => change({ tts: v })} />}
        {slot === 'hearing' && <ListeningRow label="Hearing" showPrice={false} options={data.stt_options} own={data.stt} shown={data.stt} onChange={v => change({ stt: v })} />}
        <div className="mt-1 text-right">{done}</div>
      </div>
    )
  }
  return (
    <section aria-label="What agents can do" className="mb-4">
      <h2 className="mb-1 text-small font-medium text-text-muted">What agents can do</h2>
      <WhatAgentsCanDo capabilities={capabilities} unread={unread}
        onAction={(id, action) => {
          if (id === 'web_search' && (action === 'add_key' || action === 'change')) setKeyOpen(true)
          else if (id !== 'web_search' && action === 'change') setPicking(id)
        }}
        below={{ thinking: picker('thinking'), hearing: picker('hearing'), speaking: picker('speaking') }} />
      <WebSearchKeyDialog open={keyOpen} stored={keyPresent} onClose={() => { setKeyOpen(false); void refetchKey() }} />
      {attention.dialog}
    </section>
  )
}

import { useState } from 'react'
import { useAction, useQuery, getAiProviders, getModelsSettings, getWebSearchKeyStatus, setModelDefaults } from 'wasp/client/operations'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { useAttention } from '../../shared/components/AttentionDialog'
import { AI_ANCHORS } from '../../admin/aiPage'
import { useScrollToHash } from '../../admin/useScrollToHash'
import { ModelPicker } from '../../shared/components/models/ModelPicker'
import { valueOf } from '../../models-settings/components/ModelChoiceRow'
import { HearingChange } from '../../models-settings/components/ListeningRow'
import { SpeakingChange } from '../../models-settings/components/VoiceRow'
import type { ModelDefaultsInput } from '../../models-settings/settingsActions'
import { capabilityList, type CapabilityAction, type CapabilityId } from '../capabilityList'
import { AiSectionHeading } from './AiSectionHeading'
import { KeyUnread } from './KeyUnread'
import { WebSearchKeyDialog } from './WebSearchKeyDialog'
import { WhatAgentsCanDo } from './WhatAgentsCanDo'

/**
 * What agents can do, on the AI page: the list setup shows, from the organisation's providers, its defaults and its web
 * search key. Change on Thinking, Hearing and Speaking opens the same pickers as an agent's own models; Add a key and
 * Web search's Change open the Web search for OpenCode pop-up; Add a provider opens the page's own.
 */
export function CapabilitiesSection({ onAddProvider }: { onAddProvider: () => void }) {
  const providersQuery = useQuery(getAiProviders)
  const settingsQuery = useQuery(getModelsSettings)
  const keyQuery = useQuery(getWebSearchKeyStatus)
  const { data: providers } = providersQuery
  const { data: settings, refetch } = settingsQuery
  const setDefaults = useAction(setModelDefaults)
  const attention = useAttention()
  const [keyOpen, setKeyOpen] = useState(false)
  const stored = keyQuery.data?.present ?? false

  // One nudge for the section: its Try again re-reads all three. The key read has its own, on the Web search line,
  // until it has answered once; the list does not wait for it.
  const counted = [providersQuery, settingsQuery, ...(keyQuery.data ? [keyQuery] : [])]
  const read = useBackgroundRead({
    data: providers && settings ? true : undefined,
    error: counted.find(q => q.error)?.error ?? null,
    dataUpdatedAt: Math.min(...counted.filter(q => q.data !== undefined).map(q => q.dataUpdatedAt)),
    refetch: () => { void providersQuery.refetch(); void settingsQuery.refetch(); void keyQuery.refetch() },
  }, { what: 'What agents can do' })
  const keyRead = useBackgroundRead(keyQuery, { what: 'Whether there is a search key' })

  const change = (input: ModelDefaultsInput) => {
    setDefaults(input).then(() => refetch(), (err: unknown) => {
      attention.show({ title: 'The default was not changed', text: err instanceof Error ? err.message : 'Could not save', retry: () => change(input) })
    })
  }
  const onAction = (_id: CapabilityId, action: CapabilityAction) => {
    if (action === 'add_provider') onAddProvider()
    else setKeyOpen(true)
  }

  const ready = providers && settings
  useScrollToHash(Boolean(ready))
  return (
    <section id={AI_ANCHORS.capabilities} aria-labelledby="ai-capabilities" className="scroll-mt-4">
      <AiSectionHeading id="ai-capabilities" meta={read.failedWithoutData ? null : read.nudge}>What agents can do</AiSectionHeading>
      {!ready && (read.failedWithoutData ? read.nudge : <p className="text-small text-text-muted">Loading…</p>)}
      {ready && (
        <div className="rounded-2xl border border-border-subtle bg-card px-4 py-1.5">
          <WhatAgentsCanDo
            capabilities={capabilityList({ providers, defaults: settings, webSearchKey: stored })}
            onAction={onAction}
            offersAddProvider
            unread={keyRead.failedWithoutData ? { web_search: <KeyUnread retry={() => void keyQuery.refetch()} /> } : {}}
            changeControls={{
              // The picker opens from its button's right edge: the button is at the card's right, so it stays in the window.
              thinking: (
                <span className="contents lg:[&_[data-testid=model-picker]]:right-0 lg:[&_[data-testid=model-picker]]:left-auto">
                  <ModelPicker choices={settings.choices} value={valueOf(settings.conversation)} buttonText="Change"
                    ariaLabel="Change: Thinking" onChange={v => change({ conversation: v })} />
                </span>
              ),
              hearing: <HearingChange label="Hearing" showPrice options={settings.stt_options} shown={settings.stt}
                ariaLabel="Change: Hearing" onChange={v => change({ stt: v })} />,
              speaking: <SpeakingChange options={settings.tts_options} shown={settings.tts}
                ariaLabel="Change: Speaking" onChange={v => change({ tts: v })} />,
            }}
          />
        </div>
      )}
      {attention.dialog}
      <WebSearchKeyDialog open={keyOpen} stored={stored} onClose={() => { setKeyOpen(false); void keyQuery.refetch() }} />
    </section>
  )
}

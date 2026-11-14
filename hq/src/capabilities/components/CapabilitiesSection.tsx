import { useState } from 'react'
import { useAction, useQuery, getAiProviders, getModelsSettings, getWebSearchKeyStatus, setModelDefaults } from 'wasp/client/operations'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'
import { AI_ANCHORS } from '../../admin/aiPage'
import { useScrollToHash } from '../../admin/useScrollToHash'
import { ModelPicker } from '../../shared/components/models/ModelPicker'
import { valueOf } from '../../models-settings/components/ModelChoiceRow'
import { HearingChange } from '../../models-settings/components/ListeningRow'
import { SpeakingChange } from '../../models-settings/components/VoiceRow'
import { useSaving } from '../../models-settings/components/useSaving'
import type { ModelDefaultsInput } from '../../models-settings/settingsActions'
import { capabilityList, type CapabilityAction, type CapabilityId } from '../capabilityList'
import { AiSectionHeading } from './AiSectionHeading'
import { WebSearchKeyDialog } from './WebSearchKeyDialog'
import { WhatAgentsCanDo } from './WhatAgentsCanDo'

/**
 * What agents can do, on the AI page: the list setup shows, from the organisation's providers, its defaults and its web
 * search key. Change on Thinking, Hearing and Speaking opens the same pickers as an agent's own models; Add a key and
 * Web search's Change open the Web search for OpenCode pop-up; Add a provider opens the page's own.
 */
export function CapabilitiesSection({ onAddProvider }: { onAddProvider: () => void }) {
  const { data: providers } = useQuery(getAiProviders)
  const settingsQuery = useQuery(getModelsSettings)
  const keyQuery = useQuery(getWebSearchKeyStatus)
  const settingsRead = useBackgroundRead(settingsQuery, { what: 'What agents use' })
  const keyRead = useBackgroundRead(keyQuery, { what: 'Whether the organisation has a search key' })
  const setDefaults = useAction(setModelDefaults)
  const { error, run } = useSaving()
  const [keyOpen, setKeyOpen] = useState(false)
  const { data: settings, refetch } = settingsQuery
  const stored = keyQuery.data?.present ?? false

  const change = (input: ModelDefaultsInput) => void run(async () => { await setDefaults(input); await refetch() })
  const onAction = (_id: CapabilityId, action: CapabilityAction) => {
    if (action === 'add_provider') onAddProvider()
    else setKeyOpen(true)
  }

  const ready = providers && settings && keyQuery.data
  useScrollToHash(Boolean(ready))
  const failed = settingsRead.failedWithoutData || keyRead.failedWithoutData
  return (
    <section id={AI_ANCHORS.capabilities} aria-labelledby="ai-capabilities" className="scroll-mt-4">
      <AiSectionHeading id="ai-capabilities">What agents can do</AiSectionHeading>
      {settingsRead.nudge}
      {keyRead.nudge}
      {!ready && !failed && <p className="text-small text-text-muted">Loading…</p>}
      {ready && (
        <div className="rounded-2xl border border-border-subtle bg-card px-4 py-1.5">
          <WhatAgentsCanDo
            capabilities={capabilityList({ providers, defaults: settings, webSearchKey: stored })}
            onAction={onAction}
            offersAddProvider
            changeControls={{
              thinking: <ModelPicker choices={settings.choices} value={valueOf(settings.conversation)} buttonText="Change"
                ariaLabel="Change: Thinking" onChange={v => change({ conversation: v })} />,
              hearing: <HearingChange label="Hearing" showPrice options={settings.stt_options} shown={settings.stt}
                ariaLabel="Change: Hearing" onChange={v => change({ stt: v })} />,
              speaking: <SpeakingChange options={settings.tts_options} shown={settings.tts}
                ariaLabel="Change: Speaking" onChange={v => change({ tts: v })} />,
            }}
          />
        </div>
      )}
      <ShowAttention kind="alert" text={error} title="The default was not changed" />
      <WebSearchKeyDialog open={keyOpen} stored={stored} onClose={() => { setKeyOpen(false); void keyQuery.refetch() }} />
    </section>
  )
}

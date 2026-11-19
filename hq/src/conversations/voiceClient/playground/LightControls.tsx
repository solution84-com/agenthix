/**
 * The light model's picker in the Settings tab's Models (plan task 5.1): *Light model · listens while you speak*, under
 * Adaptive voice and hidden while it is off, since Adaptive voice is the light model listening. DeepSeek Flash on
 * OpenRouter when offered and nothing is chosen, else hq's own choice for listening, as its first row.
 */
import { useSyncExternalStore } from 'react'
import type { ModelChoices } from '../../../shared/conversations/protocol'
import { HQ_LISTENER_CHOICE } from '../../../shared/voicePlaygroundLight'
import { ModelPicker } from '../../../shared/components/models/ModelPicker'
import type { DefaultRow } from '../../../shared/components/models/ModelList'
import { effectiveListenerModel } from './lightModel'
import { RowLabel, StaleNote } from './fields'
import type { PlaygroundSettings } from './settings'

const HQ_ROW: DefaultRow = { value: HQ_LISTENER_CHOICE, label: "hq's choice for listening", under: 'the first fast model the organisation reaches', setBy: '' }

export function LightModelControls({ settings, choices, staleNote, onPicked }: {
  settings: PlaygroundSettings; choices: ModelChoices | undefined; staleNote: string | null; onPicked: () => void
}) {
  const { adaptiveVoice, listenerModel } = useSyncExternalStore(settings.subscribe, settings.get)
  if (!adaptiveVoice) return null
  const value = effectiveListenerModel(listenerModel, choices) ?? HQ_LISTENER_CHOICE
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2" data-testid="light-model-controls">
      <RowLabel>Light model · listens while you speak</RowLabel>
      <span data-testid="light-model-picker" data-value={value}>
        <ModelPicker choices={choices} value={value} ariaLabel="Light model" defaultRow={HQ_ROW} onChange={v => { onPicked(); settings.patch({ listenerModel: v }) }} />
      </span>
      <StaleNote id="light-stale-note" text={staleNote} />
    </div>
  )
}

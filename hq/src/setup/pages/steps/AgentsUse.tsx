import { useEffect, useRef } from 'react'
import { useAction, useQuery, getSetupDefaults, setModelDefaults } from 'wasp/client/operations'
import { providerTypesCovered, type AiProviderSummary } from '@agenthix/core'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { useAttention } from '../../../shared/components/AttentionDialog'
import { ModelRows } from '../../../models-settings/components/ModelRows'

/**
 * What agents use: the model, hearing and speaking defaults, each with Change. They are chosen for the person from what
 * works (`proposeDefaults`); a type nothing covers says what to add, and is not a fault. Read again whenever a provider
 * is added or removed, or changes state.
 */
export function AgentsUse({ providers }: { providers: AiProviderSummary[] }) {
  const query = useQuery(getSetupDefaults)
  const { data, refetch } = query
  const read = useBackgroundRead(query, { what: 'What agents use' })
  const setDefaults = useAction(setModelDefaults)
  const attention = useAttention()
  const change = (input: Parameters<typeof setDefaults>[0]) => {
    setDefaults(input).then(() => refetch(), (err: unknown) => {
      attention.show({ title: 'The default was not changed', text: err instanceof Error ? err.message : 'Could not save', retry: () => change(input) })
    })
  }
  const seen = useRef<string | null>(null)
  const signature = providers.map(p => `${p.id}:${p.state}`).join(',')
  useEffect(() => {
    if (seen.current !== null && seen.current !== signature) void refetch()
    seen.current = signature
  }, [signature, refetch])

  const covered = providerTypesCovered(providers)
  return (
    <section aria-label="What agents use" className="mb-4">
      <h2 className="mb-1 text-small font-medium text-text-muted">What agents use</h2>
      {providers.length === 0 ? (
        <p className="text-small text-text-muted">Model, hearing and speaking. Chosen for you once a provider is added.</p>
      ) : !data ? (
        read.failedWithoutData ? read.nudge : <p className="text-small text-text-muted">Loading…</p>
      ) : (
        <ModelRows own={data} choices={data.choices} sttOptions={data.stt_options} ttsOptions={data.tts_options}
          labels={{ stt: 'Hearing', tts: 'Speaking' }} showPrice={false}
          unset={{
            ...(covered.llm ? {} : { conversation: 'Not set. Add a provider that offers models.' }),
            ...(covered.stt ? {} : { stt: 'Not set. Add a provider that hears people.' }),
            ...(covered.tts ? {} : { tts: 'Not set. Add a provider that speaks.' }),
          }}
          onChange={change} />
      )}
      {attention.dialog}
    </section>
  )
}

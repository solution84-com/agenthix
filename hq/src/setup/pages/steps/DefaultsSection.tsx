import { useAction, getSetupDefaults, setModelDefaults, useQuery } from 'wasp/client/operations'
import { ModelRows } from '../../../models-settings/components/ModelRows'

/** The organisation's four defaults on the last look: what setup chose from what was added, each with Change. */
export function DefaultsSection() {
  const { data, refetch } = useQuery(getSetupDefaults)
  const setDefaults = useAction(setModelDefaults)
  if (!data) return <div className="text-small text-text-muted">Loading…</div>
  return (
    <ModelRows own={data} choices={data.choices} sttOptions={data.stt_options} ttsOptions={data.tts_options}
      onChange={input => { void setDefaults(input).then(() => refetch()) }} />
  )
}

/** The first agent, speaking as the organisation's default voice. */
export function KernelLine() {
  const { data } = useQuery(getSetupDefaults)
  return <div className="text-small text-text-primary">Kernel{data?.tts?.voice ? `, speaking as ${data.tts.voice}` : ', with a voice'}</div>
}

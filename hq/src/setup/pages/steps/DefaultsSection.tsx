import { useQuery, getSetupDefaults } from 'wasp/client/operations'

/** The first agent, said the way the AI row says the voice: speaking when speech is set, typing only when it is not. */
export function KernelLine({ speaks }: { speaks: boolean }) {
  const { data } = useQuery(getSetupDefaults)
  if (!speaks) return <div className="text-small text-text-primary">Kernel, typing only until a voice is added</div>
  return <div className="text-small text-text-primary">Kernel, speaking{data?.tts?.voice ? ` as ${data.tts.voice}` : ' in the default voice'}</div>
}

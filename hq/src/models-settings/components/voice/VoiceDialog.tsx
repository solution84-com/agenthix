import { useEffect, useMemo, useState } from 'react'
import { useQuery, listInworldVoices } from 'wasp/client/operations'
import { Button, Modal, FOCUS_RING_INSET, ROW_CHOSEN, ROW_ITEM, FOCUS_RING } from '@agenthix/ui/primitives'
import type { Voice } from '../../../voice/ttsAdapter'
import { PlayMark } from './VoicePlayButton'
import { VoiceFilters } from './VoiceFilters'
import { playSample, sampleKey, stopSample, usePlayingKey } from './voicePlayer'
import { NO_FILTERS, describeShown, filterVoices, isFiltered, optionsOf, type VoiceFilterState } from './voiceFilter'
import { useBackgroundRead } from '@agenthix/ui/attention'

export { VoicePlayButton } from './VoicePlayButton'

/** Choosing a voice from a text-to-speech provider's own list (models from one place, part 4; board 14). */
export interface VoiceDialogProps {
  /** The text-to-speech provider whose voices are listed and previewed. */
  providerId: string
  /** The voice chosen now, by id; null when none is. */
  current: string | null
  onClose: () => void
  onChoose: (voiceId: string) => void
}

function VoiceRow({ voice, chosen, lit, onTap }: { voice: Voice; chosen: boolean; lit: boolean; onTap: () => void }) {
  return (
    <li role="option" aria-selected={chosen} tabIndex={0} onClick={onTap}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap() } }}
      className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${FOCUS_RING_INSET} ${chosen ? ROW_CHOSEN : ROW_ITEM}`}>
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-small font-medium text-text-primary">
        {voice.displayName.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-small font-medium text-text-primary">
          {voice.displayName}
          {voice.isCustom && <span className="rounded bg-surface-3 px-1.5 text-micro text-text-secondary">Custom</span>}
        </span>
        <span className="block text-small text-text-muted">{voice.description}</span>
      </span>
      <PlayMark lit={lit} />
    </li>
  )
}

export function VoiceDialog({ providerId, current, onClose, onChoose }: VoiceDialogProps) {
  const query = useQuery(listInworldVoices, { providerId })
  const { data } = query
  const read = useBackgroundRead(query, { what: 'The voices' })
  const voices: Voice[] = useMemo(() => (data as Voice[] | undefined) ?? [], [data])
  const options = useMemo(() => optionsOf(voices), [voices])
  const [filters, setFilters] = useState<VoiceFilterState>(NO_FILTERS)
  const [chosen, setChosen] = useState<string | null>(current)
  const playing = usePlayingKey()

  // English first when the list has it, as the board shows; a person can change it.
  const [started, setStarted] = useState(false)
  useEffect(() => {
    if (started || voices.length === 0) return
    setStarted(true)
    if (options.languages.includes('en')) setFilters(f => ({ ...f, language: 'en' }))
  }, [started, voices, options])

  useEffect(() => stopSample, [])

  const { shown, withinFilters } = useMemo(() => filterVoices(voices, filters), [voices, filters])
  const chosenVoice = voices.find(v => v.voiceId === chosen)

  const tap = (v: Voice) => {
    setChosen(v.voiceId)
    void playSample({ providerId, voiceId: v.voiceId, description: v.description, lang: filters.language || 'en' })
  }

  return (
    <Modal open onClose={onClose} title="Choose a voice" maxWidth="max-w-2xl">
      <div className="space-y-3">
        <dl className="flex gap-6 text-small">
          <div><dt className="text-text-muted">Provider</dt><dd className="text-text-primary">Inworld</dd></div>
          <div><dt className="text-text-muted">Model</dt><dd className="text-text-primary">Inworld TTS 2</dd></div>
        </dl>
        {!data ? (
          read.failedWithoutData ? read.nudge : <p className="text-small text-text-muted">Loading…</p>
        ) : (
          <>
            {read.nudge}
            <VoiceFilters options={options} filters={filters} onChange={setFilters} />
            <div className="flex items-center justify-between gap-3 text-small text-text-secondary">
              <span role="status">{describeShown(filters, shown.length, withinFilters)}</span>
              {isFiltered(filters) && (
                <button type="button" className={`rounded text-link hover:underline ${FOCUS_RING}`} onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
              )}
            </div>
            <ul role="listbox" aria-label="Voices" className="max-h-80 space-y-1 overflow-y-auto">
              {shown.map(v => (
                <VoiceRow key={v.voiceId} voice={v} chosen={v.voiceId === chosen} lit={playing === sampleKey(providerId, v.voiceId)} onTap={() => tap(v)} />
              ))}
              {shown.length === 0 && <li className="px-3 py-2 text-small text-text-muted">No voice matches</li>}
            </ul>
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!chosen} onClick={() => chosen && onChoose(chosen)}>
            {chosen ? `Use ${chosenVoice?.displayName ?? chosen}` : 'Use'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

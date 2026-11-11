import { useMemo, useRef, useState } from 'react'
import { Button, StatePill } from '@agenthix/ui'
import { ShowAttention } from '@agenthix/ui/attention'
import type { VoiceEvent } from '../events'
import type { VoiceRuntimeHandle } from '../runtime/types'
import { LabRows } from './LabRows'
import { parseLog, savedOverflows, serializeLog, type LoadedLog } from './log'
import { reduceAll } from './rows'
import { useLabFeed } from './useLabFeed'

export function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `voice-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export const readText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('This file could not be read.'))
  reader.readAsText(file)
})

/** The lab: live while voice runs, or a saved log loaded to look at afterwards. */
export function VoiceLab({ runtime }: { runtime: VoiceRuntimeHandle | null }) {
  const live = useLabFeed(runtime)
  const [loaded, setLoaded] = useState<LoadedLog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const loadedState = useMemo(() => (loaded ? reduceAll(loaded.events) : null), [loaded])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      setLoaded(parseLog(await readText(file)))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file could not be read.')
    }
  }

  const save = () => {
    const events: readonly VoiceEvent[] = live.events
    download(serializeLog(events, live.overflows, live.settingsVersion))
  }

  const showing = loaded && loadedState ? { state: loadedState, overflows: loaded.overflows, settingsVersion: loaded.settingsVersion }
    : { state: live.state, overflows: savedOverflows(live.overflows), settingsVersion: live.settingsVersion }

  return (
    <div className="space-y-4 px-4 py-6 lg:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <StatePill tone={loaded ? 'warning' : runtime ? 'healthy' : 'neutral'}>
          {loaded ? `Saved log, ${loaded.events.length} events` : runtime ? 'Live' : 'Voice is off'}
        </StatePill>
        {!loaded && !runtime && <span className="text-body text-text-muted">Turn voice on in a conversation, in this tab or another; this page shows it as it runs.</span>}
        <div className="ml-auto flex gap-2">
          {loaded && <Button variant="secondary" size="sm" onClick={() => setLoaded(null)}>Back to live</Button>}
          <Button variant="secondary" size="sm" onClick={save} disabled={!runtime || live.events.length === 0}>Save log</Button>
          <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>Load log</Button>
          <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={e => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      </div>
      <ShowAttention kind="alert" text={error} title="The log was not loaded" onClose={() => setError(null)} />
      <LabRows {...showing} />
    </div>
  )
}

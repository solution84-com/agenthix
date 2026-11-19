/** The Settings tab: Models, Tuning, the backchannel's sounds and Lab stacked, each under its own heading, nothing folded. */
import type { ModelChoices } from '../../../shared/conversations/protocol'
import type { VoiceRuntimeHandle } from '../runtime/types'
import { LabPanel } from './LabPanel'
import { ListenerTuning, resetListener } from './ListenerTuning'
import { ModelsSection } from './ModelsSection'
import { BarButton, PaneBar } from './PaneBar'
import type { PlaygroundSettings } from './settings'
import type { StaleNotes } from './staleModels'
import { HumSounds } from './HumSounds'
import type { LooseSocket } from '../voiceSession'

export function SettingsTab({ settings, choices, runtime, stale, onPicked, socket }: {
  settings: PlaygroundSettings; choices: ModelChoices | undefined; runtime: VoiceRuntimeHandle | null
  stale: StaleNotes; onPicked: (which: keyof StaleNotes) => void
  /** For "Hear the sounds"; absent, the panel is not shown. */
  socket?: LooseSocket
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PaneBar title="Models" />
      <ModelsSection settings={settings} choices={choices} stale={stale} onPicked={onPicked} />
      <PaneBar title="Tuning · light model">
        <BarButton testId="tuning-reset" onClick={() => resetListener(settings)}>Reset</BarButton>
      </PaneBar>
      <div className="px-3 py-2"><ListenerTuning settings={settings} choices={choices} /></div>
      {socket && <><PaneBar title="Hear the sounds · backchannel" /><HumSounds socket={socket} settings={settings} /></>}
      <LabPanel runtime={runtime} />
    </div>
  )
}

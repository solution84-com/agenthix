import { useAction, setProjectAccessLevel } from 'wasp/client/operations'
import { SegmentedControl } from '@agenthix/ui/primitives'
import { Part, ReadOnlyValue } from './Part'
import { usePartSave } from './usePartSave'
import type { SettingsProject } from './types'

const WORDS = {
  OPEN: { name: 'Open', short: 'anyone in the organisation', says: 'Anyone in the organisation may join this project.' },
  PRIVATE: { name: 'Private', short: 'only its members', says: 'Only the people on its member list can see it, start a run in it, or write anything it owns.' },
}

export function AccessSection({ project, canEdit }: { project: SettingsProject; canEdit: boolean }) {
  const setLevel = useAction(setProjectAccessLevel)
  const save = usePartSave()
  const level = project.accessLevel

  return (
    <Part label="Who can join" htmlFor="set-access" save={save} hint={WORDS[level].says}>
      {canEdit ? (
        <SegmentedControl
          label="Who can join" value={level} disabled={save.state === 'saving'}
          onChange={choice => { if (choice !== level) void save.save(() => setLevel({ projectId: project.id, accessLevel: choice }), 'Who can join could not be changed') }}
          options={(['OPEN', 'PRIVATE'] as const).map(choice => ({ value: choice, label: WORDS[choice].name }))}
        />
      ) : (
        <ReadOnlyValue id="set-access">{WORDS[level].name}: {WORDS[level].short}</ReadOnlyValue>
      )}
    </Part>
  )
}

import { useAction, setProjectAccessLevel } from 'wasp/client/operations'
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
        <div id="set-access" role="group" className="flex items-center gap-2">
          {(['OPEN', 'PRIVATE'] as const).map(choice => (
            <button
              key={choice}
              type="button"
              aria-pressed={level === choice}
              disabled={save.state === 'saving'}
              onClick={() => { if (choice !== level) void save.save(() => setLevel({ projectId: project.id, accessLevel: choice }), 'Who can join could not be changed') }}
              className={`px-3 py-1.5 text-small font-medium rounded-lg transition-colors ${
                level === choice ? 'bg-accent-subtle text-accent' : 'bg-surface-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              {WORDS[choice].name}
            </button>
          ))}
        </div>
      ) : (
        <ReadOnlyValue id="set-access">{WORDS[level].name}: {WORDS[level].short}</ReadOnlyValue>
      )}
    </Part>
  )
}

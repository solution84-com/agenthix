import { useState } from 'react'
import { setPlaceSkillsDefault } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { useAct } from './useAct'
import { DEFAULT_WORDS, looserThanOrganisation, type PlaceDefaultValue } from './placeSkillsModel'

const CHOICES: PlaceDefaultValue[] = ['ON', 'OFF', 'NEVER']

/** C1b: the place's own default for skills found in its files. Looser than the organisation's is greyed out, with the reason (adr-0072). */
export function PlaceDefaultDialog({ projectId, placeName, current, org, onClose }: {
  projectId: string
  placeName: string
  current: PlaceDefaultValue
  org: PlaceDefaultValue
  onClose: () => void
}) {
  const [value, setValue] = useState<PlaceDefaultValue>(current)
  const { busy, error, run } = useAct()
  const save = async () => {
    const done = await run(() => setPlaceSkillsDefault({ projectId, value }).then(() => true))
    if (done) onClose()
  }
  return (
    <Modal open onClose={onClose} title="Skills found in this place's files" maxWidth="max-w-lg">
      <div className="space-y-3" data-testid="place-default-dialog">
        <p className="text-small text-text-secondary">
          The organisation's default is {DEFAULT_WORDS[org].title.toLowerCase()}. {placeName} can be stricter, never looser.
        </p>
        <div role="radiogroup" aria-label="Default" className="space-y-2">
          {CHOICES.map((c) => {
            const blocked = looserThanOrganisation(c, org)
            return (
              <label key={c} className={`block rounded-lg border p-3 ${value === c ? 'border-border-strong bg-accent-subtle' : 'border-border'} ${blocked ? 'opacity-50' : 'cursor-pointer'}`}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="place-default" checked={value === c} disabled={!!blocked} onChange={() => setValue(c)} />
                  <span className="text-body font-medium text-text-primary">{DEFAULT_WORDS[c].title}</span>
                </span>
                <span className="mt-1 block pl-6 text-small text-text-secondary">{blocked ?? DEFAULT_WORDS[c].says}</span>
              </label>
            )
          })}
        </div>
        <p className="text-small text-text-muted">Changing to off by default leaves today's switched-on skills on. It changes what happens to new and changed ones.</p>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || value === current}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}

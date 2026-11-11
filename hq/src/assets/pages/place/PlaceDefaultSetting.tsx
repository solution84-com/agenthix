import { setPlaceSkillsDefault } from 'wasp/client/operations'
import { NativeSelect } from '@agenthix/ui/primitives'
import { useAct } from './useAct'
import { DEFAULT_WORDS, looserThanOrganisation, type PlaceDefaultValue } from './placeSkillsModel'
import { ShowAttention } from '@agenthix/ui/attention'

const CHOICES: PlaceDefaultValue[] = ['ON', 'OFF', 'NEVER']

/** The place's default for skills found in its files, as a setting changed in place. A choice looser than the organisation's is unavailable, with why (adr-0072). */
export function PlaceDefaultSetting({ projectId, effective, org, placeDefault, canChange }: {
  projectId: string
  effective: PlaceDefaultValue
  org: PlaceDefaultValue
  /** The place's own choice, when it has made one. */
  placeDefault: PlaceDefaultValue | null
  canChange: boolean
}) {
  const { busy, error, run, clear } = useAct()
  const orgWords = DEFAULT_WORDS[org].title.toLowerCase()
  const change = (value: PlaceDefaultValue) => {
    if (value !== effective) void run(() => setPlaceSkillsDefault({ projectId, value }))
  }
  return (
    <div className="mt-3 rounded-lg border border-border-subtle p-3" data-testid="place-default-line">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor="place-skills-default" className="text-small font-medium text-text-primary">Skills found in files</label>
        {canChange ? (
          <NativeSelect id="place-skills-default" size="sm" className="w-auto" value={effective} disabled={busy} onChange={(e) => change(e.target.value as PlaceDefaultValue)}>
            {CHOICES.map((c) => (
              <option key={c} value={c} disabled={!!looserThanOrganisation(c, org)} title={looserThanOrganisation(c, org) ? `${DEFAULT_WORDS[c].title} isn't available: ${looserThanOrganisation(c, org)}` : undefined}>{DEFAULT_WORDS[c].title}</option>
            ))}
          </NativeSelect>
        ) : (
          <strong id="place-skills-default" className="text-small text-text-primary">{DEFAULT_WORDS[effective].title}</strong>
        )}
        <span className="text-small text-text-secondary" data-testid="place-default-org">
          The organisation's default is {orgWords}{placeDefault && placeDefault !== org ? ", and this place's is " + DEFAULT_WORDS[placeDefault].title.toLowerCase() : ''}.
        </span>
      </div>
      <p className="mt-1 text-small text-text-muted">{DEFAULT_WORDS[effective].says}</p>
      {canChange && <p className="mt-1 text-small text-text-muted">Changing to off by default leaves today's switched-on skills on. It changes what happens to new and changed ones.</p>}
      <ShowAttention kind="alert" text={error} title="The default was not saved" onClose={clear} />
    </div>
  )
}

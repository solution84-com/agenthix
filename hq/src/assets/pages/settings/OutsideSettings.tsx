import { useState } from 'react'
import { useAction, useQuery, getAssetSettings, updateAssetSettings } from 'wasp/client/operations'
import { RefusedAction } from '../../../shared/components/RefusedAction'
import { refusalText } from '../../../shared/refusal'
import { ChoiceGroup, SettingBlock } from './ChoiceGroup'

const ON_BY_DEFAULT_WARNING =
  'On by default runs every skill found in files, including ones agents write, without anyone reviewing them first.'

/**
 * Unsigned assets, who may install from outside, skills found in files and personal skills (boards R2; spec parts 3 and
 * 4). Choosing "On by default" shows its warning first and goes ahead only once that is confirmed (security review H4).
 */
export function OutsideSettings() {
  const { data, error, refetch } = useQuery(getAssetSettings)
  const update = useAction(updateAssetSettings)
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const [confirming, setConfirming] = useState(false)

  if (error) return <RefusedAction reason={refusalText(error)} />
  if (!data) return <p className="text-small text-text-muted">Loading…</p>

  const change = async (next: Parameters<typeof update>[0]) => {
    setState({ busy: true, error: null })
    try {
      await update(next)
      setConfirming(false)
      setState({ busy: false, error: null })
    } catch (err) {
      setState({ busy: false, error: refusalText(err) })
    }
    void refetch()
  }

  return (
    <>
      <RefusedAction reason={state.error} onDismiss={() => setState({ busy: false, error: null })} className="mb-4" />
      <SettingBlock title="Unsigned assets" intro="An asset with no signature proves nothing about who made it.">
        <ChoiceGroup name="unsigned" label="Unsigned assets" value={data.unsignedAssets} disabled={state.busy}
          onChange={v => void change({ unsignedAssets: v })}
          choices={[
            { value: 'allowed', label: 'Allowed after a warning', help: 'The person installing reads it and confirms.' },
            { value: 'never', label: 'Never', help: 'Only signed assets install. Skills made here are unaffected.' },
          ]} />
      </SettingBlock>

      <SettingBlock title="Who may install from outside">
        <ChoiceGroup name="outside" label="Who may install from outside" value={data.outsideInstallers} disabled={state.busy}
          onChange={v => void change({ outsideInstallers: v })}
          choices={[
            { value: 'ADMINS', label: 'Administrators', help: 'Only administrators add assets from an upload or a link.' },
            { value: 'ADMINS_AND_MAINTAINERS', label: 'Administrators and Library maintainers', help: 'Library maintainers may then install new assets from outside, not only accept updates.' },
          ]} />
      </SettingBlock>

      <SettingBlock title="Skills found in files" intro="Skills in a project's files, its workspaces' repositories and Your space. A project can choose a stricter default.">
        <ChoiceGroup name="files" label="Skills found in files" value={data.fileSkillsDefault} disabled={state.busy}
          onChange={v => (v === 'ON' ? setConfirming(true) : void change({ fileSkillsDefault: v }))}
          choices={[
            { value: 'ON', label: 'On by default', help: 'Everything found runs. The place\'s administrators can switch one off.' },
            { value: 'OFF', label: 'Off by default', recommended: true, help: 'Everything found is listed and stays off until switched on. A skill that changes goes off again.' },
            { value: 'NEVER', label: 'Never', help: 'Skills in files aren\'t read. Only installed skills run.' },
          ]} />
        {confirming && data.fileSkillsDefault !== 'ON' && (
          <div role="alertdialog" aria-label="Turn skills in files on by default" className="mt-3 rounded-lg border border-warning/50 bg-warning/5 p-3" data-testid="on-by-default-warning">
            <p className="text-body text-text-primary">{ON_BY_DEFAULT_WARNING}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-body text-text-primary hover:bg-surface-hover" onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" disabled={state.busy} className="rounded-lg bg-accent px-3 py-1.5 text-body font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
                onClick={() => void change({ fileSkillsDefault: 'ON', confirmUnreviewed: true })}>Run them unreviewed</button>
            </div>
          </div>
        )}
      </SettingBlock>

      <SettingBlock title="Personal skills outside Your space" intro="A person's own skills can come with them into their own conversations in projects.">
        <ChoiceGroup name="personal" label="Personal skills outside Your space" value={data.personalSkillsOutsideSpace ? 'on' : 'off'} disabled={state.busy}
          onChange={v => void change({ personalSkillsOutsideSpace: v === 'on' })}
          choices={[
            { value: 'on', label: 'On', help: 'A person\'s own skills come with them into their own conversations in projects.' },
            { value: 'off', label: 'Off', help: 'They stay in Your space.' },
          ]} />
      </SettingBlock>
    </>
  )
}

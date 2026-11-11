import { useState } from 'react'
import { useAction, useQuery, getAssetSettings, updateAssetSettings } from 'wasp/client/operations'
import { refusalText } from '../../../shared/refusal'
import { ChoiceGroup, SettingBlock } from './ChoiceGroup'
import { ConfirmDialog } from '@agenthix/ui/primitives'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'

const ON_BY_DEFAULT_WARNING =
  'On by default runs every skill found in files, including ones agents write, without anyone reviewing them first.'

/**
 * Unsigned assets, who may install from outside, skills found in files and personal skills (boards R2; spec parts 3 and
 * 4). Choosing "On by default" shows its warning first and goes ahead only once that is confirmed (security review H4).
 */
export function OutsideSettings() {
  const query = useQuery(getAssetSettings)
  const { data, refetch } = query
  const read = useBackgroundRead(query, { what: 'The settings' })
  const update = useAction(updateAssetSettings)
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const [confirming, setConfirming] = useState(false)

  if (!data) return read.failedWithoutData ? read.nudge : <p className="text-small text-text-muted">Loading…</p>

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
      {read.nudge}
      <ShowAttention kind="alert" text={state.error} title="The settings were not saved" onClose={() => setState({ busy: false, error: null })} />
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
        <ConfirmDialog
          open={confirming && data.fileSkillsDefault !== 'ON'} title="Turn skills in files on by default?" description={ON_BY_DEFAULT_WARNING}
          confirmLabel="Run them unreviewed" destructive busy={state.busy}
          onCancel={() => setConfirming(false)} onConfirm={() => void change({ fileSkillsDefault: 'ON', confirmUnreviewed: true })}
        />
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

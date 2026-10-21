import { Part, ReadOnlyValue } from './Part'
import type { SettingsProject } from './types'

/** Chosen once, when the project is made; moving it is a later item. */
export function WhereItRuns({ project }: { project: SettingsProject }) {
  return (
    <Part label="Execution Site" htmlFor="set-site" hint="Its files are kept there, and its agents run there.">
      <ReadOnlyValue id="set-site">{project.executionSite?.label ?? 'None'}</ReadOnlyValue>
    </Part>
  )
}

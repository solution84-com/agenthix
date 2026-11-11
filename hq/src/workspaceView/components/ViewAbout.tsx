import { useState } from 'react'
import { Link } from 'react-router'
import { Modal, FOCUS_RING } from '@agenthix/ui/primitives'
import type { BranchLineView } from '../../branches/views'
import type { WorkflowPlace } from '../../workflows/pages/workflowTypes'
import { branchDetails, originText } from '../words'
import { DeployList } from './DeployList'

/**
 * *About* in the view: where the branch in view came from and how far it is from main (the one place besides the
 * branch menu that says so), *Deploy…* for main, and the way to the workspace's settings in its place.
 */
export function ViewAbout({ workspaceId, name, place, git, main, line, me, changes, settingsHref, onClose }: {
  workspaceId: string
  name: string
  place: WorkflowPlace
  git: boolean
  main: { name: string; versionCount: number } | null
  line: BranchLineView | null
  me: string | null
  changes: number | null
  /** The workspace's About in its place: its repository, site, tools and Delete. */
  settingsHref: string
  onClose: () => void
}) {
  const [deploy, setDeploy] = useState(false)
  const details = line ? branchDetails(line, me, changes) : ''
  return (
    <Modal open onClose={onClose} title={`About ${name}`}>
      <div className="space-y-3 text-small text-text-secondary" data-testid="view-about">
        {!git && <p>Without Git, this workspace is a folder of files: agents change them in place.</p>}
        {git && main && !line && <p><span className="font-mono text-text-primary">{main.name}</span> · Protected · version {main.versionCount}. It changes only by merging a branch.</p>}
        {line && (
          <p>
            <span className="font-mono text-text-primary">{line.name}</span> came from {originText(line.whose, me)}
            {details && <> · {details}</>}.
          </p>
        )}
        {git && (
          <div className="space-y-2">
            <button type="button" className={`rounded text-link hover:underline ${FOCUS_RING}`} aria-expanded={deploy} onClick={() => setDeploy(d => !d)}>Deploy…</button>
            {deploy && <DeployList place={place} workspaceId={workspaceId} />}
          </div>
        )}
        <p><Link to={settingsHref} className={`rounded text-link hover:underline ${FOCUS_RING}`}>Repository, site and tools</Link></p>
      </div>
    </Modal>
  )
}

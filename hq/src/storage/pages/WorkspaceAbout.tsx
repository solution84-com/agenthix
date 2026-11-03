import { useState } from 'react'
import { FileFact, FilesViewHeader } from '@agenthix/ui/projects'
import { repoName } from './BackupLine'
import { OperationsPanel } from './OperationsPanel'
import { WorkspaceToolsForm } from './WorkspaceToolsForm'
import type { Target } from './filesToolData'
import { allowedToolsText } from './workspaceNotices'

/**
 * A workspace's About (spec §3): its facts, its GitHub section (G3) — everything that is not its
 * files, one step from the explorer.
 */
export function WorkspaceAbout({ ws, target, siteLabel, onDisconnect, onBack }: {
  ws: { id: string; name: string; repoUrl: string | null; allowedTools: unknown }
  target: Target
  siteLabel: string | null
  onDisconnect: () => void
  onBack: () => void
}) {
  const [changingTools, setChangingTools] = useState(false)
  const allowedTools = Array.isArray(ws.allowedTools) ? (ws.allowedTools as string[]) : null
  return (
    <div>
      <FilesViewHeader back={ws.name} onBack={onBack} title="About" />
      <dl className="px-4 pt-2">
        <FileFact label="Repository">
          {ws.repoUrl
            ? <><a href={ws.repoUrl} target="_blank" rel="noopener noreferrer" className="font-mono hover:underline">{repoName(ws.repoUrl)}</a> · <button type="button" className="text-accent hover:underline" onClick={onDisconnect}>Disconnect</button></>
            : 'None'}
        </FileFact>
        <FileFact label="Site">{siteLabel ?? 'None'}</FileFact>
        <FileFact label="Tools agents may use">
          {allowedToolsText(allowedTools)} · <button type="button" className="text-accent hover:underline" aria-expanded={changingTools} onClick={() => setChangingTools(c => !c)}>Change</button>
        </FileFact>
      </dl>
      {changingTools && <div className="px-4"><WorkspaceToolsForm workspaceId={ws.id} allowedTools={allowedTools} onSaved={() => setChangingTools(false)} /></div>}
      {ws.repoUrl && <OperationsPanel target={target} />}
    </div>
  )
}

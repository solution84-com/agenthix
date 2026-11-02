import { Plus } from 'lucide-react'
import { Navigate } from 'react-router'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY, FilesQuietLine, FilesToolNote, FilesViewHeader, WorkspaceCard } from '@agenthix/ui/projects'
import { NoExecutionSiteNotice, useNoExecutionSite } from '../../shared/components/NoExecutionSiteNotice'
import { NewWorkspaceForm } from './NewWorkspaceForm'
import { WorkspaceView } from './WorkspaceView'
import { repoName } from './BackupLine'
import { useWorkspaces, type Owner } from './filesToolData'
import { silentSitesLine } from './workspaceNotices'
import { SilentSitesLine } from './SilentSitesLine'
import { useToolParams } from './useToolParams'
import { workspaceViewPath } from '../../workspaceView/viewAddress'

/**
 * The Workspaces tool (every screen reviewed spec §3): one card per codebase, a workspace opening inside the tool,
 * and a new one made in place. A site that does not answer is one quiet line with the names behind it.
 */
export function WorkspacesTool({ owner, siteLabel }: { owner: Owner; siteLabel: string | null }) {
  const url = useToolParams()
  const { workspaces, unanswered, isLoading } = useWorkspaces(owner)
  const noSite = useNoExecutionSite()
  const id = url.get('workspace')
  const back = () => url.set({ workspace: null, new: null, connect: null, wfile: null, wabout: null })

  if (url.get('new')) {
    return <NewWorkspaceForm owner={owner} siteLabel={siteLabel} onBack={back} onCreated={ws => url.set({ new: null, workspace: ws })} />
  }
  // A workspace opens full screen (live preview spec, part 1). Its About and Connect GitHub stay here, in the tool.
  if (id && !url.get('wabout') && url.get('connect') !== '1') return <Navigate to={workspaceViewPath(id)} replace />
  if (id) return <WorkspaceView workspaceId={id} siteLabel={siteLabel} connecting={url.get('connect') === '1'} onBack={back} />

  const silent = silentSitesLine(unanswered)
  return (
    <div className="bg-surface-1">
      <FilesViewHeader
        title="Workspaces"
        action={<button type="button" disabled={noSite} onClick={() => url.set({ new: '1' })} className={FILES_BUTTON_PRIMARY}><Plus size={13} aria-hidden /> New</button>}
      />
      <FilesToolNote>The codebases agents build in. A conversation here can work in any of them.</FilesToolNote>
      <div className="px-4 pt-2"><NoExecutionSiteNotice /></div>
      <div className="pt-3">
        {(workspaces ?? []).map(w => (
          <WorkspaceCard
            key={w.id}
            name={w.name}
            repository={w.repoUrl ? repoName(w.repoUrl) : null}
            site={siteLabel}
            onOpen={() => url.set({ workspace: w.id })}
            previewRunning={false}
            action={w.repoUrl ? undefined : (
              <button type="button" className={FILES_BUTTON} onClick={() => url.set({ workspace: w.id, connect: '1' })}>Connect GitHub</button>
            )}
          />
        ))}
      </div>
      <SilentSitesLine unanswered={unanswered} />
      {/* Only when every site answered: a workspace held on a silent site would make "none yet" untrue. */}
      {workspaces && workspaces.length === 0 && !silent && !noSite && (
        <FilesQuietLine>No workspaces yet. “New” makes one, or ask in a conversation: “set up a docs site in a new workspace”.</FilesQuietLine>
      )}
      {isLoading && !workspaces && <FilesQuietLine>Loading…</FilesQuietLine>}
    </div>
  )
}

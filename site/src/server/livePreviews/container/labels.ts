/**
 * What marks a container or network as a live preview's: `<namespace>.live-preview=<id>`, with its workspace, person
 * and project beside it, the agents' compose group, and this site's own id. The guard and the sweeps find a live
 * preview's things by these labels alone, so another site on the same Docker is never touched; nothing parses a name
 * back.
 */
import { labelKey, resolveComposeProjectName, siteIdFilterArgs, siteIdLabel, siteNamespace } from '../../../agents/runtime/containerLabels'

export const livePreviewLabelKey = (): string => labelKey('live-preview')

export type LabelledPreview = { id: string; workspaceId: string; personId: string; projectId: string | null }

export function livePreviewLabels(lp: LabelledPreview, service = 'live-preview'): Record<string, string> {
  return {
    'com.docker.compose.project': resolveComposeProjectName(),
    'com.docker.compose.service': service,
    [livePreviewLabelKey()]: lp.id,
    [labelKey('workspace')]: lp.workspaceId,
    [labelKey('person')]: lp.personId,
    ...(lp.projectId ? { [labelKey('project')]: lp.projectId } : {}),
    ...siteIdLabel(),
  }
}

/** `docker ps` / `docker network ls` filters for everything of one live preview, in this install's group only. */
export function livePreviewFilters(id: string): string[] {
  return ['--filter', `label=${livePreviewLabelKey()}=${id}`, '--filter', `label=com.docker.compose.project=${resolveComposeProjectName()}`, ...siteIdFilterArgs()]
}

/** The filters for every live preview's things in this install. */
export function anyLivePreviewFilters(): string[] {
  return ['--filter', `label=${livePreviewLabelKey()}`, '--filter', `label=com.docker.compose.project=${resolveComposeProjectName()}`, ...siteIdFilterArgs()]
}

/** The live preview's own container: `<namespace>-live-preview-<id>`. */
export function livePreviewContainerName(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`Not a live preview's id: ${JSON.stringify(id)}`)
  return `${siteNamespace()}-live-preview-${id}`
}

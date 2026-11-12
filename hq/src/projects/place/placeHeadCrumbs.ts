import type { Breadcrumb } from '../../shared/layouts/ScreenBar'
import { SPACE_PATH } from '../../chat/chatPlacePaths'

/**
 * The start of the breadcrumb of a page inside a project: *Projects* then the project, or just *Your space* for the
 * person's own space, which is not under Projects and is shown by its own name.
 */
export function placeHeadCrumbs(place: { homePath: string; name: string } | undefined, projectName?: string): Breadcrumb[] {
  if (place?.homePath === SPACE_PATH) return [{ label: place.name, href: place.homePath, list: 'projects' }]
  return [
    { label: 'Projects', href: '/projects' },
    ...(projectName ? [{ label: projectName, href: place?.homePath, list: 'projects' as const }] : []),
  ]
}

import { TimelineScreen } from './TimelineScreen'

/** The Timeline tool of a project (spec §3): the whole project, a lane per board, opening on Month. */
export function ProjectTimelineTool({ projectId }: { projectId: string }) {
  return <TimelineScreen projectId={projectId} initialScale="month" />
}

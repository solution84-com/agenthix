import { TimelineScreen } from './TimelineScreen'

/** A board's own Timeline, switched to from its columns (spec §3): its sprints as bands, opening on Week. */
export function BoardTimeline({ projectId, boardId }: { projectId: string; boardId: string }) {
  return <TimelineScreen projectId={projectId} boardId={boardId} initialScale="week" />
}

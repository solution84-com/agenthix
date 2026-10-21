import type { TimelineData, TimelineEpicData, TimelineTaskData } from '@agenthix/ui/timeline'

/** Thursday 8 October 2026, the viewer's own noon. */
export const NOW = new Date(2026, 9, 8, 12, 0, 0)

let n = 0
export function task(over: Partial<TimelineTaskData> = {}): TimelineTaskData {
  n += 1
  return {
    id: `t${n}`, key: `WEB-${n}`, title: `Task ${n}`, boardId: 'b1', column: 'doing', status: 'IN_PROGRESS', runState: 'RUN_NONE',
    needsYou: false, assignedAgent: null, epicId: null, planStart: null, planFinish: null, startAt: null, roundAt: null, routineId: null,
    ...over,
  }
}

export function epic(over: Partial<TimelineEpicData> = {}): TimelineEpicData {
  return { ...task(over), span: null, taskIds: [], ...over } as TimelineEpicData
}

export function data(over: Partial<TimelineData> = {}): TimelineData {
  return {
    boards: [{ id: 'b1', name: 'Project Tasks', kind: 'PROJECT_TASKS', backlogCount: 3, sprints: [] }],
    tasks: [], epics: [], milestones: [], routineRounds: [],
    runs: { slices: [], unavailable: null, truncated: false },
    ...over,
  }
}

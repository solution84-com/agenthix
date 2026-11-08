/** Where Sprints and its pages are. Sprints is a project's section (`?tool=sprints`); Plan Sprint a page of its own. */
const project = (projectKey: string) => `/projects/${encodeURIComponent(projectKey)}`

export const SPRINTS_SECTION = 'sprints'

export const sprintsPath = (projectKey: string) => `${project(projectKey)}?tool=${SPRINTS_SECTION}`

export const planSprintPath = (projectKey: string, sprintId: string) =>
  `${project(projectKey)}/sprints/${encodeURIComponent(sprintId)}/plan`

/** The project's board filtered to one sprint (D8: a sprint board is any board filtered to it), grouped as last grouped. */
export const sprintBoardPath = (projectKey: string, sprintId: string) =>
  `${project(projectKey)}?tool=boards&sprint=${encodeURIComponent(sprintId)}`

export const taskPath = (taskKey: string) => `/tasks/${encodeURIComponent(taskKey)}`

import { useQuery, getProjects } from 'wasp/client/operations'

/** Shown beside a control a project Viewer cannot use, and as the line at the top of what they read (adr-0102). */
export const VIEWER_CANNOT_WORK = "You're a Viewer here: you can read this project but not change it. Ask one of its admins to make you a Member."

type ProjectStanding = { id: string; key: string; isMember: boolean; myRole: 'ADMIN' | 'MEMBER' | 'VIEWER' | null }

/**
 * Whether the signed-in person works in each project: a Member or Admin of it,
 * or its owner when it is their own Chat. A Viewer reads and changes nothing
 * (adr-0102). The server refuses regardless, so this only keeps the controls
 * from offering what would be refused. Until the projects have loaded, and for
 * a project not known yet, the controls stay enabled rather than flashing
 * disabled.
 */
export function useMayWorkWhere(by: 'id' | 'key' = 'id'): (project: string | null | undefined) => boolean {
  const { data } = useQuery(getProjects)
  const projects: ProjectStanding[] | undefined = Array.isArray(data) ? data : undefined
  return (ref) => {
    const project = ref ? projects?.find(p => p[by] === ref) : undefined
    if (!project) return true
    return project.isMember && project.myRole !== 'VIEWER'
  }
}

export function useMayWork(projectId: string | null | undefined): boolean {
  return useMayWorkWhere()(projectId)
}

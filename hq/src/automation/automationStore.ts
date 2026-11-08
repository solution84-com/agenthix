/** Reads the organisation's limits on what agents may start, and a project's own choice of them. */
import { prisma } from 'wasp/server'
import { agentsMaySchedule, orgAutomationFromRow, type OrgAutomation } from './automationSettings'

export async function loadOrgAutomation(): Promise<OrgAutomation> {
  return orgAutomationFromRow(await prisma.org.findFirst({ select: { automationAgentSchedules: true, automationMaxDepth: true } }))
}

/** Whether agents in this project may set start times when a person asks, read now. */
export async function projectAgentsMaySchedule(projectId: string): Promise<boolean> {
  const [org, project] = await Promise.all([
    loadOrgAutomation(),
    prisma.project.findUnique({ where: { id: projectId }, select: { agentSchedules: true } }),
  ])
  return agentsMaySchedule(org, project)
}

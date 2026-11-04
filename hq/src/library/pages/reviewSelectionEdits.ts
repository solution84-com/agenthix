import type { ApplicationSelections, AgentSelection, TeamSelection } from '../workforceTemplateTypes'

/** The review page's edits to a person's selections, each returning the new selections. */
const inTeam = (s: ApplicationSelections, teamName: string, edit: (t: TeamSelection) => TeamSelection): ApplicationSelections =>
  ({ ...s, teams: s.teams.map(t => (t.name === teamName ? edit(t) : t)) })

const inAgent = (s: ApplicationSelections, teamName: string, handle: string, edit: (a: AgentSelection) => AgentSelection): ApplicationSelections =>
  inTeam(s, teamName, t => ({ ...t, agents: t.agents.map(a => (a.handle === handle ? edit(a) : a)) }))

export const toggleTeam = (s: ApplicationSelections, teamName: string) =>
  inTeam(s, teamName, t => ({ ...t, include: !t.include }))

export const toggleAgent = (s: ApplicationSelections, teamName: string, handle: string) =>
  inAgent(s, teamName, handle, a => ({ ...a, include: !a.include }))

export const toggleSkill = (s: ApplicationSelections, teamName: string, handle: string, slug: string) =>
  inAgent(s, teamName, handle, a => ({ ...a, skills: a.skills.map(k => (k.slug === slug ? { ...k, include: !k.include } : k)) }))

export const setResolvedHandle = (s: ApplicationSelections, teamName: string, handle: string, resolvedHandle: string) =>
  inAgent(s, teamName, handle, a => ({ ...a, resolvedHandle }))

export const toggleProject = (s: ApplicationSelections, projectName: string): ApplicationSelections =>
  ({ ...s, projects: s.projects.map(p => (p.name === projectName ? { ...p, include: !p.include } : p)) })

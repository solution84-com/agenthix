import type { AgentSkillsView } from './types'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The page's counts in words, never a bare sum: "2 built in · 1 given to Kernel". */
export function summaryLine(view: Pick<AgentSkillsView, 'agent' | 'builtIn' | 'everyAgent' | 'thisAgent' | 'places'>): string {
  const placeSkills = view.places.reduce((n, p) => n + p.on, 0)
  return [
    `${view.builtIn.filter(b => b.on).length} built in`,
    view.everyAgent.length > 0 ? `${view.everyAgent.length} given to every agent` : null,
    view.thisAgent.length > 0 ? `${view.thisAgent.length} given to ${view.agent.name}` : null,
    placeSkills > 0 ? `${plural(placeSkills, 'skill', 'skills')} switched on in ${plural(view.places.length, 'project', 'projects')}` : null,
  ].filter(Boolean).join(' · ')
}

/** Why the "In your projects" list is empty: the agent works only in projects it is assigned to. */
export function noPlacesText(agentName: string, hiddenPlaces: number): string {
  return hiddenPlaces > 0
    ? `${agentName} isn't in any project you're in. It works in ${plural(hiddenPlaces, 'project', 'projects')} you aren't in; their administrators switch their skills.`
    : `${agentName} isn't assigned to any project you're in, so no project's skills apply to it yet.`
}

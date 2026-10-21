import type { SprintInfo } from './types'

/** A sprint's name, with its number as a small marker beside it once it has been renamed ("Sprint 12 · Pricing push"). */
export function SprintTag({ sprint }: { sprint: Pick<SprintInfo, 'number' | 'name'> }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-md border border-accent px-1.5 text-micro text-accent">Sprint {sprint.number}</span>
      {sprint.name && <b className="text-small font-semibold text-text-primary">{sprint.name}</b>}
    </span>
  )
}

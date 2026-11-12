import type { DemoSeed } from './seed.js'

/** The ids of what hq and the site both write, by the keys the data names them with. */
export type SeedIds = {
  people: Record<string, string>
  teams: Record<string, string>
  agents: Record<string, string>
  projects: Record<string, string>
  tasks: Record<string, string>
}

const byKey = (rows: { key: string; id: string }[]): Record<string, string> => Object.fromEntries(rows.map(r => [r.key, r.id]))

export function seedIds(seed: DemoSeed): SeedIds {
  const o = seed.organisation
  return { people: byKey(o.people), teams: byKey(o.teams), agents: byKey(o.agents), projects: byKey(o.projects), tasks: byKey(o.tasks) }
}

/** The id for a key; a key the data does not hold is a bug in the data (the loader checks them), so it throws. */
export function idFor(ids: Record<string, string>, key: string, what: string): string {
  const id = ids[key]
  if (!id) throw new Error(`The demo seed names a ${what} ${key} that it does not hold.`)
  return id
}

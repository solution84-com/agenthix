/** The words of Publish (or Propose) as task template (spec D16, TM2). Pure. */

/** "In the Library as fernhill/launch-work, version 1.0.0: the first." */
export function identityWords(publisher: string | null, name: string, publishes: boolean): string {
  if (!name) return 'Its name in the Library is made from this: lowercase letters, digits and hyphens.'
  const identity = publisher ? `${publisher}/${name}` : name
  return publishes
    ? `In the Library as ${identity}, version 1.0.0: the first.`
    : `In the Library as ${identity}, the first version, 1.0.0, when a maintainer publishes it.`
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "It will hold 2 types and 1 field. No tasks, boards or sprints go with it." */
export function holdsWords(types: number, fields: number): string {
  const parts = [types ? count(types, 'type', 'types') : '', fields ? count(fields, 'field', 'fields') : ''].filter(Boolean)
  const holds = parts.length ? `It will hold ${parts.join(' and ')}.` : 'It holds nothing yet: tick a type or a field.'
  return `${holds} No tasks, boards or sprints go with it.`
}
